import { assert, assertEquals } from "@std/assert";
import { decodeBase32 } from "../../_shared/security/base32.ts";
import { generateTotp } from "../../_shared/security/totp.ts";
import {
  AUTH_HEADER,
  COMPLETE_PROFILE,
  createTestApp,
  makeOpportunityRecord,
  OTHER_USER_TOKEN,
  TEST_USER,
  TestClock,
} from "../testing/fakes.ts";
import { NOW } from "../../_shared/domain/testing/fixtures.ts";

type App = ReturnType<typeof createTestApp>["app"];

function post(app: App, path: string, body: unknown, headers = AUTH_HEADER) {
  return app.request(path, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Inscribe y confirma el 2FA; devuelve la semilla para generar códigos. */
async function enrollTwoFactor(app: App, clock: TestClock) {
  const { secret } = await (await post(app, "/api/mfa/enroll", {})).json();
  const seed = decodeBase32(secret);
  await post(app, "/api/mfa/enroll/confirm", {
    code: await generateTotp(seed, clock.unixSeconds()),
  });
  return seed;
}

/** Pide la exportación sin token elevado y devuelve el step_up_token. */
async function requestStepUp(app: App): Promise<string> {
  const res = await app.request("/api/me/data-export", {
    headers: AUTH_HEADER,
  });
  assertEquals(res.status, 403);
  const body = await res.json();
  assertEquals(body.error, "mfa_required");
  return body.stepUpToken;
}

function setup() {
  const clock = new TestClock();
  const { app, repository } = createTestApp({ now: clock.now });
  repository.profiles.set(TEST_USER.id, COMPLETE_PROFILE);
  repository.opportunities = [makeOpportunityRecord({ id: "guardada" })];
  return { app, repository, clock };
}

Deno.test("sin 2FA activo, una acción crítica pide activarlo primero", async () => {
  const { app } = setup();

  const res = await app.request("/api/me/data-export", {
    headers: AUTH_HEADER,
  });

  assertEquals(res.status, 403);
  assertEquals((await res.json()).error, "mfa_enrollment_required");
});

Deno.test("flujo completo: 403 mfa_required, verificación TOTP y exportación de datos", async () => {
  const { app, repository, clock } = setup();
  repository.saved = [{
    userId: TEST_USER.id,
    opportunityId: "guardada",
    savedAt: NOW.toISOString(),
  }];
  const seed = await enrollTwoFactor(app, clock);
  clock.advanceSeconds(60); // una ventana nueva para no repetir el código

  const stepUpToken = await requestStepUp(app);
  // En la base solo queda el hash del token.
  assert(repository.challenges.every((c) => c.tokenHash !== stepUpToken));

  const verify = await post(app, "/api/mfa/verify", {
    stepUpToken,
    code: await generateTotp(seed, clock.unixSeconds()),
  });
  assertEquals(verify.status, 200);
  const { elevatedToken, expiresAt } = await verify.json();
  assertEquals(
    expiresAt,
    new Date(clock.current.getTime() + 600_000).toISOString(),
  );

  const exported = await app.request("/api/me/data-export", {
    headers: { ...AUTH_HEADER, "X-Elevated-Token": elevatedToken },
  });
  const body = await exported.json();
  assertEquals(exported.status, 200);
  assertEquals(body.account, { id: TEST_USER.id, email: TEST_USER.email });
  assertEquals(body.profile.birthDate, COMPLETE_PROFILE.birthDate);
  assertEquals(body.twoFactor.enrolled, true);
  assertEquals(body.savedOpportunities, [{
    opportunityId: "guardada",
    title: "Oportunidad de prueba guardada",
    savedAt: NOW.toISOString(),
  }]);
  // La exportación nunca incluye el secreto TOTP.
  assert(!JSON.stringify(body).includes("secret"));
});

Deno.test("un código ya usado se rechaza con 409 replay_detected", async () => {
  const { app, clock } = setup();
  const seed = await enrollTwoFactor(app, clock);
  clock.advanceSeconds(60);
  const code = await generateTotp(seed, clock.unixSeconds());

  const first = await post(app, "/api/mfa/verify", {
    stepUpToken: await requestStepUp(app),
    code,
  });
  assertEquals(first.status, 200);

  clock.advanceSeconds(5); // misma ventana de 30 s
  const replay = await post(app, "/api/mfa/verify", {
    stepUpToken: await requestStepUp(app),
    code,
  });
  assertEquals(replay.status, 409);
  assertEquals((await replay.json()).error, "replay_detected");
});

Deno.test("un código incorrecto no gasta el reto: se puede reintentar", async () => {
  const { app, clock } = setup();
  const seed = await enrollTwoFactor(app, clock);
  clock.advanceSeconds(60);
  const stepUpToken = await requestStepUp(app);

  const wrong = await post(app, "/api/mfa/verify", {
    stepUpToken,
    code: "000000",
  });
  assertEquals(wrong.status, 422);
  assertEquals((await wrong.json()).error, "invalid_code");

  const right = await post(app, "/api/mfa/verify", {
    stepUpToken,
    code: await generateTotp(seed, clock.unixSeconds()),
  });
  assertEquals(right.status, 200);
});

Deno.test("un reto vencido (más de 5 minutos) responde 410 step_up_expired", async () => {
  const { app, clock } = setup();
  const seed = await enrollTwoFactor(app, clock);
  clock.advanceSeconds(60);
  const stepUpToken = await requestStepUp(app);

  clock.advanceSeconds(5 * 60 + 1);
  const res = await post(app, "/api/mfa/verify", {
    stepUpToken,
    code: await generateTotp(seed, clock.unixSeconds()),
  });

  assertEquals(res.status, 410);
  assertEquals((await res.json()).error, "step_up_expired");
});

Deno.test("el reto de otra persona no sirve", async () => {
  const { app, clock } = setup();
  await enrollTwoFactor(app, clock);
  const stepUpToken = await requestStepUp(app);

  const res = await post(
    app,
    "/api/mfa/verify",
    { stepUpToken, code: "123456" },
    { Authorization: `Bearer ${OTHER_USER_TOKEN}` },
  );

  assertEquals(res.status, 410);
});

Deno.test("el token elevado vence a los 10 minutos", async () => {
  const { app, clock } = setup();
  const seed = await enrollTwoFactor(app, clock);
  clock.advanceSeconds(60);
  const { elevatedToken } = await (await post(app, "/api/mfa/verify", {
    stepUpToken: await requestStepUp(app),
    code: await generateTotp(seed, clock.unixSeconds()),
  })).json();

  clock.advanceSeconds(10 * 60 + 1);
  const res = await app.request("/api/me/data-export", {
    headers: { ...AUTH_HEADER, "X-Elevated-Token": elevatedToken },
  });

  assertEquals(res.status, 403);
  assertEquals((await res.json()).error, "mfa_required");
});

Deno.test("el token elevado de una persona no sirve para otra", async () => {
  const { app, repository, clock } = setup();
  const seed = await enrollTwoFactor(app, clock);
  clock.advanceSeconds(60);
  const { elevatedToken } = await (await post(app, "/api/mfa/verify", {
    stepUpToken: await requestStepUp(app),
    code: await generateTotp(seed, clock.unixSeconds()),
  })).json();

  const res = await app.request("/api/me", {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${OTHER_USER_TOKEN}`,
      "X-Elevated-Token": elevatedToken,
    },
  });

  assertEquals(res.status, 403);
  assertEquals(repository.deletedUsers, []);
});

Deno.test("DELETE /api/me con verificación elimina la cuenta y sus datos", async () => {
  const { app, repository, clock } = setup();
  repository.saved = [{
    userId: TEST_USER.id,
    opportunityId: "guardada",
    savedAt: NOW.toISOString(),
  }];
  const seed = await enrollTwoFactor(app, clock);
  clock.advanceSeconds(60);

  const denied = await app.request("/api/me", {
    method: "DELETE",
    headers: AUTH_HEADER,
  });
  assertEquals(denied.status, 403);
  const { stepUpToken } = await denied.json();

  const { elevatedToken } = await (await post(app, "/api/mfa/verify", {
    stepUpToken,
    code: await generateTotp(seed, clock.unixSeconds()),
  })).json();
  const res = await app.request("/api/me", {
    method: "DELETE",
    headers: { ...AUTH_HEADER, "X-Elevated-Token": elevatedToken },
  });

  assertEquals(res.status, 204);
  assertEquals(repository.deletedUsers, [TEST_USER.id]);
  assertEquals(repository.profiles.has(TEST_USER.id), false);
  // Las guardadas se borran solo al eliminar la cuenta.
  assertEquals(repository.saved, []);
});

Deno.test("GET /api/me/views lista las oportunidades vistas, la más reciente primero, sin pedir step-up", async () => {
  const { app, repository } = setup();
  repository.views = [
    { userId: TEST_USER.id, opportunityId: "primera" },
    { userId: TEST_USER.id, opportunityId: "segunda" },
    { userId: "otra-persona", opportunityId: "ajena" },
  ];

  const res = await app.request("/api/me/views", { headers: AUTH_HEADER });
  const body = await res.json();

  assertEquals(res.status, 200);
  assertEquals(
    body.items.map((v: { opportunityId: string }) => v.opportunityId),
    ["segunda", "primera"],
  );
});

Deno.test("GET /api/me/views sin sesión responde 401", async () => {
  const { app } = setup();

  const res = await app.request("/api/me/views");

  assertEquals(res.status, 401);
});

// --- Límite de intentos de código (hallazgo de la revisión de seguridad) ---

/** Envía `times` códigos incorrectos con el mismo reto. */
async function failVerify(app: App, stepUpToken: string, times: number) {
  const statuses: number[] = [];
  for (let i = 0; i < times; i++) {
    const res = await post(app, "/api/mfa/verify", {
      stepUpToken,
      code: "000000",
    });
    statuses.push(res.status);
  }
  return statuses;
}

Deno.test("tras 5 códigos incorrectos, /mfa/verify responde 429 aunque el siguiente código sea correcto", async () => {
  const { app, clock } = setup();
  const seed = await enrollTwoFactor(app, clock);
  clock.advanceSeconds(60);
  const stepUpToken = await requestStepUp(app);

  assertEquals(await failVerify(app, stepUpToken, 5), [
    422,
    422,
    422,
    422,
    422,
  ]);
  const blocked = await post(app, "/api/mfa/verify", {
    stepUpToken,
    code: await generateTotp(seed, clock.unixSeconds()),
  });

  assertEquals(blocked.status, 429);
  const body = await blocked.json();
  assertEquals(body.error, "too_many_attempts");
  assertEquals(blocked.headers.get("Retry-After"), String(15 * 60));
  assertEquals(
    body.retryAt,
    new Date(clock.current.getTime() + 15 * 60_000).toISOString(),
  );
});

Deno.test("pedir un reto nuevo no reinicia el límite de intentos", async () => {
  const { app, clock } = setup();
  const seed = await enrollTwoFactor(app, clock);
  clock.advanceSeconds(60);
  await failVerify(app, await requestStepUp(app), 5);

  const res = await post(app, "/api/mfa/verify", {
    stepUpToken: await requestStepUp(app),
    code: await generateTotp(seed, clock.unixSeconds()),
  });

  assertEquals(res.status, 429);
});

Deno.test("el bloqueo se levanta 15 minutos después del primer intento fallido", async () => {
  const { app, clock } = setup();
  const seed = await enrollTwoFactor(app, clock);
  clock.advanceSeconds(60);
  await failVerify(app, await requestStepUp(app), 5);

  clock.advanceSeconds(15 * 60);
  const res = await post(app, "/api/mfa/verify", {
    stepUpToken: await requestStepUp(app),
    code: await generateTotp(seed, clock.unixSeconds()),
  });

  assertEquals(res.status, 200);
});

Deno.test("un código correcto reinicia el contador de intentos", async () => {
  const { app, clock } = setup();
  const seed = await enrollTwoFactor(app, clock);
  clock.advanceSeconds(60);
  await failVerify(app, await requestStepUp(app), 4);
  const ok = await post(app, "/api/mfa/verify", {
    stepUpToken: await requestStepUp(app),
    code: await generateTotp(seed, clock.unixSeconds()),
  });
  assertEquals(ok.status, 200);

  clock.advanceSeconds(60);
  const statuses = await failVerify(app, await requestStepUp(app), 5);

  assertEquals(statuses, [422, 422, 422, 422, 422]);
});

Deno.test("el límite de intentos es por persona", async () => {
  const { app, clock } = setup();
  await enrollTwoFactor(app, clock);
  clock.advanceSeconds(60);
  await failVerify(app, await requestStepUp(app), 5);

  const other = await post(
    app,
    "/api/mfa/enroll",
    {},
    { Authorization: `Bearer ${OTHER_USER_TOKEN}` },
  );

  assertEquals(other.status, 201);
  // La otra persona no hereda el bloqueo al confirmar su propio factor.
  const confirm = await post(
    app,
    "/api/mfa/enroll/confirm",
    { code: "000000" },
    { Authorization: `Bearer ${OTHER_USER_TOKEN}` },
  );
  assertEquals(confirm.status, 422);
});

// --- Token elevado ligado a la acción (hallazgo 2 de la revisión) ---

/** Pide un reto para la acción indicada, lo verifica y devuelve el token. */
async function elevateFor(
  app: App,
  seed: Uint8Array,
  clock: TestClock,
  action: "data_export" | "account_deletion",
): Promise<string> {
  const denied = action === "data_export"
    ? await app.request("/api/me/data-export", { headers: AUTH_HEADER })
    : await app.request("/api/me", { method: "DELETE", headers: AUTH_HEADER });
  assertEquals(denied.status, 403);
  const { stepUpToken } = await denied.json();
  const verify = await post(app, "/api/mfa/verify", {
    stepUpToken,
    code: await generateTotp(seed, clock.unixSeconds()),
  });
  assertEquals(verify.status, 200);
  return (await verify.json()).elevatedToken;
}

Deno.test("el token elevado para exportar no sirve para eliminar la cuenta", async () => {
  const { app, repository, clock } = setup();
  const seed = await enrollTwoFactor(app, clock);
  clock.advanceSeconds(60);
  const elevatedToken = await elevateFor(app, seed, clock, "data_export");

  const res = await app.request("/api/me", {
    method: "DELETE",
    headers: { ...AUTH_HEADER, "X-Elevated-Token": elevatedToken },
  });

  assertEquals(res.status, 403);
  assertEquals((await res.json()).error, "mfa_required");
  assertEquals(repository.deletedUsers, []);
});

Deno.test("el token elevado para eliminar la cuenta no sirve para exportar", async () => {
  const { app, clock } = setup();
  const seed = await enrollTwoFactor(app, clock);
  clock.advanceSeconds(60);
  const elevatedToken = await elevateFor(app, seed, clock, "account_deletion");

  const res = await app.request("/api/me/data-export", {
    headers: { ...AUTH_HEADER, "X-Elevated-Token": elevatedToken },
  });

  assertEquals(res.status, 403);
  assertEquals((await res.json()).error, "mfa_required");
});
