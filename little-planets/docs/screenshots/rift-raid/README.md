# RIFT RAID: production browser captures

Chromium, original Canvas 2D renderer, native vendored Telegram SDK, signed synthetic users, real Fastify server and SQLite, reverse proxy stripping `/planets/` exactly as on the VPS. No live credentials or real payments used. Viewports are emulated, not physical-device certification.

| Screen | Desktop 1440×1000 | Phone 390×844 | Landscape 844×390 |
|---|---|---|---|
| Base | [Desktop](base-1440.png) | [Portrait](base-390.png) | [Landscape](base-844.png) |
| Raid | [Desktop](raid-1440.png) | [Portrait](raid-390.png) | [Landscape](raid-844.png) |
| Cosmetics | [Desktop](shop-1440.png) | [Portrait](shop-390.png) | [Landscape](shop-844.png) |
| Season | [Desktop](season-1440.png) | [Portrait](season-390.png) | [Landscape](season-844.png) |

[Actual extracted loot receipt](extraction.png) · [Two authenticated players in one live raid](cooperative.png)

`npm run test:raid-browser` recreates these files. The desktop case opens a real container with keyboard input, waits for the real extraction gate, chooses earned perks, extracts, claims a completed daily contract and verifies persistence. Mobile cases move with the joystick and verify quitting preserves permanent upgrades. The cooperative case joins by code and verifies a shared server run ID. The tests do not inject client rewards or override authenticated server state.
