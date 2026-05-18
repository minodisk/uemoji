# Uemoji

<p align="center">
  <img src="./packages/misc/src/uemoji.png" />
</p>

Registers the profile images of all users in Slack team as custom emojis.

The setup is completed in the following 3 steps:

1. Add Uemoji to Chrome.
2. Click the Uemoji icon.
3. Select the Slack team.

Features:

- No special authentication is required, but you must be logged into Slack in Chrome.
- Automatically process once a day.
- Add a custom emoji with a user name and register the display name of the user profile as aliases for that emoji. The display name is split with '/' or '|' and registered as multiple aliases.

## How sync works

The sync cycle is driven by `chrome.alarms` and resumable across Service Worker restarts. Sync is scheduled as a **one-shot alarm**: after a batch completes, the next `ALARM_SYNC` is scheduled 1 hour later. Progress is persisted per user, so a kill/restart picks up from the last processed index.

```mermaid
flowchart TD
  Install([onInstalled]) --> InitAlarm[Create ALARM_SYNC<br/>delayInMinutes: 1<br/>+ runSync immediately]
  SWStart([SW start]) --> CheckExisting{ALARM_SYNC exists?<br/>batch in progress?}
  CheckExisting -->|no alarm, no batch| ScheduleNext[scheduleNextSync:<br/>ALARM_SYNC in 60min]
  CheckExisting -->|batch in progress| ScheduleContinue[Create ALARM_SYNC_CONTINUE<br/>delayInMinutes: 1]
  CheckExisting -->|alarm exists| Idle

  InitAlarm --> Idle
  ScheduleNext --> Idle
  ScheduleContinue --> Idle

  Idle{SW idle/stopped} -->|ALARM_SYNC fires<br/>one-shot| Wake[SW wakes up]
  Idle -->|ALARM_SYNC_CONTINUE fires<br/>1min after interrupt| Wake
  Idle -->|team change| Wake
  Wake --> Check{syncBatch in<br/>chrome.storage.local?}
  Check -->|yes, unfinished| Resume[Resume from processedIndex]
  Check -->|no| Prepare[prepareBatch:<br/>fetch users + build emoji list]
  Prepare --> Process
  Resume --> Process[processFromIndex:<br/>loop users one by one]
  Process --> SaveProgress[Save processedIndex<br/>to storage per user]
  SaveProgress --> MoreUsers{more users?}
  MoreUsers -->|yes| Process
  MoreUsers -->|no| Finalize[finalizeBatch +<br/>clear syncBatch]
  Finalize --> ScheduleNextAfter[scheduleNextSync:<br/>ALARM_SYNC in 60min]
  ScheduleNextAfter --> Idle

  Process -.->|SW killed<br/>5min limit / browser close| Killed([SW terminated])
  Killed -.->|next alarm or SW restart| Wake
```

Slack rate limits (HTTP 429 with `Retry-After`, or HTTP 5xx) are handled inside `fetchSlackWithRetry` with header-driven sleep and exponential backoff, so the loop itself does not need to know about retries.

## Installation

### Chrome Web Store (recommended)

1. Open [chrome web store](https://chrome.google.com/webstore/detail/uemoji/) in Chrome.
1. Click `Add to Chrome`.

### Developer mode (early access)

1. Download `uemoji.zip` from [latest release](https://github.com/minodisk/uemoji/releases/latest).
1. Unzip `uemoji.zip`.
1. Open [chrome://extensions/](chrome://extensions/) in Chrome.
1. Turn on `Developer mode`.
1. Click `Load unpacked` and select unzipped directory.
