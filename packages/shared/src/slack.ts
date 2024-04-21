import { load } from "cheerio";
import { sleepExpo } from ".";

export type Slack = ReturnType<typeof makeSlack>;

export class SlackNoTeamError extends Error {
  constructor() {
    super();
  }

  toString() {
    return `no slack team`;
  }
}

type Props = {
  loggedInTeams: SlackTeam[];
};

type SlackResponse = {
  ok: boolean;
  response_metadata?: {
    next_cursor: string;
  };
};

export type SlackTeam = {
  team_domain: string;
  team_name: string;
  team_icon: {
    image_34: string;
    image_44: string;
    image_68: string;
    image_102: string;
    image_132: string;
    image_230: string;
  };
};

export type SlackUser = {
  id: string;
  team_id: string;
  name: string;
  color: string;
  real_name: string;
  tz: string;
  tz_label: string;
  tz_offset: number;
  updated: number;
  who_can_share_contact_card: "EVERYONE";
  deleted: boolean;
  is_admin: boolean;
  is_owner: boolean;
  is_primary_owner: boolean;
  is_restricted: boolean;
  is_ultra_restricted: boolean;
  is_bot: boolean;
  is_app_user: boolean;
  is_forgotten: boolean;
  is_email_confirmed: boolean;
  profile: {
    title: string;
    phone: string;
    skype: string;
    real_name: "string User";
    real_name_normalized: "string User";
    display_name: "string";
    display_name_normalized: "string";
    fields: null;
    status_text: string;
    status_emoji: string;
    status_emoji_display_info: string[];
    status_expiration: number;
    avatar_hash: string;
    email: string;
    first_name: string;
    last_name: string;
    image_original: string;
    image_24: string;
    image_32: string;
    image_48: string;
    image_72: string;
    image_192: string;
    image_512: string;
    status_text_canonical: string;
    team: string;
    is_custom_image: boolean;
    huddle_state: "default_unset";
    huddle_state_expiration_ts: 0;
  };
};

export type SlackEmoji = {
  name: string;
  is_alias: number;
  alias_for: string;
  url: string;
  team_id: string;
  user_id: string;
  created: number;
  is_bad: boolean;
  user_display_name: string;
  avatar_hash: string;
  can_delete: boolean;
  synonyms: [];
};

export function makeSlack() {
  return {
    async getTeams() {
      const signIn = await fetch(`https://slack.com/signin`, {
        credentials: "include",
      });
      console.log("slack: sign in:", signIn);

      const html = await signIn.text();
      const $ = load(html);
      const propsNode = $("#props_node");
      const props = propsNode.attr("data-props");
      if (!props) {
        return [];
      }
      const p: Props = JSON.parse(props);
      const { loggedInTeams } = p;

      return loggedInTeams;
    },

    dispose() {
      // do nothing
    },
  };
}

