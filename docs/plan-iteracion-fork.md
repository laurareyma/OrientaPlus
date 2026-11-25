# Plan de la iteración en el fork: compatibilidad, filtros e IA

Plan para ejecutar la decisión [0010](decisions/0010-compatibilidad-filtros-e-ia.md) con ECC en `laurareyma/OrientaPlus`. Cada fase es una rama corta, termina con pruebas en verde y se puede revisar sola.

## Reglas para toda la iteración

- `AGENTS.md` sigue siendo la fuente canónica. Si una regla de ECC choca con `AGENTS.md`, gana `AGENTS.md`.
- Commits con el formato de [0008](decisions/0008-flujo-de-trabajo-git.md): `<gitmoji> <tipo>(<ámbito>): <descripción en español>`, sin `Co-Authored-By`.
- Ningún cambio en el ranking ni en la selección de 0005. Si una prueba existente de `domain/` falla, se para y se revisa.
- Las pruebas nunca llaman a Gemini ni a la red. El cliente de Gemini se inyecta y en las pruebas se usa un doble.
- Accesibilidad de `AGENTS.md` en toda pantalla que se toque, con su fila en `docs/accessibility/matriz-trazabilidad.md`.
- Verificación al cerrar cada fase:
  - Backend, desde la raíz: `npm run api:test`, `npm run api:check`, `npm run api:lint`, `npm run api:fmt:check`.
  - App, desde `apps/mobile`: `npm run typecheck`, `npm test`.

## Fase 0 — Preparación

- Rama `ecc-pruebas` o una por fase (`feature/compatibilidad`, `feature/filtros-explorar`, etc.).
- Confirmar que las verificaciones de arriba pasan **antes** de cambiar nada, y anotar cuántas pruebas hay. Ese es el punto de comparación.

## Fase 1 — Compatibilidad en el dominio y la API

**Archivos**
- Nuevo: `supabase/functions/_shared/domain/fit.ts` y `fit.test.ts`.
- Cambia: `supabase/functions/api/routes/opportunities.ts` (lista y detalle) y sus pruebas.

**Qué hace**
- `assessFit(profile, opportunity, today)` devuelve `{ met, unmet, percent }`, usando `findUnmetCriteria`.
- `GET /api/opportunities` y `GET /api/opportunities/:id` agregan `fit` (o `null` si el perfil está incompleto) y `scope` (`local`, `national`, `other_municipality`).

**Pruebas mínimas**
- 5 de 5, 4 de 5 y 0 de 5. Requisito `null` cuenta como cumplido. Bordes de edad iguales a `min_age` y `max_age`.
- Perfil incompleto → `fit: null`, sin error.
- `scope` para oportunidad nacional, local del perfil y local de otro municipio.

**Prompt para ECC**
> Lee `AGENTS.md`, `docs/decisions/0005-reglas-de-recomendacion.md` y la sección 1 de `docs/decisions/0010-compatibilidad-filtros-e-ia.md`. Planea primero y muéstrame el plan antes de escribir código. Implementa `assessFit` como función pura en `supabase/functions/_shared/domain/fit.ts`, reutilizando `findUnmetCriteria`, con pruebas en `fit.test.ts` (escribe las pruebas antes que la función). Después agrega `fit` y `scope` a las respuestas de `routes/opportunities.ts`, con pruebas en `opportunities.test.ts` usando los fakes de `api/testing/fakes.ts`. No toques `ranking.ts`, `recommendation.ts` ni sus pruebas. Al final corre `npm run api:test`, `npm run api:check`, `npm run api:lint` y `npm run api:fmt:check`, y dime cuáles pasaron.

## Fase 2 — Compatibilidad y filtros en la app

**Archivos**
- Cambian: `apps/mobile/src/store/api.ts` (tipos de la respuesta), `apps/mobile/app/(tabs)/explorar.tsx`, `apps/mobile/app/(tabs)/para-ti.tsx`, `apps/mobile/app/oportunidad/[id].tsx`.
- Nuevos: componente de compatibilidad en `apps/mobile/src/components/` y la lógica de filtros como función pura con su prueba.

**Qué hace**
- Tarjeta y detalle muestran "Cumples 4 de 5 requisitos (80 %). Te falta: experiencia". En "Para ti", "Cumples todos los requisitos".
- Explorar suma los filtros: solo las que cumplo, cierra pronto, ubicación y modalidad.
- El conteo de resultados se anuncia al cambiar un filtro.

**Pruebas mínimas**
- Función de filtros: cada filtro solo y combinados; lista vacía con mensaje accesible.
- Texto de compatibilidad para 5/5, 4/5 con un requisito faltante y 3/5 con dos.

**Prompt para ECC**
> Lee `AGENTS.md` (sección de accesibilidad) y la sección 2 de `docs/decisions/0010-compatibilidad-filtros-e-ia.md`. Planea primero. Actualiza los tipos de `apps/mobile/src/store/api.ts` con `fit` y `scope`. Saca la lógica de filtros de `explorar.tsx` a una función pura con pruebas, y agrega los filtros de la decisión. Crea un componente que muestre la compatibilidad con texto, sin depender solo del color, con etiqueta para VoiceOver y TalkBack. Usa los tokens de `src/theme/` y los componentes de `src/ui/`; no agregues dependencias. Agrega la fila correspondiente a `docs/accessibility/matriz-trazabilidad.md`. Al final corre `npm run typecheck` y `npm test` en `apps/mobile`.

