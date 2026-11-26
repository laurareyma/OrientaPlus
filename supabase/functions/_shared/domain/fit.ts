import { type EligibilityCriterion, findUnmetCriteria } from "./eligibility.ts";
import type { OpportunityForRanking, Profile } from "./types.ts";

/**
 * Compatibilidad = requisitos de elegibilidad cumplidos (decisión 0010,
 * sección 1). Se mide sobre los cinco requisitos de 0005, no sobre el puntaje
 * de ranking, que mezcla urgencia ("por cerrar") y cercanía ("local").
 */

/** Los cinco requisitos, en el mismo orden en que los revisa la elegibilidad. */
export const ELIGIBILITY_CRITERIA: readonly EligibilityCriterion[] = [
  "age",
  "location",
  "education",
  "experience",
  "availability",
];

export interface FitAssessment {
  met: EligibilityCriterion[];
  unmet: EligibilityCriterion[];
  /** Requisitos cumplidos sobre 5: 0, 20, 40, 60, 80 o 100. */
  percent: number;
}

/** Dónde aplica una oportunidad respecto al municipio del perfil. */
export type OpportunityScope = "local" | "national" | "other_municipality";

/**
 * Cuántos de los cinco requisitos cumple el perfil. Un requisito sin
 * restricción en la oportunidad (campo null) cuenta como cumplido.
 */
export function assessFit(
  profile: Profile,
  opportunity: OpportunityForRanking,
  today: string,
): FitAssessment {
  const unmet = findUnmetCriteria(profile, opportunity, today);
  const met = ELIGIBILITY_CRITERIA.filter((c) => !unmet.includes(c));
  return {
    met,
    unmet,
    percent: (met.length / ELIGIBILITY_CRITERIA.length) * 100,
  };
}

/**
 * Alcance de la oportunidad. Las nacionales o virtuales (sin municipios) son
 * "national" aunque el perfil no tenga municipio; para las demás hace falta
 * el municipio del perfil, y sin él se devuelve null.
 */
export function scopeOf(
  municipalityCode: string | null,
  opportunity: Pick<OpportunityForRanking, "municipalityCodes">,
): OpportunityScope | null {
  if (opportunity.municipalityCodes === null) return "national";
  if (municipalityCode === null) return null;
  return opportunity.municipalityCodes.includes(municipalityCode)
    ? "local"
    : "other_municipality";
}
