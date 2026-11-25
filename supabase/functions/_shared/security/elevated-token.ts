import { jwtVerify, SignJWT } from "jose";

/**
 * elevated_token (decisión 0002): JWT HS256 de corta duración que prueba que
 * la persona verificó su segundo factor. Lo exige la API para las acciones
 * críticas (exportar o eliminar datos). Se firma con ELEVATED_TOKEN_SECRET,
 * que solo existe en el servidor.
 *
 * El token queda ligado a la acción del reto que se verificó (claim
 * `action`): un 2FA hecho para exportar datos no autoriza borrar la cuenta.
 * `action` es un texto opaco aquí; la API define los valores válidos.
 */

export const ELEVATED_TOKEN_TTL_SECONDS = 10 * 60;
const ISSUER = "orienta-api";
const AUDIENCE = "orienta-critical-actions";

function keyFrom(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function signElevatedToken(
  secret: string,
  userId: string,
  now: Date,
  action: string,
): Promise<{ token: string; expiresAt: string }> {
  const issuedAt = Math.floor(now.getTime() / 1000);
  const expiresAt = issuedAt + ELEVATED_TOKEN_TTL_SECONDS;
  const token = await new SignJWT({ mfa_verified: true, action })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt(issuedAt)
    .setExpirationTime(expiresAt)
    .sign(keyFrom(secret));
  return { token, expiresAt: new Date(expiresAt * 1000).toISOString() };
}

/**
 * true solo si el token tiene firma válida, no venció, es de este usuario,
 * declara mfa_verified y fue emitido para esta misma acción. Cualquier otro caso (incluido un token malformado)
 * devuelve false.
 */
export async function verifyElevatedToken(
  secret: string,
  token: string,
  userId: string,
  now: Date,
  action: string,
): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(token, keyFrom(secret), {
      algorithms: ["HS256"],
      issuer: ISSUER,
      audience: AUDIENCE,
      subject: userId,
      currentDate: now,
    });
    return payload.mfa_verified === true && payload.action === action;
  } catch {
    return false;
  }
}
