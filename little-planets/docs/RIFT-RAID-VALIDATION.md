# RIFT RAID 0.18.1 — release validation

Executed in the cloud workspace on 2026-10-24. No changes to a live VPS, external bot webhook, DNS, Caddy or street-racing were made.

- `npm test`: **160 tests in 19 files passed**. Includes existing colony/NEXUS regressions and 11 new combat, authoritative-input, cooperative-session, extraction/persistence, interrupted-run, interaction-target and mocked Stars tests.
- `npm run package:server`: TypeScript check and Vite production build passed. New default entry lazily imports the 2D game, not Three.js or the planet catalog. Large legacy chunks remain separately lazy-loaded.
- `npm run test:raid-browser`: passed at **1440×1000, 390×844, 844×390** with the native Telegram SDK, HMAC-signed synthetic users and a `/planets/` reverse proxy. Real keyboard extraction, loot settlement, base upgrade, cosmetic equip, daily reward, reload persistence, mobile joystick/quit and a real two-player shared raid. No page errors.
- `npm run test:runtime`: current artifact installed in a fresh temporary directory using **production dependencies only**; health, new HTML and protected game API passed. Unsigned payment webhook rejected.
- `npm run test:upgrade`: successful upgrade, invalid-save refusal and service-health rollback all passed. Existing environment and saves preserved; SQLite/application backups verified.
- Aggregate analytics smoke check (unchanged from 0.18.0): fresh account produces registered=1/DAU=1, immature D7=null, no personal identifiers in the exported report.
- Stars tests use a synthetic bot transport. No real invoice, charge, refund, webhook change or message to a real user was issued. Live merchant checkout remains an activation step for the owner.

Screenshots: [rift-raid](screenshots/rift-raid/README.md). These emulate device viewports; physical Telegram iOS/Android devices and live VPS installation have not been independently certified. Monetization/retention figures require real users and are not inferred from developer tests.

- New motion-specific unit and delayed-network browser checks passed: [details and actual measurements](RIFT-RAID-MOTION.md).
