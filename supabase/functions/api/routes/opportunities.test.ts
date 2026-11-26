import { assertEquals } from "@std/assert";
import {
  AUTH_HEADER,
  COMPLETE_PROFILE,
  createTestApp,
  makeOpportunityRecord,
  TEST_USER,
} from "../testing/fakes.ts";

Deno.test("GET /api/opportunities/:id devuelve el detalle y registra la vista", async () => {
  const { app, repository } = createTestApp();
  const opportunity = makeOpportunityRecord({ deadline: "2026-11-12" });
  repository.opportunities = [opportunity];

  const res = await app.request(`/api/opportunities/${opportunity.id}`, {
    headers: AUTH_HEADER,
  });
  const body = await res.json();

  assertEquals(res.status, 200);
  assertEquals(body.id, opportunity.id);
  assertEquals(body.officialUrl, "https://example.com/inscripcion");
  assertEquals(body.sourceUrl, "https://example.com/convocatoria");
  assertEquals(body.requirements, ["Tener entre 18 y 28 años."]);
  assertEquals(body.verifiedBy, "Equipo de prueba");
  assertEquals(body.validity, { kind: "closing_soon", daysLeft: 3 });
  assertEquals(repository.views, [
    { userId: TEST_USER.id, opportunityId: opportunity.id },
  ]);
});

Deno.test("una oportunidad vencida o retirada se muestra como cerrada", async () => {
  const { app, repository } = createTestApp();
  const expired = makeOpportunityRecord({ deadline: "2026-10-01" });
  const withdrawn = makeOpportunityRecord({ status: "withdrawn" });
  repository.opportunities = [expired, withdrawn];

  for (const opportunity of [expired, withdrawn]) {
    const body = await (await app.request(
      `/api/opportunities/${opportunity.id}`,
      { headers: AUTH_HEADER },
    )).json();
    assertEquals(body.validity, { kind: "closed" });
  }
});

Deno.test("una oportunidad inexistente responde 404", async () => {
  const { app } = createTestApp();

  const res = await app.request("/api/opportunities/no-existe", {
    headers: AUTH_HEADER,
  });

  assertEquals(res.status, 404);
  assertEquals((await res.json()).error, "not_found");
});

Deno.test("el detalle exige sesión", async () => {
  const { app, repository } = createTestApp();
  const opportunity = makeOpportunityRecord();
  repository.opportunities = [opportunity];

  const res = await app.request(`/api/opportunities/${opportunity.id}`);

  assertEquals(res.status, 401);
});

Deno.test("GET /api/opportunities lista las vigentes, primero las que cierran antes", async () => {
  const { app, repository } = createTestApp();
  repository.opportunities = [
    makeOpportunityRecord({ id: "abierta", deadline: null }),
    makeOpportunityRecord({ id: "cerrada", deadline: "2026-11-01" }),
    makeOpportunityRecord({ id: "pronto", deadline: "2026-11-12" }),
    makeOpportunityRecord({ id: "despues", deadline: "2026-12-20" }),
    makeOpportunityRecord({ id: "retirada", status: "withdrawn" }),
  ];

  const res = await app.request("/api/opportunities", { headers: AUTH_HEADER });
  const body = await res.json();

  assertEquals(res.status, 200);
  assertEquals(
    body.items.map((i: { id: string }) => i.id),
    ["pronto", "despues", "abierta"],
  );
  assertEquals(body.items[0].validity, { kind: "closing_soon", daysLeft: 3 });
  // La lista no registra vistas: solo el detalle lo hace.
  assertEquals(repository.views, []);
});

Deno.test("GET /api/opportunities sin sesión responde 401", async () => {
  const { app } = createTestApp();

  const res = await app.request("/api/opportunities");

  assertEquals(res.status, 401);
});

// COMPLETE_PROFILE: 19 años, Chía (25175), bachiller, sin experiencia, flexible.
const CHIA = "25175";
const BOGOTA = "11001";

Deno.test("GET /api/opportunities agrega compatibilidad y alcance", async () => {
  const { app, repository } = createTestApp();
  repository.profiles.set(TEST_USER.id, COMPLETE_PROFILE);
  repository.opportunities = [
    makeOpportunityRecord({ id: "nacional", deadline: "2026-12-01" }),
    makeOpportunityRecord({
      id: "local",
      deadline: "2026-12-02",
      municipalityCodes: [CHIA],
    }),
    makeOpportunityRecord({
      id: "otra",
      deadline: "2026-12-03",
      municipalityCodes: [BOGOTA],
      minExperience: "1_3y",
    }),
  ];

  const body = await (await app.request("/api/opportunities", {
    headers: AUTH_HEADER,
  })).json();

  const [nacional, local, otra] = body.items;
  assertEquals(nacional.fit.percent, 100);
  assertEquals(nacional.scope, "national");
  assertEquals(local.fit.unmet, []);
  assertEquals(local.scope, "local");
  assertEquals(otra.fit, {
    met: ["age", "education", "availability"],
    unmet: ["location", "experience"],
    percent: 60,
  });
  assertEquals(otra.scope, "other_municipality");
});

Deno.test("con el perfil incompleto, fit es null y la lista responde igual", async () => {
  const { app, repository } = createTestApp();
  repository.profiles.set(TEST_USER.id, {
    ...COMPLETE_PROFILE,
    educationLevel: null,
  });
  repository.opportunities = [
    makeOpportunityRecord({ municipalityCodes: [CHIA] }),
  ];

  const res = await app.request("/api/opportunities", { headers: AUTH_HEADER });
  const [item] = (await res.json()).items;

  assertEquals(res.status, 200);
  assertEquals(item.fit, null);
  // El municipio sí está guardado, así que el alcance se puede calcular.
  assertEquals(item.scope, "local");
});

Deno.test("sin perfil, fit es null y solo se sabe si es nacional", async () => {
  const { app, repository } = createTestApp();
  repository.opportunities = [
    makeOpportunityRecord({ id: "nacional", deadline: "2026-12-01" }),
    makeOpportunityRecord({
      id: "local",
      deadline: "2026-12-02",
      municipalityCodes: [CHIA],
    }),
  ];

  const body = await (await app.request("/api/opportunities", {
    headers: AUTH_HEADER,
  })).json();

  assertEquals(
    body.items.map((i: { fit: unknown; scope: unknown }) => [i.fit, i.scope]),
    [[null, "national"], [null, null]],
  );
});

Deno.test("GET /api/opportunities/:id agrega compatibilidad y alcance", async () => {
  const { app, repository } = createTestApp();
  repository.profiles.set(TEST_USER.id, COMPLETE_PROFILE);
  const opportunity = makeOpportunityRecord({
    municipalityCodes: [BOGOTA],
    minEducation: "university",
  });
  repository.opportunities = [opportunity];

  const body = await (await app.request(
    `/api/opportunities/${opportunity.id}`,
    { headers: AUTH_HEADER },
  )).json();

  assertEquals(body.fit, {
    met: ["age", "experience", "availability"],
    unmet: ["location", "education"],
    percent: 60,
  });
  assertEquals(body.scope, "other_municipality");
});

Deno.test("el detalle sin perfil devuelve fit null", async () => {
  const { app, repository } = createTestApp();
  const opportunity = makeOpportunityRecord();
  repository.opportunities = [opportunity];

  const body = await (await app.request(
    `/api/opportunities/${opportunity.id}`,
    { headers: AUTH_HEADER },
  )).json();

  assertEquals(body.fit, null);
  assertEquals(body.scope, "national");
});
