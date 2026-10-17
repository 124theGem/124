import { createHmac, timingSafeEqual } from "node:crypto";
export function verifyTelegram(
  initData: string,
  botToken: string,
  now = Date.now(),
): { id: number; first_name: string } {
  if (!botToken || !initData || initData.length > 16384)
    throw new Error("Нужна авторизация Telegram");
  const params = new URLSearchParams(initData),
    seen = new Set<string>();
  for (const [key] of params) {
    if (seen.has(key)) throw new Error("Повторяющиеся поля");
    seen.add(key);
  }
  const hash = params.get("hash");
  if (!hash || !/^\w{64}$/.test(hash) || !/^[0-9a-f]+$/i.test(hash))
    throw new Error("Неверная подпись");
  const check = [...params.entries()]
    .filter(([key]) => key !== "hash")
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expected = createHmac("sha256", secret).update(check).digest();
  if (!timingSafeEqual(expected, Buffer.from(hash, "hex")))
    throw new Error("Неверная подпись");
  const date = Number(params.get("auth_date")),
    age = now / 1000 - date;
  if (
    !params.get("auth_date") ||
    !Number.isSafeInteger(date) ||
    age > 3600 ||
    age < -30
  )
    throw new Error("Вход устарел. Откройте Mini App заново.");
  const user = JSON.parse(params.get("user") ?? "null");
  if (
    !user ||
    !Number.isSafeInteger(user.id) ||
    user.id <= 0 ||
    typeof user.first_name !== "string"
  )
    throw new Error("Нет пользователя");
  return { id: user.id, first_name: user.first_name };
}
