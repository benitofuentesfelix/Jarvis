# JARVIS · Estado del desarrollo

Última actualización: 3 de noviembre de 2026 · Fase 1 + mejora de motor e interfaz

## Lo que funciona hoy (verificado con pruebas reales)

| Pieza | Estado | Cómo está comprobado |
| --- | --- | --- |
| Motor de planificación (`packages/core`) | Funciona | 34 pruebas automáticas: sin solapes, respeta clases y eventos personales, respeta el límite diario y el máximo por asignatura, termina los exámenes con simulacro, entrega las tareas con margen, es determinista |
| Repetición espaciada (SM-2) | Funciona | Probado: el intervalo crece al acertar y se reinicia al fallar |
| Action Gateway (permisos) | Funciona | Probado: automático solo en el calendario JARVIS; eventos personales y Notion piden aprobación; modo solo lectura bloquea todo |
| Esquema de base de datos | Validado | 24 tablas y 95 políticas RLS ejecutadas en un Postgres real |
| Control Center (6 pantallas) | Funciona | Compila sin errores; probado en Chromium de escritorio y en iPhone 14 Pro, sin errores de consola ni desbordes |
| Centro de comandos | Funciona | Entiende órdenes en español y ejecuta la replanificación de verdad (probado: «Tengo examen de Economía el 20 de noviembre» → 5 bloques nuevos, 5 movidos) |
| PWA instalable | Funciona | Manifest, service worker, iconos; el service worker se registra |
| Notificaciones push | Listo, sin claves | El flujo está escrito; falta generar las claves VAPID y desplegar en HTTPS |
| Integración con Claude | Listo, sin clave | `/api/command` usa Claude Sonnet 5.5 si hay `ANTHROPIC_API_KEY`; si no, usa el motor local |

## Mejoras del 3 de noviembre (segunda versión)

**Motor de estudio** (`packages/core/src/methods.ts`, pruebas en `test/smart.test.ts`):

- Cada examen se prepara por fases: entender (ejemplos resueltos o elaboración si el tema está por debajo del 50 %), practicar sin mirar, mezclar temas, simulacro con al menos un día de margen, análisis de errores y repaso ligero la víspera.
- Los temas más flojos reciben más sesiones, y cada repetición sube de fase.
- Cada bloque trae un guion minuto a minuto (pasos de 5 min que suman la duración exacta) adaptado a si la asignatura es de problemas, de teoría o de idioma. Cambridge tiene guiones propios por parte del examen.
- Horas de máxima concentración: simulacros y temas difíciles van ahí; repasos ligeros, fuera.
- Ritmo aprendido: si marcas «a medias», JARVIS amplía el tiempo de esa asignatura (factor entre 0,8 y 1,5).
- Margen diario libre de trabajo flexible para que los imprevistos no descoloquen todo.
- Día ligero con media carga, salvo que haya examen en los dos días siguientes.
- Evita poner la misma asignatura seguida cuando hay alternativa.
- Retención estimada por tema (curva de olvido calibrada al 90 % en el día de repaso).
- El plan ya no se desplaza cada minuto: se ancla a la media hora.
- Avisos nuevos: tema flojo antes de un examen (con lo que JARVIS ha hecho al respecto) y asignatura que te lleva más de lo previsto.

**Interfaz** («Halo»): portada centrada en una sola cosa (qué toca ahora, con su método, su porqué y su guion), línea del día, modo foco a pantalla completa con temporizador por pasos y valoración al terminar, panel de métodos/retención/ritmo en Inteligencia, franja de concentración y detalle de bloque en Plan, ajustes de horas de concentración, margen y día ligero. Probado en Chromium de escritorio y iPhone 14 Pro sin errores de consola ni desbordes.

## Fase 2 en curso (4 nov 2026)