## Fase 3 — Asistente de curación

**Archivos**
- Nuevos: `scripts/curacion/curar.ts`, su esquema Zod y su prueba con un doble de Gemini.
- Cambian: `package.json` de la raíz (script `curar`), `.gitignore` (carpeta de borradores), `docs/decisions/0007-curacion-de-oportunidades.md` (cómo se usa la herramienta).

**Qué hace**
- Recibe una URL oficial o un archivo de texto. Pide a Gemini un borrador con salida JSON estructurada y escribe el resultado en `docs/curacion/borradores/` (sin versionar).
- Cada campo trae la frase de la fuente que lo respalda o `null`.
- Nunca escribe `check_*`, `verified_by` ni `verified_at`, y nunca toca `supabase/seed.sql`.
- Permisos de Deno mínimos: red solo a la API de Gemini y al dominio de la URL dada, escritura solo en la carpeta de borradores.

**Prompt para ECC**
> Lee `AGENTS.md`, `docs/decisions/0007-curacion-de-oportunidades.md` y la sección 3a de `docs/decisions/0010-compatibilidad-filtros-e-ia.md`. Planea primero. Crea un script de Deno en `scripts/curacion/curar.ts` que genere un borrador de oportunidad con Gemini usando salida JSON estructurada, validada con Zod contra las columnas de `opportunities` en `supabase/migrations/20261110042232_esquema_inicial.sql`. Lee `GEMINI_API_KEY` y `GEMINI_MODEL` del entorno; no fijes un nombre de modelo en el código. Verifica en la documentación oficial de Gemini el formato vigente de la petición con esquema JSON antes de escribir el cliente. El script nunca debe llenar `check_*`, `verified_by` ni `verified_at`. Escribe pruebas con un doble del cliente, sin llamar a la red.

## Fase 4 — Consentimiento y endpoint de sugerencias

**Archivos**
- Cambian: `supabase/functions/api/deps.ts` (`AppSecrets` y cliente de Gemini inyectable), `supabase/functions/api/http/secrets.ts`, `supabase/.env.example`, `supabase/functions/_shared/catalog/consent.ts` (`CONSENT_VERSION`), `supabase/functions/api/app.ts`.
- Nuevos: `supabase/functions/api/routes/interests.ts` y su prueba, cliente de Gemini en `supabase/functions/api/infra/`.

**Qué hace**
- `POST /api/me/interests/suggest` con `{ text }` de 1 a 300 caracteres, validado con Zod `.strict()`.
- Responde `{ categories }`, solo con valores de `CATEGORIES`.
- Sin `GEMINI_API_KEY` o `GEMINI_MODEL` responde que la función no está disponible, con el formato de `http/errors.ts`.
- El texto no se guarda ni se registra en logs.
- Tiempo máximo de 8 segundos.

**Pruebas mínimas**
- Texto válido → categorías del doble.
- Texto vacío, de más de 300 caracteres o con campos extra → 400 con mensaje claro.
- Sin configuración → respuesta de "no disponible".
- El doble devuelve una categoría que no existe → se descarta.
- Sin sesión → 401, como las demás rutas de `/me`.

**Prompt para ECC**
> Lee `AGENTS.md`, `docs/decisions/0002-autenticacion-y-step-up.md` (cómo se manejan los secretos) y la sección 3b de `docs/decisions/0010-compatibilidad-filtros-e-ia.md`. Planea primero. Agrega `GEMINI_API_KEY` y `GEMINI_MODEL` a `AppSecrets` siguiendo el patrón existente, y un cliente de Gemini inyectable en `AppDependencies` con un doble en `api/testing/fakes.ts`. Crea `POST /api/me/interests/suggest` con validación Zod, respuesta restringida a `CATEGORIES`, tiempo máximo de 8 segundos y sin guardar ni registrar el texto. Escribe las pruebas antes que la ruta. Sube `CONSENT_VERSION`. Después usa el agente security-reviewer para revisar la ruta nueva: entrada sin validar, filtrado del texto a los logs y prompt injection.

## Fase 5 — Intereses en palabras propias en el cuestionario

**Archivos**
- Cambian: `apps/mobile/app/cuestionario.tsx` (paso de intereses y texto de consentimiento), `apps/mobile/src/store/api.ts`, `apps/mobile/src/profile/`.

**Qué hace**
- Campo opcional en el paso de intereses, con el aviso de no escribir datos personales y contador de caracteres.
- Botón "Sugerir categorías". Las sugerencias quedan marcadas en los botones y la persona las confirma.
- Si la función no está disponible, el campo no aparece. Si falla, mensaje claro y se sigue con los botones.
- Consentimiento: línea nueva sobre Gemini y ajuste de "no compartimos tus datos con terceros".
- El texto libre no entra en el borrador local (`src/profile/draft.ts`).

**Pruebas mínimas**
- Las sugerencias no se guardan sin confirmación.
- El texto libre no aparece en el borrador ni en el cuerpo de `PUT /api/me/profile`.
- Estados de carga, error y "no disponible" con texto accesible.

## Cierre

- Correr la suite completa de backend y app.
- `npx ecc-agentshield scan` sobre la configuración de Claude Code del fork.
- Comparar con la Fase 0: pruebas nuevas, hallazgos de seguridad y qué tanto hubo que corregir a mano a ECC. Esa comparación es la conclusión de la prueba de ECC.
