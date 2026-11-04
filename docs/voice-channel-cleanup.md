# Discord voice channel cleanup

Set **Settings → Discord → Voice channel cleanup delay (minutes)**. The default is 10 minutes; zero is allowed. Completion, cancellation, and deletion snapshot this setting into a durable deadline. Later setting changes do not move existing deadlines. After the deadline, the bot requires two consecutive one-minute checks with every remaining channel for the match empty. Fetch failures never count as empty.

The bot records each channel immediately after creation, independently of the web caller's timeout. Tracking survives match deletion and stays until Discord confirms deletion or reports Unknown Channel. Permission and network failures retain ownership and retry with backoff from one minute up to one hour. Logs identify the match, channel, error, and next retry. Restarts preserve deadlines and retry state but restart the consecutive-empty counter.

## Upgrade

Stop the old server and bot together, run the normal database migration (`pnpm migrate`), then start the new server and bot. The migrations consolidate duplicate tracking IDs, restore ownership from retained legacy deletion requests, and add persistent cleanup schedules. Do not run an old bot against the upgraded database: its cleanup code still discards tracking prematurely.

In a test guild, set a short delay, complete a match with someone still connected, and verify that the channels remain past the deadline. Leave, wait for two checks, and confirm both Discord deletion and removal of tracking. Also test cancellation and deleting an active match.

## Recover channels already left behind

Run from the application checkout with its database environment configured. The command reads the bot credentials from that database and inspects the configured guild. No token is printed.

```sh
pnpm reconcile:voice --log app_data/data/logs/discord-bot-out.log
```

Additional `--log PATH` arguments accept older bot output logs. The default is a read-only JSON report. It gathers exact channel IDs from durable tracking, retained creation/deletion requests, creation logs, and up to 1,000 channel-creation audit entries. Audit entries written by the new bot include a match-specific reason, allowing recovery if the process crashes between Discord creation and database persistence. Missing audit permission is reported without blocking the other evidence sources.

Only `eligible` channels have unambiguous ownership and an ended or missing match. Permanent configured channels, channels used by active matches, conflicting ownership, and category channels without ownership evidence are excluded. Names and category membership alone never authorize cleanup. Older audit entries without a match-specific reason remain unresolved unless another source supplies ownership.

After reviewing the report, restore eligible channels to normal cleanup:

```sh
pnpm reconcile:voice --log app_data/data/logs/discord-bot-out.log --apply
```

Apply schedules cleanup; it does not call Discord deletion. It is repeatable and does not extend existing deadlines. Keep the bot running to perform delayed, empty-only deletion. Logs or audit records may have expired, so the report can contain unresolved channels requiring manual ownership review.

A crash immediately after Discord accepts creation can still precede local tracking/logging. The audit reason provides a recovery path when audit history is available; cross-system creation and database persistence cannot be atomic.