- **Supabase** (plan gratis, región eu-west-1): proyecto `jarvis` creado. Migraciones en `packages/db/migrations`: 0001 (esquema con RLS solo para usuarios autenticados), 0002 (estado de la app, copias, lista de correos permitidos, aviso único), 0003 (pg_cron cada 5 min). Aplicadas el 5 nov por el usuario desde el editor SQL (27 tablas, reloj `jarvis-tick` activo).
- **Acceso privado**: `/entrar` con código de un solo uso por correo (sin contraseñas). El middleware exige sesión en todas las páginas y en la API. Solo pueden crear cuenta los correos de `allowed_emails` (se rellena desde el panel, nunca desde el código). Sin variables de Supabase la app sigue en modo local.
- **Sincronización**: el estado se guarda primero en el dispositivo y se refleja en `app_state`; gana el cambio más reciente. Se vuelve a leer al abrir la app y cada 5 min.
- **Trabajo 24/7** (`/api/cron/tick`, protegido con un token que genera Postgres y nunca sale de la base de datos; el servidor lo comprueba con `jarvis_cron_token_ok()`): lee EVAGD cada 30 min, avisa 15 min antes de cada sesión, resumen al acabar las horas de silencio, máximo diario y horas de silencio respetados (`packages/core/src/notify.ts`, con pruebas), copia semanal (se guardan 8).
- **GitHub**: código en `benitofuentesfelix/Jarvis` (rama `main`).
- **Vercel** (Hobby, región dub1): proyecto `jarvis`, producción en https://jarvis-sandy-eight-87.vercel.app. Variables públicas y de avisos puestas; `SUPABASE_SECRET_KEY` y `EVAGD_ICAL_URL` las añade el usuario en el panel.
- **Pendiente (usuario)**: Site URL y Redirect URL en Supabase Auth, `{{ .Token }}` en las plantillas de correo, las dos variables privadas en Vercel.

## Lo que todavía no existe

- Conexión real con EVAGD, Notion y Google Calendar (fase 2; EVAGD pendiente de verificar contigo).
- Persistencia en Supabase: hoy los datos viven en el navegador (`localStorage`) con datos de ejemplo.
- Trabajos 24/7 en Trigger.dev (fase 3).
- Strategist, Researcher y Coach como agentes reales (fases 7 y 8).
- Voz (fase 9).

## Errores encontrados y resueltos

1. **La paleta de colores desaparecía.** Tailwind 4 elimina las variables del tema que no detecta en el código, así que los colores de Lengua y Filosofía no se pintaban. Resuelto con `@theme static`.
2. **Bloques a las 16:24.** El planificador empezaba a contar desde «ahora + 10 min». Ahora redondea al múltiplo de 5 minutos más cercano.
3. **Fechas en mayúsculas raras** («Martes, 3 De Noviembre»). Resuelto sin `capitalize` global.
4. **Títulos cortados en la vista de semana.** Filas más altas y títulos a una línea.

## Datos y aprobaciones para la fase 2 (3 nov 2026)

- Cuenta de Google personal (Gmail): sirve para Google Calendar sin restricciones del centro.
- iPhone 13 con el iOS más reciente: admite notificaciones push si JARVIS se añade a la pantalla de inicio.
- Usa Notion para tareas y estudio: se conectará en solo lectura.
- EVAGD: su cuenta permite generar la exportación iCal de Moodle (export_execute.php); falta comprobar el contenido desde producción. Es la vía principal y no necesita permiso del centro. La URL lleva una clave privada: va solo en una variable de entorno del servidor (`EVAGD_ICAL_URL`), nunca en el código. Usar `preset_what=all&preset_time=recentupcoming`.
- Aprobado por el estudiante: publicar gratis en la nube, conectar Google Calendar, Notion en solo lectura y EVAGD.
- Pendiente de él: crear GitHub (repo privado `jarvis`), Vercel y Supabase.
- El entorno de desarrollo bloquea `www3.gobiernodecanarias.org`; en producción (Vercel) no aplica.

## Decisión de costes (3 nov 2026)

Plan gratuito: Vercel Hobby + Supabase Free. Los trabajos 24/7 usan pg_cron y Edge Functions de Supabase en lugar de Trigger.dev, y su actividad diaria evita la pausa por inactividad. Falta añadir una exportación semanal como copia de seguridad. La IA de Claude queda desactivada (motor local) salvo que se apruebe su coste por uso.

## Costes reales hasta ahora

0 €. Todo lo construido corre en planes gratuitos o en local.
