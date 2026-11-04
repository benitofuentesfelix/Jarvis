# JARVIS

Sistema personal que planifica tus estudios, se adelanta a los problemas y te dice qué hacer ahora.

## Arrancarlo en tu ordenador

Necesitas Node 22 o superior y pnpm.

```bash
pnpm install
pnpm dev          # http://localhost:3000
```

Arranca con datos de ejemplo (asignaturas, exámenes y tareas de 1.º de Bachillerato) guardados en tu navegador. No se conecta a ninguna cuenta tuya.

Otros comandos:

```bash
pnpm test         # pruebas del motor de planificación
pnpm build        # compilación de producción
pnpm typecheck
```

## Qué hay dentro

```
apps/web          Control Center (Next.js, PWA instalable)
packages/core     Motor de planificación, memoria, permisos (con pruebas)
packages/db       Esquema SQL con seguridad por usuario (Supabase)
docs/STATUS.md    Qué funciona, qué falta y qué cuesta
```

## Configuración opcional

Copia `apps/web/.env.example` a `apps/web/.env.local`:

- `ANTHROPIC_API_KEY` — activa el centro de comandos con Claude. Sin ella funciona igual, con el motor local.
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` y `VAPID_PRIVATE_KEY` — notificaciones push (`npx web-push generate-vapid-keys`). Requiere HTTPS.

## Estado

Fase 1 terminada: motor, permisos, base de datos e interfaz. Las integraciones con EVAGD, Notion y Google Calendar llegan en la fase 2. Ver `docs/STATUS.md`.
