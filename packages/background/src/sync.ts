import type { SlackEmoji } from "shared";
import { makeTeam, sleep } from "shared";

export interface UserEmoji {
  name: string;
  aliases: string[];
  url: string;
}

export interface SyncBatchState {
  teamName: string;
  userEmojis: UserEmoji[];
  processedIndex: number;
  noPermissions: string[];
  taken: string[];
  startedAt: string;
}

export const prepareBatch = async (
  teamName: string,
): Promise<SyncBatchState> => {
  console.log("prepareBatch:", teamName);
  const team = await makeTeam(teamName);

  const users = (await team.getUsers()).filter(
    (user) =>
      !user.deleted &&
      // Slackbot is returned with is_bot=false, so exclude it by id.
      user.id !== "USLACKBOT" &&
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

    // Users without a custom avatar get a Gravatar fallback URL in
    // image_*, and Gravatar doesn't return CORS headers, so fetching
    // from the extension fails. These users have an avatar_hash that
    // starts with "g" (custom-avatar users have a plain hex hash; only
    // Slack's default fallback uses the "g" + hex form). Substitute a
    // bundled placeholder image so the emoji name is still reserved.
    const url = user.profile.avatar_hash?.startsWith("g")
      ? chrome.runtime.getURL("default-avatar.png")
      : user.profile.image_72 ||
        user.profile.image_48 ||
        user.profile.image_32 ||
        user.profile.image_24;

    return {
      name,
      aliases,
      url,
    };
  });

  return {
    teamName,
    userEmojis,
    processedIndex: 0,
    noPermissions: [],
    taken: [],
    startedAt: new Date().toISOString(),
  };
};

export const processFromIndex = async (
  batch: SyncBatchState,
): Promise<SyncBatchState> => {
  const team = await makeTeam(batch.teamName);
  const noPermissions = new Set<string>(batch.noPermissions);
  const taken = new Set<string>(batch.taken);

  for (let i = batch.processedIndex; i < batch.userEmojis.length; i++) {
    const userEmoji = batch.userEmojis[i];
    if (!userEmoji) continue;
    const { name, aliases, url } = userEmoji;

    switch (await team.removeEmoji(name)) {
      case undefined:
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
            break;
          case "error_name_taken_i18n":
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

    // 進捗保存: killされてもここまでの処理は記録される
    batch = {
      ...batch,
      processedIndex: i + 1,
      noPermissions: Array.from(noPermissions),
      taken: Array.from(taken),
    };
    await chrome.storage.local.set({ syncBatch: batch });

    await sleep(100);
  }

  return batch;
};

export const finalizeBatch = async (batch: SyncBatchState): Promise<void> => {
  const team = await makeTeam(batch.teamName);

  console.log("no permission:", batch.noPermissions);
  console.log("taken:", batch.taken);

  const toBeRemoved = new Set<string>([...batch.noPermissions, ...batch.taken]);

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
  const startedAt = new Date(batch.startedAt);
  console.log(
    "finish sync:",
    batch.teamName,
    Math.ceil((finishedAt.getTime() - startedAt.getTime()) / (1000 * 60)),
    "min",
  );
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
const rAlphabetical = /^[0-9a-zA-Z_-]+$/;

/**
 * Normalize a raw string to create valid emoji names.
 * Splits the string by invalid characters (dots and spaces),
 * and joins with underscore if at least one chunk is alphabetical.
 * Otherwise joins without any separator.
 */
const normalize = (raw: string) => {
  const trimmed = raw.trim();
  const chunks = trimmed.split(rInvalid).filter((chunk) => chunk.length > 0);

  // Check if at least one chunk is alphabetical
  const hasAlphabeticalChunk = chunks.some((chunk) =>
    rAlphabetical.test(chunk),
  );

  if (hasAlphabeticalChunk) {
    // Join chunks with underscore if we have alphabetical chunks
    return chunks.join("_").toLowerCase();
  }

  // Otherwise join without separator
  return chunks.join("").toLowerCase();
};
