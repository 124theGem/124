# RIFT RAID 0.18.1 — motion fix

The 0.18.0 client sampled controls only when sending its 125 ms HTTP poll, drew enemies and bullets directly from those snapshots, and applied two successive low-pass filters to the local pawn/camera. This caused delayed steering, stepped opponents and projectiles that could be created and removed between responses.

0.18.1 reads controls every animation frame and predicts only the local pawn's presentation with the same movement/dash/collision function as the server. On receipt, it replays recorded controls since the outbound request and smoothly reconciles small errors. Server damage, currency, loot and actual positions remain authoritative. Long disconnects stop prediction; new raids reset history.

Opponents and squadmates use a bounded snapshot interpolation buffer with shortest-arc rotation. Its playhead adjusts gradually to jitter; extrapolation is capped at 100 ms. The local pawn no longer passes through a second positional filter. The camera follows the predicted pose.

Server fire events now carry lightweight immutable projectile origins/velocities/lifetimes, plus terminal impact events. Presentation reconstructs complete flights, including projectiles absent from the newest live bullet array. This is visual history, not client-side hit detection. Sounds are deduplicated by event ID and played as the presentation clock reaches the event. Active polling targets 66 ms instead of 125 ms and still allows only one request in flight.

## Actual browser results, 2026-10-24

Production bundle, native Telegram SDK, signed synthetic users, real server/SQLite, `/planets/` reverse proxy, additional **135–205 ms variable round-trip delay**. Each case includes immediate steering before server acknowledgement, key/joystick release and continuous live combat. No reward or server state injection.

| Emulated viewport | Player movement frames between responses | Enemy movement frames between responses | Projectile flight frame pairs |
|---|---:|---:|---:|
| 1280×800 | 64 | 293 | 79 |
| 390×844 | 65 | 281 | 72 |
| 844×390 | 61 | 249 | 198 |

All cases passed. Projectile playback speed stayed within the bounded 1.25× clock catch-up, without packet-sized position jumps. Counts are regression observations from this run, not a hardware performance guarantee. Physical phones and live VPS installation were not independently certified.

Reproduce with `npm run test:raid-motion` and `npm run test:raid-motion-browser`. Eight focused tests cover immediate control/release, remote interpolation, a complete shot between snapshots, angle wrap, collision/dash, disconnection bounds, pause/new raid reset, variable network timing and authoritative shot endpoints. The complete suite now has 160 tests in 19 files; production browser extraction/co-op, production-only archive install and all three updater backup/rollback cases also pass.
