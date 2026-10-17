# Telegram WebApp bridge

Pinned standalone browser bridge from `@twa-dev/sdk` 8.0.2, provided under the adjacent MIT license. Served locally as a classic script before the game module; no Telegram CDN request is needed for startup.

`telegram-web-app-8.0.2.js` SHA-256:

```text
ee7fc2e0150fcf51be9fc90aa800d7f2a97549aa8dc73b107cc2a9d8089b6d1b
```

The bridge provides client platform integration. User authentication is separately validated on the backend in `server/auth.ts` using signed `initData` and the server-only bot token.
