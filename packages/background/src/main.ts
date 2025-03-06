import { makeStorage } from "shared";
import { etl } from "./etl";

const execEtl = async (teamName: string) => {
  if (!teamName) {
    return;
  }
  await etl(teamName);
};

async function main() {
  const storage = makeStorage();
  await storage.init();

  chrome.alarms.onAlarm.addListener(async (alarm) => {
    console.log("onAlarm:", new Date(), alarm);
    switch (alarm.name) {
      case "etl":
        await execEtl(await storage.getTeam());
        break;
    }
  });

  chrome.runtime.onInstalled.addListener(async (reason) => {
    console.log("onInstalled:", reason);
    await execEtl(await storage.getTeam());
  });

  storage.onChangeTeam((team: string) => {
    (async () => {
      console.log("onChangeTeam:", team);
      await execEtl(team);
    })().catch(console.error);
  });

  await chrome.alarms.clear("etl");
  await chrome.alarms.create("etl", { periodInMinutes: 60 * 12 });

  console.log("background");
}

main().catch(console.error);
