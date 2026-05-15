import { makeStorage } from "shared";
import {
  type SyncBatchState,
  finalizeBatch,
  prepareBatch,
  processFromIndex,
} from "./sync";

const storage = makeStorage();

const ALARM_SYNC = "sync";
const ALARM_SYNC_CONTINUE = "sync-continue";
const PERIOD_MINUTES = 180;

let syncRunning = false;

const runSync = async (teamName: string) => {
  if (!teamName) {
    return;
  }
  if (syncRunning) {
    console.log("sync already running, skipping");
    return;
  }
  syncRunning = true;
  try {
    // バッチ状態確認
    const { syncBatch } = (await chrome.storage.local.get("syncBatch")) as {
      syncBatch?: SyncBatchState;
    };

    let batch: SyncBatchState;
    if (
      syncBatch &&
      syncBatch.teamName === teamName &&
      syncBatch.processedIndex < syncBatch.userEmojis.length
    ) {
      // 前回の続きから再開
      console.log(
        `resuming sync: ${syncBatch.processedIndex}/${syncBatch.userEmojis.length}`,
      );
      batch = syncBatch;
    } else {
      // 新規バッチ開始
      batch = await prepareBatch(teamName);
      await chrome.storage.local.set({ syncBatch: batch });
    }

    batch = await processFromIndex(batch);

    if (batch.processedIndex >= batch.userEmojis.length) {
      // 全件完了
      await finalizeBatch(batch);
      await chrome.storage.local.remove("syncBatch");
      await chrome.storage.local.set({
        lastSyncCompleted: new Date().toISOString(),
      });
      console.log("sync batch complete");
    } else {
      // killされて途中で終わった場合はここに来ない(killされるので)が、
      // 念のため継続alarmをスケジュール
      await chrome.alarms.create(ALARM_SYNC_CONTINUE, { delayInMinutes: 1 });
      console.log("sync batch interrupted, scheduled continue");
    }
  } finally {
    syncRunning = false;
  }
};

chrome.alarms.onAlarm.addListener(async (alarm) => {
  const now = new Date().toISOString();
  console.log("onAlarm:", now, alarm);
  await chrome.storage.local.set({ lastAlarmFired: now });
  switch (alarm.name) {
    case ALARM_SYNC:
    case ALARM_SYNC_CONTINUE:
      await storage.init();
      await runSync(await storage.getTeam());
      break;
  }
});

chrome.runtime.onInstalled.addListener(async (reason) => {
  console.log("onInstalled:", reason);
  await chrome.alarms.create(ALARM_SYNC, {
    delayInMinutes: 1,
    periodInMinutes: PERIOD_MINUTES,
  });
  await storage.init();
  await runSync(await storage.getTeam());
});

// Service Worker復帰時にalarmが消えていたら再作成、バッチ途中なら継続alarmも作成
chrome.alarms.get(ALARM_SYNC).then(async (alarm) => {
  console.log("existing alarm:", alarm);
  if (!alarm) {
    console.log("alarm not found, recreating");
    await chrome.alarms.create(ALARM_SYNC, {
      delayInMinutes: 1,
      periodInMinutes: PERIOD_MINUTES,
    });
  }

  // バッチ途中なら継続alarm作成
  const { syncBatch } = (await chrome.storage.local.get("syncBatch")) as {
    syncBatch?: SyncBatchState;
  };
  if (syncBatch && syncBatch.processedIndex < syncBatch.userEmojis.length) {
    const existing = await chrome.alarms.get(ALARM_SYNC_CONTINUE);
    if (!existing) {
      console.log(
        `batch in progress (${syncBatch.processedIndex}/${syncBatch.userEmojis.length}), scheduling continue`,
      );
      await chrome.alarms.create(ALARM_SYNC_CONTINUE, { delayInMinutes: 1 });
    }
  }

  const all = await chrome.alarms.getAll();
  console.log("all alarms:", all);
});

storage.onChangeTeam((team: string) => {
  (async () => {
    console.log("onChangeTeam:", team);
    // チーム変更時は進行中バッチをクリア
    await chrome.storage.local.remove("syncBatch");
    await runSync(team);
  })().catch(console.error);
});

storage
  .init()
  .then(() => {
    console.log("background");
  })
  .catch(console.error);
