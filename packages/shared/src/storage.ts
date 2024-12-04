import type { SlackTeam } from "./slack";

export type Storage = ReturnType<typeof makeStorage>;

export type SlackSetting = {
  team: string;
};

type LocalData = {
  teams: SlackTeam[];
};
const defaultLocal: LocalData = {
  teams: [],
};

export function makeStorage() {
  const keyToCallbacks = new Map<string, ((value: unknown) => unknown)[]>();
  const handleChanged = (
    changes: Record<string, chrome.storage.StorageChange>,
  ) => {
    console.log("handleChanged:", changes);
    for (const key in changes) {
      const change = changes[key];
      if (change === undefined) {
        continue;
      }
      const callbacks = keyToCallbacks.get(key);
      if (callbacks === undefined || callbacks.length === 0) {
        continue;
      }
      for (const callback of callbacks) {
        callback(change.newValue);
      }
    }
  };

  return {
    async init() {
      chrome.storage.onChanged.addListener(handleChanged);
      // fill local storage with default data
      const current = await chrome.storage.local.get(null);
      let next: Partial<LocalData> = {};
      let key: keyof LocalData;
      for (key in defaultLocal) {
        if (current[key] !== undefined) {
          continue;
        }
        const v = defaultLocal[key];
        next = { ...next, [key]: v };
      }
      if (Object.keys(next).length > 0) {
        await chrome.storage.local.set(next);
      }
    },

    async getTeams() {
      const data = await chrome.storage.local.get("teams");
      return (data.teams ?? []) as SlackTeam[];
    },

    async setTeams(teams: SlackTeam[]) {
      await chrome.storage.local.set({ teams });
    },

    async getTeam(): Promise<string> {
      const { team } = await chrome.storage.sync.get("team");
      return (team as string) ?? "";
    },

    async setTeam(team: string): Promise<void> {
      return chrome.storage.sync.set({ team });
    },

    onChangeTeam(callback: (team: string) => void) {
      const key = "team";
      const callbacks = keyToCallbacks.get(key) ?? [];
      keyToCallbacks.set(key, [
        ...callbacks,
        callback as (value: unknown) => unknown,
      ]);
    },

    dispose() {
      keyToCallbacks.clear();
      chrome.storage.onChanged.removeListener(handleChanged);
    },
  };
}
