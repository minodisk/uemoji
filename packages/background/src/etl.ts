import type { SlackEmoji } from "shared";
import { makeTeam } from "shared";

export const etl = async (teamName: string) => {
  const team = await makeTeam(teamName);

  const users = (await team.getUsers()).filter(
    (user) =>
      !user.deleted &&
      !user.is_bot &&
      !user.is_app_user &&
      !user.is_forgotten &&
      !user.is_restricted &&
      !user.is_ultra_restricted &&
      !!user.profile &&
      (!!user.profile.image_72 ||
        !!user.profile.image_48 ||
        !!user.profile.image_32 ||
        !!user.profile.image_24),
  );
  const userEmojis = users.map((user) => {
    const name = normalize(user.name);

    let aliases = parseNames(user.real_name);
    if (user.profile.display_name) {
      aliases = [...aliases, ...parseNames(user.profile.display_name)];
    }
    aliases = Array.from(new Set(aliases)).filter((alias) => alias !== name);

    return {
      name,
      aliases,
      url:
        user.profile.image_72 ||
        user.profile.image_48 ||
        user.profile.image_32 ||
        user.profile.image_24,
    };
  });

  const noPermissions: Set<string> = new Set();
  const taken: Set<string> = new Set();
  for (const { name, aliases, url } of userEmojis) {
    switch (await team.removeEmoji(name)) {
      case "no_permission":
        noPermissions.add(name);
        break;
    }
    switch (await team.addEmoji(name, url)) {
      case "error_name_taken":
        taken.add(name);
        break;
    }
    for (let alias of aliases) {
      let err = undefined;
      for (;;) {
        err = await team.aliasEmoji(alias, name);
        switch (err) {
          case "error_name_taken_i18n":
            alias += "_";
            continue;
          case "error_name_taken":
            if (!taken.has(name)) {
              taken.add(alias);
            }
            break;
        }
        break;
      }
    }
  }
  console.log("done");
  console.log("no permission:", Array.from(noPermissions));
  console.log("taken:", Array.from(taken));

  const toBeRemoved = new Set<string>();
  for (const n of noPermissions) {
    toBeRemoved.add(n);
  }
  for (const n of taken) {
    toBeRemoved.add(n);
  }

  const emojis = await team.getEmojis();
  const nameToEmoji = new Map(emojis.map((emoji) => [emoji.name, emoji]));
  const userToEmojis = new Map<string, SlackEmoji[]>();

  for (const name of toBeRemoved) {
    const emoji = nameToEmoji.get(name);
    if (!emoji) {
      continue;
    }
    console.log(emoji.name, emoji.user_display_name, emoji.user_id);
    const emojis = userToEmojis.get(emoji.user_id);
    if (!emojis) {
      userToEmojis.set(emoji.user_id, [emoji]);
    } else {
      emojis.push(emoji);
    }
  }
  for (const [user_id, emojis] of userToEmojis) {
    console.log(`${user_id}(${emojis[0]?.user_display_name}):`);
    for (const emoji of emojis) {
      console.log("  ", emoji.name);
    }
  }

  return;
};

const rTemporary = /(?:[(（].*[)）]|\d+\\\d+)/g;
const rEmoji = /^[0-9a-zA-Z_-]+$/;
const rNumeric = /^[0-9_-]+$/;
const rInvalid = /[.\s]+/g;
const parseNames = (raw: string) =>
  raw
    .replace(rTemporary, "")
    .split("/")
    .map(normalize)
    .filter((name) => !!name && rEmoji.test(name) && !rNumeric.test(name));

const normalize = (raw: string) =>
  raw.trim().replace(rInvalid, "_").toLowerCase();
