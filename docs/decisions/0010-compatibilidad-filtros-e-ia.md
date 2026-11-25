# 0010 — Compatibilidad, filtros e IA en la curación y el cuestionario

- **Estado:** propuesta. Aplica solo al fork de Laura (`laurareyma/OrientaPlus`); no se ha llevado al repositorio del equipo.
- **Fecha:** 2026-11-25.
- **Relación con otras decisiones:** reemplaza parcialmente [0005](0005-reglas-de-recomendacion.md) en un único punto: la frase "se descartan modelos estadísticos o LLM" deja de aplicar a la curación de oportunidades y a la captura de intereses. Las reglas de vigencia, elegibilidad, ranking y selección de 0005 no cambian. Amplía [0007](0007-curacion-de-oportunidades.md) con una herramienta de apoyo a la curación.

## Contexto

En la primera entrega no se podía usar IA, y por eso 0005 dejó el ranking en reglas deterministas. En esta iteración del fork sí se puede. Hay tres mejoras pedidas:

1. Mostrar qué tan compatible es la persona con cada convocatoria.
2. Filtrar las convocatorias en Explorar.
3. Usar IA para mejorar el resultado.

Hechos del código que condicionan el diseño:

- En "Para ti" solo aparecen oportunidades elegibles. Todas cumplen los cinco requisitos de 0005.
- `findUnmetCriteria` (`supabase/functions/_shared/domain/eligibility.ts`) ya devuelve los requisitos que el perfil no cumple.
- El puntaje de `ranking.ts` va de 0 a 7, pero incluye "por cerrar" (+1), que no mide compatibilidad, y "local" (+1), que una convocatoria nacional nunca suma.
- Explorar (`apps/mobile/app/(tabs)/explorar.tsx`) ya filtra por categoría y texto, en el cliente.
- El texto de consentimiento del cuestionario dice: "no compartimos tus datos con terceros".