export const makeTeam = async (team: string) => {
  const getAPIToken = async (teamName: string) => {
    // Get API token
    const home = await fetch(`https://${teamName}.slack.com/home`, {
      credentials: "include",
    });
    const html = await home.text();
    const boot = parseBootData(html);
    return boot.api_token;
  };

  console.log("slack team:", team);
  if (!team) {
    throw new SlackNoTeamError();
  }
  const token = await getAPIToken(team);

  const addEmoji = async (
    name: string,
    url: string,
    retries: number,
  ): Promise<undefined | "emoji_not_found" | "error_name_taken"> => {
    const res = await fetch(url, { credentials: "include" });
    const image = await res.blob();

    const fd = new FormData();
    fd.append("mode", "data");
    fd.append("name", name);
    fd.append("token", token);
    fd.append("image", image);
    const resp = await fetch(`https://${team}.slack.com/api/emoji.add`, {
      method: "POST",
      body: fd,
      redirect: "manual",
      credentials: "include",
    });
    const result:
      | { ok: true }
      | {
          ok: false;
          error: "ratelimited" | "emoji_not_found" | "error_name_taken";
        } = await resp.json();
    console.log("add:", name, result);
    if (result.ok) {
      return;
    }
    if (result.error === "ratelimited") {
      // exponential backoff
      await sleepExpo(1000, 2, retries);
      return addEmoji(name, url, retries + 1);
    }
    return result.error;
  };

  const aliasEmoji = async (
    alias: string,
    aliasFor: string,
    retries: number,
  ): Promise<
    undefined | "emoji_not_found" | "error_name_taken" | "error_name_taken_i18n"
  > => {
    const fd = new FormData();
    fd.append("mode", "alias");
    fd.append("name", alias);
    fd.append("alias_for", aliasFor);
    fd.append("token", token);
    const resp = await fetch(`https://${team}.slack.com/api/emoji.add`, {
      method: "POST",
      body: fd,
      redirect: "manual",
      credentials: "include",
    });
    const result:
      | { ok: true }
      | {
          ok: false;
          error:
            | "ratelimited"
            | "emoji_not_found"
            | "error_name_taken"
            | "error_name_taken_i18n";
        } = await resp.json();
    console.log("alias:", alias, "->", aliasFor, result);
    if (result.ok) {
      return;
    }
    if (result.error === "ratelimited") {
      // exponential backoff
      await sleepExpo(1000, 2, retries);
      return aliasEmoji(alias, aliasFor, retries + 1);
    }
    return result.error;
  };

  const removeEmoji = async (
    name: string,
    retries: number,
  ): Promise<undefined | "no_permission"> => {
    const fd = new FormData();
    fd.append("name", name);
    fd.append("token", token);
    const resp = await fetch(`https://${team}.slack.com/api/emoji.remove`, {
      method: "POST",
      body: fd,
      redirect: "manual",
      credentials: "include",
    });
    const result:
      | { ok: true }
      | {
          ok: false;
          error: "ratelimited" | "no_permission";
        } = await resp.json();
    console.log("remove:", name, result);
    if (result.ok) {
      return;
    }
    if (result.error === "ratelimited") {
      // exponential backoff
      await sleepExpo(1000, 2, retries);
      return removeEmoji(name, retries + 1);
    }
    return result.error;
  };

  return {
    async getUsers() {
      let users: SlackUser[] = [];
      let cursor = "";
      for (;;) {
        const params = new URLSearchParams({
          token,
          include_locale: "false",
          limit: "1000",
        });
        if (cursor) {
          params.append("cursor", cursor);
        }
        const resp = await fetch(
          `https://${team}.slack.com/api/users.list?${params.toString()}`,
          {
            credentials: "include",
          },
        );
        const conversations: SlackResponse & {
          members: SlackUser[];
        } = await resp.json();
        users = users.concat(conversations.members);
        if (
          conversations.response_metadata &&
          conversations.response_metadata.next_cursor
        ) {
          cursor = conversations.response_metadata.next_cursor;
        } else {
          break;
        }
      }
      return users;
    },

    async getEmojis() {
      const emojis: SlackEmoji[] = [];

      let page = 1;
      for (;;) {
        const params = new URLSearchParams({
          token,
          page: `${page}`,
          count: "1000",
          query: "",
        });
        const resp = await fetch(
          `https://${team}.slack.com/api/emoji.adminList?${params.toString()}`,
          {
            method: "POST",
            credentials: "include",
          },
        );
        const body: {
          ok: boolean;
          custom_emoji_total_count: number;
          paging: {
            count: number;
            total: number;
            page: number;
            pages: number;
          };
          emoji: SlackEmoji[];
        } = await resp.json();

        if (body.ok) {
          emojis.push(...body.emoji);
        }

        if (page >= body.paging.pages) {
          break;
        }
        page++;
      }

      return emojis;
    },

    async addEmoji(name: string, url: string) {
      return addEmoji(name, url, 0);
    },

    async aliasEmoji(name: string, aliasFor: string) {
      return aliasEmoji(name, aliasFor, 0);
    },

    async removeEmoji(name: string) {
      return removeEmoji(name, 0);
    },

    dispose() {
      // do nothing
    },
  };
};

export type BootData = {
  api_url: string;
  api_token: string;
  user_id: string;
  team_id: string;
  team_url: string;
};
const rBootData = /var boot_data = ({.*});/;
const parseBootData = (html: string): BootData => {
  const r = rBootData.exec(html);
  if (!r || !r[1]) {
    throw new Error("boot_data not found");
  }
  return JSON.parse(r[1]);
};
