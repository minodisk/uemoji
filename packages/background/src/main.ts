import { makeStorage } from "shared";
import {
  type SyncBatchState,
  finalizeBatch,
  prepareBatch,
  processFromIndex,
  refreshAvatarUrls,
} from "./sync";

const storage = makeStorage();

const ALARM_SYNC = "sync";
const ALARM_SYNC_CONTINUE = "sync-continue";
const POST_SYNC_DELAY_MINUTES = 60;
const FALLBACK_DELAY_MINUTES = 1;

let syncRunning = false;

const scheduleNextSync = async () => {
  await chrome.alarms.create(ALARM_SYNC, {
    delayInMinutes: POST_SYNC_DELAY_MINUTES,
  });
  console.log(`next sync scheduled in ${POST_SYNC_DELAY_MINUTES}min`);
};

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
    // Check for an in-progress batch
    const { syncBatch } = (await chrome.storage.local.get("syncBatch")) as {
      syncBatch?: SyncBatchState;
    };

    let batch: SyncBatchState;
    if (
      syncBatch &&
      syncBatch.teamName === teamName &&
      syncBatch.processedIndex < syncBatch.userEmojis.length
    ) {
      // Resume from the previous run. Avatar URLs snapshotted at
      // prepareBatch time may be stale, so re-fetch users.list and
      // refresh them before processing
      console.log(
        `resuming sync: ${syncBatch.processedIndex}/${syncBatch.userEmojis.length}`,
      );
      batch = await refreshAvatarUrls(syncBatch);
      await chrome.storage.local.set({ syncBatch: batch });
    } else {
      // Start a new batch
      batch = await prepareBatch(teamName);
      await chrome.storage.local.set({ syncBatch: batch });
    }

    batch = await processFromIndex(batch);

    if (batch.processedIndex >= batch.userEmojis.length) {
      // All entries processed
      await finalizeBatch(batch);
      await chrome.storage.local.remove("syncBatch");
      await chrome.storage.local.set({
        lastSyncCompleted: new Date().toISOString(),
      });
      console.log("sync batch complete");
      // Schedule the next sync POST_SYNC_DELAY_MINUTES after completion
      await scheduleNextSync();
    } else {
      // When the service worker is killed mid-batch we never reach
      // here, but schedule a continue alarm just in case
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
    delayInMinutes: FALLBACK_DELAY_MINUTES,
  });
  await storage.init();
  await runSync(await storage.getTeam());
});

// On service worker wake-up, recreate the alarm if it's gone, and
// schedule a continue alarm if a batch is in progress
chrome.alarms.get(ALARM_SYNC).then(async (alarm) => {
  console.log("existing alarm:", alarm);

  const { syncBatch } = (await chrome.storage.local.get("syncBatch")) as {
    syncBatch?: SyncBatchState;
  };
  const batchInProgress =
    !!syncBatch && syncBatch.processedIndex < syncBatch.userEmojis.length;

  if (!alarm && !batchInProgress) {
    // Safety net: schedule the next sync if neither an alarm nor a batch exists
    console.log("alarm not found, recreating");
    await scheduleNextSync();
  }

  if (batchInProgress) {
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
    // Clear the in-progress batch when the team changes
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