Hechos de Gemini que condicionan el diseño (términos vigentes desde el 23 de marzo de 2026, <https://ai.google.dev/gemini-api/terms>):

- En la cuota gratuita, Google usa lo que se envía para mejorar sus productos, personas pueden revisarlo y los términos piden no enviar información personal.
- La API solo cuenta como servicio pago si se usa desde un proyecto de Google Cloud con facturación activa.
- Los términos exigen 18 años o más y prohíben apps dirigidas a menores de 18. Orienta+ atiende a personas de 18 a 29 años.

## Decisión

### 1. Compatibilidad = requisitos cumplidos

La compatibilidad se calcula sobre los cinco requisitos de elegibilidad de 0005 (edad, ubicación, educación, experiencia y disponibilidad), no sobre el puntaje de ranking.

- Un requisito sin restricción en la oportunidad (campo `null`) cuenta como cumplido.
- `porcentaje = requisitos cumplidos / 5`, redondeado a entero. Valores posibles: 0, 20, 40, 60, 80 y 100.
- Se muestra siempre con texto, no solo con el número ni solo con color: "Cumples 4 de 5 requisitos (80 %). Te falta: experiencia".
- En "Para ti" todas son 5 de 5. Ahí se muestra "Cumples todos los requisitos" y no se muestra porcentaje.
- La lógica vive en una función pura nueva del dominio (`assessFit`), construida sobre `findUnmetCriteria`, con pruebas en `deno test`.
- Si el perfil está incompleto, la API devuelve `fit: null` y la app no muestra compatibilidad.

### 2. Filtros de Explorar

Se suman cuatro filtros a los de categoría y texto:

| Filtro | Regla |
|---|---|
| Solo las que cumplo | `fit.unmet` vacío |
| Cierra pronto | `validity.kind === "closing_soon"` (7 días o menos, según 0005) |
| Ubicación | "En mi municipio" si `municipalityCodes` incluye el del perfil; "Nacional o virtual" si es `null` |
| Modalidad | Presencial, virtual o híbrida (`modality`) |

El filtrado se hace en la app, porque hay pocas oportunidades. La API agrega a cada elemento de `GET /api/opportunities` los campos `fit` y `scope` (`local`, `national` u `other_municipality`). Cada filtro es un botón con `accessibilityState` de seleccionado, y el conteo de resultados se anuncia al cambiar.

### 3. IA, solo en dos lugares y nunca en el ranking

La IA **no** decide qué se recomienda ni en qué orden. El ranking de 0005 sigue determinista. La IA se usa en dos puntos, siempre con una persona que confirma.

#### 3a. Asistente de curación (sin datos de usuarios)

- Script local para quien cura, no un endpoint público.
- Entrada: el texto de la página oficial de la convocatoria (pegado o descargado por el script desde `official_url`).
- Salida: un borrador con los campos de `opportunities` (`title`, `summary_plain`, `category`, `entity_name`, `deadline`, `min_age`, `max_age`, `min_education`, `min_experience`, `availability`, `municipality_codes`, `modality`, `requirements`). Cada campo trae la frase de la fuente que lo respalda, o `null` si la fuente no lo dice.
- La salida se pide con esquema JSON estructurado y se valida con Zod antes de escribir el borrador.
- La IA **nunca** llena `check_*`, `verified_by` ni `verified_at`. Esos los marca un integrante después de abrir la página oficial, como exige 0007. El borrador no se carga solo a `seed.sql`.
- Como no hay datos personales, puede usar la cuota gratuita de Gemini.

#### 3b. Intereses en palabras propias (con datos de usuarios)

- En el paso de intereses del cuestionario se agrega un campo opcional: "Cuéntanos con tus palabras qué buscas". Los botones de categoría siguen ahí y siguen siendo la forma principal de responder.
- La app envía el texto a un endpoint propio, `POST /api/me/interests/suggest`. La Edge Function llama a Gemini con un esquema que solo admite valores de `CATEGORIES`, y devuelve categorías sugeridas.
- La app marca las sugerencias en los botones y la persona las confirma o las cambia. Lo que se guarda en el perfil son las categorías confirmadas, como hoy.
- El texto libre **no se guarda** en la base de datos ni en los registros.
- Límite de 300 caracteres. Se valida con Zod en el servidor. Debajo del campo se avisa: "No escribas datos como tu nombre, documento o teléfono".
- Como es texto escrito por una persona, solo se usa la API de Gemini en modo pago (proyecto de Google Cloud con facturación activa). Sin esa configuración, el endpoint responde que la función no está disponible y la app oculta el campo.
- Cambia el consentimiento: nueva `CONSENT_VERSION` y una línea nueva que diga que, si la persona escribe con sus palabras, ese texto se envía a Google Gemini solo para sugerirle categorías y no se guarda. Se ajusta también "no compartimos tus datos con terceros", que dejaría de ser cierto.
- Si Gemini falla o tarda más de 8 segundos, se muestra un mensaje claro y la persona sigue con los botones.

### Configuración

- Secretos de la Edge Function: `GEMINI_API_KEY` y `GEMINI_MODEL`. El modelo no se fija en el código, porque Google cambia los nombres seguido. Se elige un modelo Flash vigente en <https://ai.google.dev/gemini-api/docs/models>.
- Se agregan a `supabase/.env.example` sin valores y a `AppSecrets` (`supabase/functions/api/deps.ts`).
- El cliente de Gemini se inyecta en `AppDependencies`, para que las pruebas usen un doble en memoria y nunca llamen a la red.

## Alternativas descartadas

- **Porcentaje con el puntaje de ranking (0–7):** mezcla compatibilidad con urgencia ("por cerrar") y castiga a las convocatorias nacionales.
- **IA que ordena las recomendaciones:** se pierde la explicación línea por línea de 0005, y cada razón mostrada tendría que provenir de una regla.
- **IA que redacta las razones de la recomendación:** puede inventar razones que no salen de una regla. Queda para después, si se demuestra que no lo hace.
- **Mandar el texto libre a la cuota gratuita:** los términos piden no enviar información personal a esa cuota.

## Consecuencias

- La compatibilidad es fácil de explicar, pero solo tiene seis valores posibles. Es una medida de requisitos, no de afinidad.
- Los intereses escritos dependen de una configuración paga. Sin ella la app funciona igual que antes.
- Las personas que ya aceptaron el consentimiento anterior tienen que aceptar el nuevo, porque cambia `CONSENT_VERSION`.
- La curación sigue siendo manual en lo que importa: abrir la fuente y verificar. La IA ahorra la transcripción.

## Por validar

- Costo real de la API paga con el volumen de la demo.
- Si las sugerencias de categorías aciertan con frases reales de jóvenes. Se prueba con un conjunto de frases de ejemplo escritas por el equipo, sin datos de personas reales.
- Qué tanto se equivoca el borrador de curación. Se registra en cada oportunidad curada con la herramienta.
