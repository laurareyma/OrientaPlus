import { Hono } from "hono";
import { toLocalDate } from "../../_shared/domain/dates.ts";
import { assessFit, scopeOf } from "../../_shared/domain/fit.ts";
import type { OpportunityForRanking } from "../../_shared/domain/types.ts";
import { evaluateValidity } from "../../_shared/domain/validity.ts";
import type { AppDependencies } from "../deps.ts";
import { errorBody } from "../http/errors.ts";
import { type AppEnv, requireUser } from "../middleware/auth.ts";
import { toCompleteProfile } from "../profile-completeness.ts";

/**
 * GET /api/opportunities: todas las oportunidades vigentes, para explorar
 * además de las recomendadas. Primero las que cierran antes; las abiertas sin
 * fecha límite van al final.
 *
 * GET /api/opportunities/:id: detalle de una oportunidad.
 *
 * Ambas agregan `fit` (requisitos cumplidos, o null si el perfil está
 * incompleto) y `scope` (local, nacional u otro municipio), según la
 * decisión 0010.
 */
export function opportunityRoutes(deps: AppDependencies) {
  const app = new Hono<AppEnv>();
  app.use("*", requireUser(deps.auth));

  /** Prepara el cálculo de `fit` y `scope` con el perfil guardado. */
  async function fitContextFor(userId: string, now: Date) {
    const stored = await deps.repository.getProfile(userId);
    const profile = toCompleteProfile(stored);
    const today = toLocalDate(now);
    const municipalityCode = stored?.municipalityCode ?? null;
    return (opportunity: OpportunityForRanking) => ({
      fit: profile ? assessFit(profile, opportunity, today) : null,
      scope: scopeOf(municipalityCode, opportunity),
    });
  }

  app.get("/", async (c) => {
    const now = deps.now();
    const fitOf = await fitContextFor(c.get("user").id, now);
    const opportunities = await deps.repository.listActiveOpportunities();
    const items = opportunities
      .map((o) => ({ o, validity: evaluateValidity(o, now) }))
      .filter(({ validity }) => validity.kind !== "closed")
      .sort((a, b) =>
        (a.o.deadline ?? "9999-12-31").localeCompare(
          b.o.deadline ?? "9999-12-31",
        )
      )
      .map(({ o, validity }) => ({
        id: o.id,
        title: o.title,
        summaryPlain: o.summaryPlain,
        category: o.category,
        entityName: o.entityName,
        modality: o.modality,
        deadline: o.deadline,
        validity,
        ...fitOf(o),
      }));
    return c.json({ items });
  });

  app.get("/:id", async (c) => {
    const opportunity = await deps.repository.getOpportunity(c.req.param("id"));
    if (!opportunity) {
      return c.json(
        errorBody("not_found", "No encontramos esta oportunidad."),
        404,
      );
    }

    // Para retomar el progreso (Fase 2, C3) se registra la primera vista.
    await deps.repository.recordView(c.get("user").id, opportunity.id);

    // Si se abre por enlace directo y ya venció, se muestra como cerrada.
    const now = deps.now();
    const fitOf = await fitContextFor(c.get("user").id, now);
    const { status: _status, ...visible } = opportunity;
    return c.json({
      ...visible,
      validity: evaluateValidity(opportunity, now),
      ...fitOf(opportunity),
    });
  });

  return app;
}
