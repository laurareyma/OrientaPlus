import { assertEquals } from "@std/assert";
import { SignJWT } from "jose";
import {
  ELEVATED_TOKEN_TTL_SECONDS,
  signElevatedToken,
  verifyElevatedToken,
} from "./elevated-token.ts";

const SECRET = "secreto-de-prueba-de-al-menos-32-caracteres!!";
const USER = "00000000-0000-0000-0000-000000000001";
const NOW = new Date("2026-11-10T15:00:00Z");
const ACTION = "data_export";
const seconds = (date: Date) => Math.floor(date.getTime() / 1000);

Deno.test("un token elevado recién firmado es válido para su usuario", async () => {
  const { token, expiresAt } = await signElevatedToken(
    SECRET,
    USER,
    NOW,
    ACTION,
  );

  assertEquals(
    expiresAt,
    new Date(NOW.getTime() + ELEVATED_TOKEN_TTL_SECONDS * 1000).toISOString(),
  );
  assertEquals(
    await verifyElevatedToken(SECRET, token, USER, NOW, ACTION),
    true,
  );
});

Deno.test("el token elevado dura 10 minutos", async () => {
  const { token } = await signElevatedToken(SECRET, USER, NOW, ACTION);
  const at = (offsetSeconds: number) =>
    new Date((seconds(NOW) + offsetSeconds) * 1000);

  assertEquals(ELEVATED_TOKEN_TTL_SECONDS, 600);
  assertEquals(
    await verifyElevatedToken(SECRET, token, USER, at(599), ACTION),
    true,
  );
  assertEquals(
    await verifyElevatedToken(SECRET, token, USER, at(601), ACTION),
    false,
  );
});

Deno.test("un token elevado no sirve para otro usuario", async () => {
  const { token } = await signElevatedToken(SECRET, USER, NOW, ACTION);
  const other = "00000000-0000-0000-0000-000000000002";

  assertEquals(
    await verifyElevatedToken(SECRET, token, other, NOW, ACTION),
    false,
  );
});

Deno.test("un token firmado con otro secreto o alterado se rechaza", async () => {
  const { token } = await signElevatedToken(SECRET, USER, NOW, ACTION);
  const otherSecret = "otro-secreto-distinto-de-al-menos-32-caracteres";

  assertEquals(
    await verifyElevatedToken(otherSecret, token, USER, NOW, ACTION),
    false,
  );
  assertEquals(
    await verifyElevatedToken(
      SECRET,
      token.slice(0, -2) + "xx",
      USER,
      NOW,
      ACTION,
    ),
    false,
  );
  assertEquals(
    await verifyElevatedToken(SECRET, "no-es-un-jwt", USER, NOW, ACTION),
    false,
  );
});

Deno.test("un token elevado solo sirve para la acción que se verificó", async () => {
  const { token } = await signElevatedToken(SECRET, USER, NOW, "data_export");

  assertEquals(
    await verifyElevatedToken(SECRET, token, USER, NOW, "data_export"),
    true,
  );
  assertEquals(
    await verifyElevatedToken(SECRET, token, USER, NOW, "account_deletion"),
    false,
  );
});

Deno.test("un token válido pero sin el claim action se rechaza", async () => {
  // Formato anterior al ligado por acción: firma, emisor y audiencia correctos.
  const issuedAt = seconds(NOW);
  const token = await new SignJWT({ mfa_verified: true })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(USER)
    .setIssuer("orienta-api")
    .setAudience("orienta-critical-actions")
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + 600)
    .sign(new TextEncoder().encode(SECRET));

  assertEquals(
    await verifyElevatedToken(SECRET, token, USER, NOW, "data_export"),
    false,
  );
});
