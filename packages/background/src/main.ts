import { makeStorage } from "shared";
import { etl } from "./etl";

const storage = makeStorage();

let etlRunning = false;
const execEtl = async (teamName: string) => {
  if (!teamName) {
    return;
  }
  if (etlRunning) {
    console.log("etl already running, skipping");
    return;
  }
  etlRunning = true;
  try {
    await etl(teamName);
  } finally {
    etlRunning = false;
  }
};

chrome.alarms.onAlarm.addListener(async (alarm) => {
  const now = new Date().toISOString();
  console.log("onAlarm:", now, alarm);
  await chrome.storage.local.set({ lastAlarmFired: now });
  switch (alarm.name) {
    case "etl":
      await storage.init();
      await execEtl(await storage.getTeam());
      await chrome.storage.local.set({ lastEtlCompleted: now });
      break;
  }
});

chrome.runtime.onInstalled.addListener(async (reason) => {
  console.log("onInstalled:", reason);
  await chrome.alarms.create("etl", { delayInMinutes: 1, periodInMinutes: 180 });
  await storage.init();
  await execEtl(await storage.getTeam());
});

// Service Worker復帰時にalarmが消えていたら再作成
chrome.alarms.get("etl").then(async (alarm) => {
  console.log("existing alarm:", alarm);
  if (!alarm) {
    console.log("alarm not found, recreating");
    await chrome.alarms.create("etl", { delayInMinutes: 1, periodInMinutes: 180 });
  }
  const all = await chrome.alarms.getAll();
  console.log("all alarms:", all);
});

storage.onChangeTeam((team: string) => {
  (async () => {
    console.log("onChangeTeam:", team);
    await execEtl(team);
  })().catch(console.error);
});

storage.init().then(() => {
  console.log("background");
}).catch(console.error);
