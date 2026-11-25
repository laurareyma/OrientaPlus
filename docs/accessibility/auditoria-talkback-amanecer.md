# Auditoría con TalkBack y Accessibility Scanner: diseño Amanecer

**Responsable:** Laura Vanesa Reyes Martínez
**Fecha de ejecución:** _(completar)_
**Dispositivo y versión de Android:** _(completar; por ejemplo "Samsung A54, Android 14")_
**Versión de TalkBack:** _(Ajustes → Accesibilidad → TalkBack → Configuración → Acerca de)_
**Commit probado:** _(resultado de `git rev-parse --short HEAD`)_

Este protocolo reemplaza los pasos de `docs/demo/guia-pruebas-android.md` para el diseño actual. Esa guía se escribió antes del rediseño del 2026-11-12, y varias de sus pantallas ya no existen.

**Regla:** solo se anota lo que se observa en el teléfono. Si algo no se pudo probar, se escribe "No probado" y el motivo.

---

## 1. Preparación

1. El teléfono y el computador deben estar en la misma red, o se usa el modo túnel.
2. Desde `apps/mobile`, ejecutar `npm run start:tunnel`. Es necesario para que funcione el inicio de sesión con Google (ver README).
3. Abrir el código QR con Expo Go.
4. Iniciar sesión **antes** de activar TalkBack. Así la prueba se concentra en la app y no en la pantalla de Google.
5. Activar TalkBack en Ajustes → Accesibilidad → TalkBack. Con el lector activo, el volumen multimedia debe estar al 70 % o más.

### Gestos de TalkBack que se usan

| Gesto | Acción |
|---|---|
| Deslizar un dedo a la derecha o a la izquierda | Siguiente o anterior elemento |
| Doble toque | Activar el elemento enfocado |
| Deslizar dos dedos hacia arriba o hacia abajo | Desplazar la pantalla |
| Deslizar arriba y luego abajo (o el menú de controles de lectura) → "Encabezados" | Saltar de encabezado en encabezado |
| Con un control ajustable enfocado: deslizar hacia arriba o hacia abajo, o usar las teclas de volumen | Subir o bajar el valor |

## 2. Recorrido

En "Resultado observado" se escribe lo que TalkBack dijo o hizo. En "¿Cumple?" se marca Sí, No o Parcial.

