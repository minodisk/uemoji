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

  await chrome.alarms.create("etl", { periodInMinutes: 60 * 24 });
  chrome.alarms.onAlarm.addListener((alarm) => {
    (async () => {
      switch (alarm.name) {
        case "etl":
          await execEtl(await storage.getTeam());
          break;
      }
    })().catch(console.error);
  });

  storage.onChangeTeam((team: string) => {
    (async () => {
      console.log("change:", team);
      await execEtl(team);
    })().catch(console.error);
  });

  await execEtl(await storage.getTeam());
}

main().catch(console.error);
