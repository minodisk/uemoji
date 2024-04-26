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
  storage.init();

  await chrome.alarms.create("etl", { periodInMinutes: 60 * 24 });
  chrome.alarms.onAlarm.addListener(async (alarm) => {
    switch (alarm.name) {
      case "etl":
        await execEtl(await storage.getTeam());
        break;
    }
  });

  storage.onChangeTeam(async (team: string) => {
    console.log("change:", team);
    await execEtl(team);
  });

  await execEtl(await storage.getTeam());
}

main().catch(console.error);
