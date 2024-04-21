import type { SlackTeam } from "shared";
import { makeSlack, makeStorage } from "shared";

async function main() {
  console.log("hello popup");
  const select = document.getElementById("slack-team");
  if (!select) {
    throw new Error("no select element");
  }

  const fillTeams = (teams: SlackTeam[], selectedTeamDomain: string) => {
    select.innerHTML = "";

    const option = document.createElement("option");
    option.text = "-";
    option.value = "";
    select.appendChild(option);
    teams.forEach((team) => {
      const option = document.createElement("option");
      option.text = team.team_name;
      option.value = team.team_domain;
      if (team.team_domain === selectedTeamDomain) {
        option.selected = true;
      }
      select.appendChild(option);
    });
  };

  const storage = makeStorage();

  const team = await storage.getTeam();

  let teams = await storage.getTeams();
  console.log("teams from storage:", teams, team);
  fillTeams(teams, team);

  const slack = makeSlack();
  teams = await slack.getTeams();
  console.log("teams from api:", teams);
  fillTeams(teams, team);

  await storage.setTeams(teams);

  select.addEventListener("change", async (e) => {
    const teamDomain = (e.target as HTMLSelectElement).value;
    console.log("selected team:", teamDomain);
    await storage.setTeam(teamDomain);
  });
}

main().catch(console.error);
