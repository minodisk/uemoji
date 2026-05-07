import { makeStorage } from "shared";
import {
  type EtlBatchState,
  finalizeBatch,
  prepareBatch,
  processFromIndex,
} from "./etl";

const storage = makeStorage();

const ALARM_ETL = "etl";
const ALARM_ETL_CONTINUE = "etl-continue";
const PERIOD_MINUTES = 180;

let etlRunning = false;

const runEtl = async (teamName: string) => {
  if (!teamName) {
    return;
  }
  if (etlRunning) {
    console.log("etl already running, skipping");
    return;
  }
  etlRunning = true;
  try {
    // バッチ状態確認
    const { etlBatch } = (await chrome.storage.local.get("etlBatch")) as {
      etlBatch?: EtlBatchState;
    };

    let batch: EtlBatchState;
    if (
      etlBatch &&
      etlBatch.teamName === teamName &&
      etlBatch.processedIndex < etlBatch.userEmojis.length
    ) {
      // 前回の続きから再開
      console.log(
        `resuming etl: ${etlBatch.processedIndex}/${etlBatch.userEmojis.length}`,
      );
      batch = etlBatch;
    } else {
      // 新規バッチ開始
      batch = await prepareBatch(teamName);
      await chrome.storage.local.set({ etlBatch: batch });
    }

    batch = await processFromIndex(batch);

    if (batch.processedIndex >= batch.userEmojis.length) {
      // 全件完了
      await finalizeBatch(batch);
      await chrome.storage.local.remove("etlBatch");
      await chrome.storage.local.set({
        lastEtlCompleted: new Date().toISOString(),
      });
      console.log("etl batch complete");
    } else {
      // killされて途中で終わった場合はここに来ない(killされるので)が、
      // 念のため継続alarmをスケジュール
      await chrome.alarms.create(ALARM_ETL_CONTINUE, { delayInMinutes: 1 });
      console.log("etl batch interrupted, scheduled continue");
    }
  } finally {
    etlRunning = false;
  }
};

chrome.alarms.onAlarm.addListener(async (alarm) => {
  const now = new Date().toISOString();
  console.log("onAlarm:", now, alarm);
  await chrome.storage.local.set({ lastAlarmFired: now });
  switch (alarm.name) {
    case ALARM_ETL:
    case ALARM_ETL_CONTINUE:
      await storage.init();
      await runEtl(await storage.getTeam());
      break;
  }
});

chrome.runtime.onInstalled.addListener(async (reason) => {
  console.log("onInstalled:", reason);
  await chrome.alarms.create(ALARM_ETL, {
    delayInMinutes: 1,
    periodInMinutes: PERIOD_MINUTES,
  });
  await storage.init();
  await runEtl(await storage.getTeam());
});

// Service Worker復帰時にalarmが消えていたら再作成、バッチ途中なら継続alarmも作成
chrome.alarms.get(ALARM_ETL).then(async (alarm) => {
  console.log("existing alarm:", alarm);
  if (!alarm) {
    console.log("alarm not found, recreating");
    await chrome.alarms.create(ALARM_ETL, {
      delayInMinutes: 1,
      periodInMinutes: PERIOD_MINUTES,
    });
  }

  // バッチ途中なら継続alarm作成
  const { etlBatch } = (await chrome.storage.local.get("etlBatch")) as {
    etlBatch?: EtlBatchState;
  };
  if (etlBatch && etlBatch.processedIndex < etlBatch.userEmojis.length) {
    const existing = await chrome.alarms.get(ALARM_ETL_CONTINUE);
    if (!existing) {
      console.log(
        `batch in progress (${etlBatch.processedIndex}/${etlBatch.userEmojis.length}), scheduling continue`,
      );
      await chrome.alarms.create(ALARM_ETL_CONTINUE, { delayInMinutes: 1 });
    }
  }

  const all = await chrome.alarms.getAll();
  console.log("all alarms:", all);
});

storage.onChangeTeam((team: string) => {
  (async () => {
    console.log("onChangeTeam:", team);
    // チーム変更時は進行中バッチをクリア
    await chrome.storage.local.remove("etlBatch");
    await runEtl(team);
  })().catch(console.error);
});

storage
  .init()
  .then(() => {
    console.log("background");
  })
  .catch(console.error);