| # | Pantalla y acción | Qué comprobar | ID | Resultado observado | ¿Cumple? |
|---|---|---|---|---|---|
| 1 | **Bienvenida**: recorrer de arriba a abajo | El orden de lectura sigue el visual. El título se anuncia como "encabezado". El enlace "Accesibilidad" se anuncia como botón. | V3, M2 | | |
| 2 | **Accesibilidad**: tema | "Según el teléfono", "Claro" y "Oscuro" se anuncian como botón de opción, con su estado. Al cambiar el tema, la pantalla cambia al instante. | F5, V3 | | |
| 3 | **Accesibilidad**: tamaño del texto | El control dice "Tamaño del texto" y el porcentaje. Se puede subir y bajar con el gesto de ajuste sin salir del control. | F1 | | |
| 4 | **Accesibilidad**: tamaño al 160 % y recorrer Para ti, el detalle y el cuestionario | Ningún texto se corta, se superpone ni queda fuera de la pantalla. Anotar la pantalla exacta si algo falla. | F1 | | |
| 5 | **Accesibilidad**: vibración | El interruptor anuncia su etiqueta y "activado" o "desactivado". | F7 | | |
| 6 | **Cuestionario** (Perfil → editar respuestas): pasar de pregunta | Al cambiar de paso se anuncia "Paso N de M" y la pregunta (M es 8 en el primer uso y 7 al editar con el consentimiento vigente). La barra de progreso se lee como barra de progreso. | C2 | | |
| 7 | **Cuestionario**: una pregunta de una sola opción | Cada opción se anuncia como "botón de opción" y dice si está marcada. Al marcar una, se anuncia el cambio. | V3, V2 | | |
| 8 | **Cuestionario**: intereses (varias opciones) | Las opciones se anuncian como "casilla de verificación", con su estado. | V3 | | |
| 9 | **Cuestionario**: fecha de nacimiento | El selector de fecha se puede operar con TalkBack. La fecha elegida se lee en un solo foco, con la edad. | V3, F2 | | |
| 10 | **Cuestionario sin sesión**: cerrar sesión en Perfil, empezar el cuestionario desde la Bienvenida, responder 2 preguntas, cerrar la app por completo y volver a abrirla. El borrador solo se guarda en el primer uso; al editar un perfil existente no se guarda. | Se anuncia "Retomamos tus respuestas donde ibas" y aparecen las respuestas anteriores. | C3, M3 | | |
| 11 | **Para ti**: recorrer las tarjetas | Cada tarjeta es **un solo foco** y anuncia: título, **vigencia** ("Convocatoria vigente" o "Atención: Cierra en N días"), categoría, modalidad, entidad y razones. | F2, V2 (**confirma H2**) | | |
| 12 | **Para ti**: el ♡ de una tarjeta | El ♡ es un foco aparte, se anuncia como botón y se puede activar. | M1, F2 | | |
| 13 | **Detalle de una oportunidad** | El título se anuncia como encabezado. Los datos (cierre, modalidad) se leen agrupados ("Cierre: …"). Los requisitos se pueden recorrer. | V3, F2 | | |
| 14 | **Detalle**: botón "Escuchar" | Lee la oportunidad en español. Se detiene al volver atrás. Anotar si se superpone con TalkBack. | F6 | | |
| 15 | **Detalle**: botón "Postularme en el sitio oficial" | Se anuncia como botón, con la pista "Abre el sitio oficial de la entidad en el navegador del sistema…". Mientras abre dice "Abriendo sitio oficial…". Abre el sitio de la entidad. | V3, F3 | | |
| 16 | **Explorar**: escribir en la búsqueda | El campo dice "Buscar oportunidades". Al escribir se anuncia el número de resultados. "Borrar búsqueda" se puede enfocar. | V3, F4 | | |
| 17 | **Explorar**: buscar una palabra sin resultados | Se anuncia "Sin resultados" y el mensaje. Si hay un botón de acción, se puede enfocar y activar. | F3 (H1) | | |
| 18 | **Error de red**: modo avión y deslizar hacia abajo para recargar en Explorar o Para ti | Se anuncia el error. El botón "Reintentar" **se puede enfocar** como elemento aparte y, con la red de vuelta, recarga los datos. Si la lista sigue visible porque está en caché, anotarlo. | F3 (**H1**) | | |
| 19 | **Perfil → Seguridad**: abrir el modal de verificación en dos pasos (si está activo) | El foco no sale del modal mientras está abierto. El botón Atrás de Android lo cierra. "Cancelar" siempre está disponible. | M2, S1 | | |
| 20 | **Pestañas**: recorrer la barra inferior | Para ti, Explorar, Guardadas y Perfil se anuncian como pestañas, y se indica cuál está seleccionada. | V3 | | |
| 21 | **Tema oscuro**: repetir los pasos 11 y 13 | Se lee igual. Anotar cualquier texto difícil de distinguir. | V1, F5 | | |

**H1 en Android:** TalkBack suele alcanzar botones dentro de un grupo, así que el paso 18 no basta para confirmar la corrección. La confirmación definitiva es con VoiceOver en iOS (auditoría pendiente en el iPhone de Carlos). En Android se registra si el botón se puede enfocar y activar.

## 3. Accessibility Scanner

1. Instalar Accessibility Scanner desde Google Play y activarlo.
2. Con TalkBack apagado, capturar con el botón flotante cada una de estas pantallas:
   - Bienvenida;
   - Accesibilidad;
   - una pregunta del cuestionario;
   - Para ti;
   - detalle;
   - Explorar;
   - Perfil.
3. Anotar cada sugerencia, aunque se considere un falso positivo.

| Pantalla | Sugerencias (tipo y elemento) | ¿Defecto real? | Comentario |
|---|---|---|---|
| Bienvenida | | | |
| Accesibilidad | | | |
| Cuestionario | | | |
| Para ti | | | |
| Detalle | | | |
| Explorar | | | |
| Perfil | | | |

## 4. Defectos encontrados

| # | Paso | Descripción | Gravedad (alta / media / baja) | Archivo probable | Estado |
|---|---|---|---|---|---|
| | | | | | |

## 5. Registro en la matriz

Al terminar se agregan dos filas a la sección 4 de `docs/accessibility/matriz-trazabilidad.md`, una para TalkBack y otra para Accessibility Scanner. Además se actualizan:

- las filas de la matriz cuyo estado cambie, por ejemplo V3, F1 y F2 si se confirman en el dispositivo;
- la sección 3.6 de `docs/informe/seccion-3-accesibilidad.md` (H2 confirmado; H1 confirmado en Android).

Formato de la fila:

```
| <fecha> | <dispositivo> / Android <versión> | TalkBack <versión> | Diseño Amanecer: pasos 1 a 21 de docs/accessibility/auditoria-talkback-amanecer.md | <resumen: N pasos cumplen, defectos encontrados> | Laura Vanesa Reyes Martínez | <Validado o Con defectos> |
```
