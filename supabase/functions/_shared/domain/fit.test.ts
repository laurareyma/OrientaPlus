import { assertEquals } from "@std/assert";
import { assessFit, scopeOf } from "./fit.ts";
import {
  BOGOTA,
  CHIA,
  makeOpportunity,
  TEST_PROFILES,
  TODAY,
} from "./testing/fixtures.ts";
import type { Profile } from "./types.ts";

// P2: 22 años, Bogotá, universitario incompleto, menos de 1 año, medio tiempo.
const profile: Profile = TEST_PROFILES.P2;

Deno.test("una oportunidad sin restricciones cumple 5 de 5", () => {
  const fit = assessFit(profile, makeOpportunity(), TODAY);

  assertEquals(fit, {
    met: ["age", "location", "education", "experience", "availability"],
    unmet: [],
    percent: 100,
  });
});

Deno.test("un requisito sin cumplir da 4 de 5 (80 %)", () => {
  const fit = assessFit(
    profile,
    makeOpportunity({ minExperience: "1_3y" }),
    TODAY,
  );

  assertEquals(fit, {
    met: ["age", "location", "education", "availability"],
    unmet: ["experience"],
    percent: 80,
  });
});

Deno.test("ningún requisito cumplido da 0 de 5", () => {
  const fit = assessFit(
    profile,
    makeOpportunity({
      minAge: 25,
      municipalityCodes: [CHIA],
      minEducation: "postgraduate",
      minExperience: "gt_3y",
      availability: ["full_time"],
    }),
    TODAY,
  );

  assertEquals(fit, {
    met: [],
    unmet: ["age", "location", "education", "experience", "availability"],
    percent: 0,
  });
});

Deno.test("la edad igual a min_age o a max_age cuenta como cumplida", () => {
  const atMin = assessFit(profile, makeOpportunity({ minAge: 22 }), TODAY);
  const atMax = assessFit(profile, makeOpportunity({ maxAge: 22 }), TODAY);

  assertEquals(atMin.percent, 100);
  assertEquals(atMax.percent, 100);
});

Deno.test("el alcance distingue nacional, local y otro municipio", () => {
  assertEquals(scopeOf(BOGOTA, makeOpportunity()), "national");
  assertEquals(
    scopeOf(BOGOTA, makeOpportunity({ municipalityCodes: [CHIA, BOGOTA] })),
    "local",
  );
  assertEquals(
    scopeOf(BOGOTA, makeOpportunity({ municipalityCodes: [CHIA] })),
    "other_municipality",
  );
});

Deno.test("sin municipio en el perfil, solo se sabe si es nacional", () => {
  assertEquals(scopeOf(null, makeOpportunity()), "national");
  assertEquals(
    scopeOf(null, makeOpportunity({ municipalityCodes: [CHIA] })),
    null,
  );
});
