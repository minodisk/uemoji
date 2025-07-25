import type { SlackEmoji } from "shared";
import { makeTeam, sleep } from "shared";

export const etl = async (teamName: string) => {
  const startedAt = new Date();
  console.log("start etl:", teamName, startedAt);

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

  const alreadyTakenEmojis = new Set<string>();
  const userEmojis = users.map((user) => {
    const name = normalize(user.name);

    let registeringName = name;
    while (alreadyTakenEmojis.has(registeringName)) {
      registeringName += "_";
    }
    alreadyTakenEmojis.add(registeringName);

    let aliases = parseNames(user.real_name);
    if (user.profile.display_name) {
      aliases = [...aliases, ...parseNames(user.profile.display_name)];
    }
    aliases = Array.from(
      new Set(
        Array.from(new Set(aliases))
          .filter((alias) => alias !== name)
          .map((alias) => {
            while (alreadyTakenEmojis.has(alias)) {
              alias += "_";
            }
            alreadyTakenEmojis.add(alias);
            return alias;
          }),
      ),
    );

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

  const noPermissions = new Set<string>();
  const taken = new Set<string>();
  for (const { name, aliases, url } of userEmojis) {
    switch (await team.removeEmoji(name)) {
          case undefined:
            // ok
            break;
      case "no_permission":
        noPermissions.add(name);
        break;
      default:
        console.log("failed to remove emoji:", name);
        break;
    }
    switch (await team.addEmoji(name, url)) {
          case undefined:
            // ok
            break;
      case "fail_to_fetch_image":
        console.log("failed to add emoji:", name, url);
        break;
      case "error_name_taken":
        taken.add(name);
        break;
    }

    for (let alias of aliases) {
      for (;;) {
        switch (await team.removeEmoji(alias)) {
          case undefined:
            // ok
            break;
          case "no_permission":
            noPermissions.add(alias);
            break;
          default:
            console.log("failed to remove alias:", alias);
            break;
        }
        switch (await team.aliasEmoji(alias, name)) {
          case undefined:
            // ok
            break;
          case "error_name_taken_i18n": // maybe built-in emoji name
            alias += "_";
            continue;
          case "error_name_taken":
            if (!taken.has(name)) {
              taken.add(alias);
            }
            break;
          default:
            console.log("failed to add alias:", alias, name);
            break;
        }
        break;
      }
    }

    await sleep(100);
  }

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

  const finishedAt = new Date();
  console.log(
    "finish etl:",
    teamName,
    Math.ceil((finishedAt.getTime() - startedAt.getTime()) / (1000 * 60)),
    "min",
  );
  return;
};

const rTemporary = /(?:[(（].*[)）]|\d+\\\d+)/g;
const rDelimiter = /[/|]/g;
const rNumeric = /^[0-9_-]+$/;
const parseNames = (raw: string) =>
  raw
    .replace(rTemporary, "")
    .split(rDelimiter)
    .map(normalize)
    .filter((name) => !rNumeric.test(name));

const rInvalid = /[.\s]+/g;
const rAlphabetical= /^[0-9a-zA-Z_-]+$/;

/**
 * Normalize a raw string to create valid emoji names.
 * Splits the string by invalid characters (dots and spaces),
 * and joins with underscore if at least one chunk is alphabetical.
 * Otherwise joins without any separator.
 */
const normalize = (raw: string) => {
  const trimmed = raw.trim();
  const chunks = trimmed.split(rInvalid).filter(chunk => chunk.length > 0);
  
  // Check if at least one chunk is alphabetical
  const hasAlphabeticalChunk = chunks.some(chunk => rAlphabetical.test(chunk));
  
  if (hasAlphabeticalChunk) {
    // Join chunks with underscore if we have alphabetical chunks
    return chunks.join("_").toLowerCase();
  }
  
  // Otherwise join without separator
  return chunks.join("").toLowerCase();
};
