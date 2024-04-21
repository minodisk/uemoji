import { etl } from "./etl";

const execEtl = async () => {
  console.log("exec etl:", new Date());
  await etl();
};

async function main() {
  await chrome.alarms.create("etl", { periodInMinutes: 60 * 24 });
  chrome.alarms.onAlarm.addListener(async (alarm) => {
    switch (alarm.name) {
      case "etl":
        await execEtl();
        break;
    }
  });

  await execEtl();
}

main().catch(console.error);
