---
name: nextjs-supabase-postgres
description: Usar SIEMPRE que se trabaje en código de Next.js conectado a Supabase/PostgreSQL — App Router, server actions/API routes, RLS (Row Level Security), migraciones, multi-tenancy, autenticación con Supabase Auth, o cualquier query a Postgres desde el frontend/backend. Aplica incluso si el usuario no menciona "Supabase" explícitamente pero está trabajando en un proyecto que ya usa este stack (ej. Go Admin, Go Chat).
---

# Next.js + Supabase + PostgreSQL

Patrones y checklist para no introducir bugs de seguridad/datos comunes en este stack.

## Antes de escribir código

1. Detecta si el proyecto usa App Router o Pages Router (mirar `app/` vs `pages/`).
2. Detecta si hay multi-tenancy (columna `tenant_id`/`organization_id` en las tablas).
   Si existe, **toda** query nueva debe filtrar por tenant, y toda tabla nueva debe
   tener RLS habilitado desde el día uno — nunca dejarlo para "después".
3. Revisa si ya existe un cliente de Supabase centralizado (`lib/supabase/client.ts`,
   `lib/supabase/server.ts`) — no crees uno nuevo, reutiliza el existente.

## Reglas de seguridad (no negociables)

- **RLS siempre activo** en tablas con datos de usuario/tenant. Si una tabla nueva no
  tiene policies, decláralo explícitamente y pregunta antes de dejarla abierta.
- El cliente de Supabase en el **browser** solo debe usar la `anon key`. La
  `service_role key` solo se usa en Server Actions, Route Handlers o Edge Functions
  — nunca en un componente cliente ni se expone a `NEXT_PUBLIC_*`.
- Server Components/Server Actions: usa el cliente de servidor con cookies
  (`@supabase/ssr`), no el cliente de browser.
- Toda mutación de datos sensibles (dinero, permisos, datos personales) va en
  Server Action o Route Handler, nunca resuelta solo en el cliente.

## Patrones de datos

- Prefiere Server Components para lectura inicial de datos (menos JS al cliente,
  queries directas a Postgres vía Supabase server client).
- Usa Server Actions para mutaciones simples ligadas a formularios; usa Route
  Handlers (`app/api/.../route.ts`) cuando necesites llamarlo desde fuera de un
  form (webhooks, fetch desde cliente, apps móviles/Electron/Capacitor consumiendo
  la misma API).
- Migraciones: usa el CLI de Supabase (`supabase migration new <nombre>`), nunca
  edites el esquema solo desde el dashboard en proyectos con control de versiones.
  Cada migración debe ser reversible cuando sea posible.
- Para operaciones contables/financieras (ej. libro mayor con partida doble):
  usa transacciones explícitas (`BEGIN`/`COMMIT` o funciones de Postgres con
  `SECURITY DEFINER` bien acotadas) — nunca dos inserts separados sin transacción
  para debe/haber.

## Autenticación

- Usa Supabase Auth con `@supabase/ssr` para mantener la sesión sincronizada entre
  Server Components, Client Components y middleware.
- Middleware (`middleware.ts`) para refrescar la sesión y proteger rutas — no
  confíes solo en checks del lado del cliente para ocultar contenido protegido.

## Checklist antes de dar por terminada una feature
- [ ] RLS policy escrita y probada (no solo "created", sino probada con un usuario
      de otro tenant intentando acceder).
- [ ] Ninguna `service_role key` filtrada al cliente.
- [ ] Migración versionada, no cambio manual en el dashboard.
- [ ] Manejo de errores de Supabase (`error` del response) propagado, no ignorado.