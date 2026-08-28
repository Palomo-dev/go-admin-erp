# Plan — Anti-Bot, Visitantes Únicos y Detección de Tráfico Sospechoso

> Fuente de verdad para implementar filtrado de bots, métricas de visitantes
> únicos reales (distinct `ip_hash`) vs visitas totales, y detección de tráfico
> sospechoso sobre la tabla `website_visits` ya existente.
>
> **Estado:** análisis y diseño. No se ha escrito código todavía.
> **Proyecto Supabase:** `jgmgphmzusbluqhuqihj`
> **Stack:** Next.js App Router · Supabase/Postgres · TypeScript estricto · shadcn/ui
> **Proyectos afectados:** `go-admin-erp` (dashboard + API) · `goadmin-websites` (tracking)

---

## 0. Contexto actual

### Tabla `website_visits` (ya creada)

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `organization_id` | integer NOT NULL | FK a `organizations` |
| `session_id` | text NOT NULL | Generado en `sessionStorage` del browser |
| `page_path` | text | Default `'/'` |
| `referrer` | text nullable | `document.referrer` |
| `user_agent` | text nullable | Truncado a 500 chars |
| `country` | text nullable | Sin implementar (futuro GeoIP) |
| `ip_hash` | text nullable | SHA-256 truncado a 16 chars del IP real |
| `device_type` | text | `mobile` / `tablet` / `desktop` |
| `is_new_visitor` | boolean | True si `session_id` no existe en últimas 24h |
| `created_at` | timestamptz | `now()` |

**Realtime:** habilitado (`REPLICA IDENTITY FULL` + en `supabase_realtime`).

### Datos reales actuales

```
total: 15 visitas
sesiones_unicas: 3 (DISTINCT session_id)
ips_unicas: 1 (DISTINCT ip_hash)
sin_ip: 8 (ip_hash IS NULL — localhost sin x-forwarded-for)
```

### Flujo de tracking actual

```
Visitante entra al sitio (goadmin-websites)
  → VisitTracker.tsx (componente cliente)
  → POST /api/track-visit
  → Hash SHA-256 del IP (x-forwarded-for)
  → Verifica si session_id existe en últimas 24h (is_new_visitor)
  → INSERT en website_visits
  → Supabase Realtime transmite INSERT
  → Hook useLiveVisitors (go-admin-erp dashboard)
  → LiveVisitorsBadge muestra contador en tiempo real
```

### Archivos actuales relevantes

**goadmin-websites:**
- `app/api/track-visit/route.ts` — endpoint POST que inserta visitas
- `components/site/VisitTracker.tsx` — componente cliente que envía visitas
- `components/site/OrganizationLayout.tsx` — integra VisitTracker
- `types/database.ts` — tipos de `website_visits`

**go-admin-erp:**
- `src/components/inicio/inicioService.ts` — queries de dashboard (visitasWeb, series)
- `src/components/inicio/DashboardKPIs.tsx` — render de KPIs (visitasWeb con sparkline)
- `src/components/inicio/useLiveVisitors.ts` — hook Realtime (contador en vivo)
- `src/components/inicio/LiveVisitorsBadge.tsx` — badge estilo Shopify
- `src/app/app/inicio/page.tsx` — página del dashboard

### Problemas que resolver

1. **Bots no se filtran** — cualquier request a `/api/track-visit` inserta una visita,
   sin importar si viene de un bot, crawler, o script malicioso.
2. **`visitasWeb` cuenta page views, no visitantes únicos** — el KPI del dashboard
   muestra `(visitasWebHoyRes.data || []).length` que es el total de filas, no
   visitantes distintos.
3. **No hay detección de tráfico sospechoso** — un mismo `ip_hash` puede generar
   cientos de visitas y nadie se entera.

---

## 1. Objetivo funcional

Implementar tres capacidades sobre `website_visits`:

### 1.1 Filtrar bots
Detectar y no registrar visitas de bots/crawlers conocidos (Googlebot, bingbot,
AhrefsBot, etc.) ni de User-Agents sospechosos (sin browser real, librerías HTTP,
scripts automatizados).

### 1.2 Métricas de visitantes únicos
Distinguir en el dashboard entre:
- **Visitas totales** — número de filas en `website_visits` (page views).
- **Visitantes únicos** — número de `ip_hash` distintos (o `session_id` si no hay IP).

El KPI `visitasWeb` debe mostrar visitantes únicos, no page views totales.
Adicionalmente, mostrar ambos números en el tooltip o desglose.

### 1.3 Detección de tráfico sospechoso
Identificar `ip_hash` que generan un volumen anormal de visitas en poco tiempo
(umbral configurable, ej: >50 visitas en 1 hora) y:
- Marcar las visitas como `is_suspicious = true`.
- Mostrar una alerta en el dashboard.
- Opcional: bloquear temporalmente el tracking desde ese `ip_hash`.

---

## 2. Diseño por fases

### Fase 1 — Filtrado de bots en el endpoint de tracking

**Objetivo:** No insertar visitas de bots en `website_visits`.

#### 2.1.1 BD
- Agregar columna `is_bot boolean DEFAULT false` a `website_visits`.
  - Aunque la mayoría de bots se filtran antes del INSERT, algunos bots
    sofisticados pueden pasar el filtro. Marcarlos permite analizarlos después.

```sql
ALTER TABLE website_visits
  ADD COLUMN IF NOT EXISTS is_bot boolean DEFAULT false;
```

#### 2.1.2 Backend (goadmin-websites)

**`app/api/track-visit/route.ts`:**

Agregar función `isBotUserAgent(ua: string): boolean` que verifica contra una
lista de patrones conocidos:

```ts
const BOT_PATTERNS = [
  /googlebot/i, /bingbot/i, /yandexbot/i, /baiduspider/i, /duckduckbot/i,
  /slurp/i, // Yahoo
  /facebookexternalhit/i, /twitterbot/i, /linkedinbot/i,
  /whatsapp/i, /telegrambot/i,
  /ahrefsbot/i, /semrushbot/i, /mj12bot/i, /dotbot/i,
  /petalbot/i, /applebot/i, /amazonbot/i,
  /crawler/i, /spider/i, /scraper/i,
  /python-requests/i, /curl/i, /wget/i, /httpx/i, /axios/i, /got/i,
  /node-fetch/i, /postman/i, /insomnia/i,
  /headless/i, /phantomjs/i, /selenium/i, /puppeteer/i,
  /go-http-client/i, /java\//i, /okhttp/i,
];
```

Flujo actualizado del endpoint:

```
POST /api/track-visit
  → Extraer User-Agent
  → isBotUserAgent(ua)?
    → true: responder 200 { success: true, bot: true } sin INSERT
    → false: continuar flujo normal
  → Insertar visita
```

**Decisión:** Los bots se filtran antes del INSERT (no se guardan) para no
inflar la tabla. La columna `is_bot` queda para casos edge donde se detecta
posteriormente.

#### 2.1.3 UI
Sin cambios. El badge de visitantes en vivo simplemente no contará bots.

#### 2.1.4 Archivos a modificar

| Archivo | Cambio |
|---|---|
| `goadmin-websites/app/api/track-visit/route.ts` | Agregar `isBotUserAgent` + early return |
| BD | `ALTER TABLE website_visits ADD COLUMN is_bot boolean DEFAULT false` |

---

### Fase 2 — Visitantes únicos en el dashboard

**Objetivo:** El KPI `visitasWeb` muestre visitantes únicos, no page views totales.
Mostrar ambos números (visitantes únicos + visitas totales) en el desglose.

#### 2.2.1 BD
Sin cambios. Las queries usan `COUNT(DISTINCT ip_hash)` que ya funciona sobre
la columna existente.

#### 2.2.2 Backend (go-admin-erp)

**`src/components/inicio/inicioService.ts`:**

1. Cambiar las queries de `website_visits` para traer `ip_hash` además de
   `created_at`:

```ts
// Antes:
.select('created_at')

// Después:
.select('created_at, ip_hash, session_id')
```

2. Calcular visitantes únicos además de visitas totales:

```ts
const visitasWebData = visitasWebHoyRes.data || [];
const visitasWeb = visitasWebData.length; // page views totales
const visitantesUnicos = new Set(
  visitasWebData.map(v => v.ip_hash || v.session_id)
).size;
```

3. Agregar campos al tipo `DashboardKPIData`:

```ts
visitasWeb: number;           // visitantes únicos (para el KPI principal)
visitasWebTotales: number;    // page views totales (para desglose)
visitantesUnicosAnterior: number; // delta vs período anterior
```

4. El delta `visitasWebAnterior` debe comparar visitantes únicos, no page views.

5. Las series horarias y por período deben agrupar por visitante único, no por
   page view. Para series horarias:

```ts
// Antes: cada visita = 1 punto
const visitasHoyReg = (visitasWebHoyRes.data || []).map((v) => ({ total: 1, fecha: v.created_at }));

// Después: agrupar por ip_hash/session_id primero, luego por hora
const visitasHoyUnicas = dedupByVisitor(visitasWebHoyRes.data || []);
const visitasHoyReg = visitasHoyUnicas.map((v) => ({ total: 1, fecha: v.created_at }));
```

Función helper:

```ts
function dedupByVisitor(data: { ip_hash: string | null; session_id: string; created_at: string }[]) {
  const seen = new Set<string>();
  return data.filter(v => {
    const key = v.ip_hash || v.session_id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
```

#### 2.2.3 UI (go-admin-erp)

**`src/components/inicio/DashboardKPIs.tsx`:**

1. El KPI `visitasWeb` ya muestra el valor del campo `visitasWeb` — ahora será
   visitantes únicos en vez de page views. Sin cambios de render.

2. Agregar desglose debajo del valor (estilo `comprasWeb` con pend/pag/cancel):

```tsx
{kpi.key === 'visitasWeb' && data && (
  <div className="mt-1 flex items-center gap-2 text-[10px] text-gray-500 dark:text-gray-400">
    <span>{data.visitasWebTotales} {t('pageViews')}</span>
    <span className="text-gray-300">·</span>
    <span>{data.visitasWeb} {t('uniqueVisitors')}</span>
  </div>
)}
```

3. El tooltip del sparkline horario debe mostrar "visitantes únicos" no "visitas".

#### 2.2.4 Traducciones

Agregar a `home.kpis` en es/en/pt/fr:
- `pageViews`: "visitas" / "page views" / "visitas" / "vues"
- `uniqueVisitors`: "únicos" / "unique" / "únicos" / "uniques"

#### 2.2.5 Hook Realtime

**`src/components/inicio/useLiveVisitors.ts`:**

El contador en vivo debe contar visitantes únicos activos, no page views:

```ts
// Antes:
.select('*', { count: 'exact', head: true })

// Después: contar session_ids distintos en los últimos 5 min
const { data } = await supabase
  .from('website_visits')
  .select('session_id')
  .eq('organization_id', organizationId)
  .gte('created_at', fiveMinAgo);
const uniqueSessions = new Set(data?.map(v => v.session_id) || []).size;
setLiveCount(uniqueSessions);
```

Nota: Supabase no soporta `COUNT(DISTINCT)` en el cliente JS, por eso se
traen los `session_id` y se deduplican en el cliente. El volumen de visitas
en 5 min es bajo (decenas, no miles), por lo que es viable.

#### 2.2.6 Archivos a modificar

| Archivo | Cambio |
|---|---|
| `go-admin-erp/src/components/inicio/inicioService.ts` | Queries traen `ip_hash, session_id`; calcular visitantes únicos; `dedupByVisitor` |
| `go-admin-erp/src/components/inicio/inicioService.ts` | Tipo `DashboardKPIData`: agregar `visitasWebTotales`, `visitantesUnicosAnterior` |
| `go-admin-erp/src/components/inicio/DashboardKPIs.tsx` | Desglose visitas totales vs únicas bajo el valor |
| `go-admin-erp/src/components/inicio/useLiveVisitors.ts` | Contar `session_id` distintos, no filas totales |
| `go-admin-erp/messages/{es,en,pt,fr}.json` | Claves `pageViews`, `uniqueVisitors` |

---

### Fase 3 — Detección de tráfico sospechoso

**Objetivo:** Identificar `ip_hash` con volumen anormal de visitas y alertar.

#### 2.3.1 BD

```sql
-- Marcar visitas sospechosas
ALTER TABLE website_visits
  ADD COLUMN IF NOT EXISTS is_suspicious boolean DEFAULT false;

-- Tabla de IPs bloqueadas temporalmente
CREATE TABLE IF NOT EXISTS website_blocked_ips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id integer NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  ip_hash text NOT NULL,
  reason text,
  blocked_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz, -- null = bloqueo permanente
  created_by uuid REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_blocked_ips_org_hash
  ON website_blocked_ips(organization_id, ip_hash);
CREATE INDEX IF NOT EXISTS idx_blocked_ips_expires
  ON website_blocked_ips(expires_at);
ALTER TABLE website_blocked_ips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members can manage blocked IPs"
  ON website_blocked_ips FOR ALL
  USING (
    organization_id IN (
      SELECT om.organization_id FROM organization_members om
      WHERE om.user_id = auth.uid() AND om.is_active = true
    )
  );
```

#### 2.3.2 Backend (goadmin-websites)

**`app/api/track-visit/route.ts`:**

Antes del INSERT, verificar si el `ip_hash` está bloqueado:

```ts
if (ipHash) {
  const { data: blocked } = await supabase
    .from('website_blocked_ips')
    .select('id')
    .eq('organization_id', Number(organizationId))
    .eq('ip_hash', ipHash)
    .or('expires_at.is.null,expires_at.gt.now()')
    .limit(1);
  if (blocked && blocked.length > 0) {
    return NextResponse.json({ success: true, blocked: true });
  }
}
```

Después del INSERT, verificar si el `ip_hash` supera el umbral de sospecha:

```ts
// Umbral: >50 visitas en la última hora desde el mismo ip_hash
const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
const { count } = await supabase
  .from('website_visits')
  .select('*', { count: 'exact', head: true })
  .eq('organization_id', Number(organizationId))
  .eq('ip_hash', ipHash)
  .gte('created_at', oneHourAgo);

if (count && count > 50) {
  // Marcar las visitas recientes de este ip_hash como sospechosas
  await supabase
    .from('website_visits')
    .update({ is_suspicious: true })
    .eq('organization_id', Number(organizationId))
    .eq('ip_hash', ipHash)
    .gte('created_at', oneHourAgo);

  // Opcional: auto-bloquear
  // await supabase.from('website_blocked_ips').insert({ ... });
}
```

**Optimización:** Esta verificación no se ejecuta en cada visita. Se ejecuta
solo cuando el `ip_hash` ya tiene >20 visitas en la última hora (pre-filtro
barato). Si pasa de 50, se marca como sospechoso.

#### 2.3.3 Backend (go-admin-erp)

**`src/components/inicio/inicioService.ts`:**

Agregar al `DashboardKPIData`:

```ts
visitasSospechosas: number;       // count de is_suspicious=true en el período
ipsBloqueadas: number;            // count de website_blocked_ips activas
```

Query adicional en el `Promise.all`:

```ts
// Visitas sospechosas del período
supabase
  .from('website_visits')
  .select('id', { count: 'exact', head: true })
  .eq('organization_id', organizationId)
  .eq('is_suspicious', true)
  .gte('created_at', inicioPeriodo)
  .lt('created_at', finPeriodo),
// IPs bloqueadas activas
supabase
  .from('website_blocked_ips')
  .select('id', { count: 'exact', head: true })
  .eq('organization_id', organizationId)
  .or('expires_at.is.null,expires_at.gt.now()'),
```

#### 2.3.4 UI (go-admin-erp)

**DashboardKPIs.tsx:**

Si `visitasSospechosas > 0`, mostrar un badge de alerta junto al KPI de
visitas web:

```tsx
{kpi.key === 'visitasWeb' && data?.visitasSospechosas > 0 && (
  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300">
    <AlertTriangle className="h-2.5 w-2.5" />
    {data.visitasSospechosas} {t('suspicious')}
  </span>
)}
```

**Nuevo: Panel de seguridad web** (sección opcional en el dashboard o página
dedicada bajo `/app/pos/pedidos-online/seguridad`):

- Tabla de IPs bloqueadas con razón, fecha y botón de desbloqueo.
- Tabla de `ip_hash` con más visitas en las últimas 24h (top 20).
- Gráfico de volumen de visitas por hora, destacando horas con tráfico sospechoso.
- Botón para bloquear/desbloquear manualmente un `ip_hash`.

#### 2.3.5 API routes nuevas (go-admin-erp)

```
GET    /api/web-analytics/blocked-ips     → lista de IPs bloqueadas
POST   /api/web-analytics/block           → bloquear ip_hash
DELETE /api/web-analytics/block/{id}      → desbloquear
GET    /api/web-analytics/suspicious      → visitas sospechosas del período
GET    /api/web-analytics/top-ips         → top ip_hash por volumen
```

#### 2.3.6 Traducciones

Agregar a `home.kpis`:
- `suspicious`: "sospechosas" / "suspicious" / "suspeitas" / "suspectes"
- `blocked`: "bloqueadas" / "blocked" / "bloqueadas" / "bloquées"

Y un namespace `webSecurity` para el panel:
- `title`: "Seguridad Web" / "Web Security" / "Segurança Web" / "Sécurité Web"
- `blockedIps`: "IPs Bloqueadas" / ...
- `suspiciousActivity`: "Actividad Sospechosa" / ...
- `block`: "Bloquear" / ...
- `unblock`: "Desbloquear" / ...
- `reason`: "Razón" / ...
- `blockedAt`: "Bloqueado el" / ...
- `expiresAt`: "Expira el" / ...

#### 2.3.7 Archivos a modificar

| Archivo | Cambio |
|---|---|
| BD | `ALTER TABLE website_visits ADD COLUMN is_suspicious`; crear `website_blocked_ips` |
| `goadmin-websites/app/api/track-visit/route.ts` | Verificar IP bloqueada + detectar umbral sospechoso |
| `go-admin-erp/src/components/inicio/inicioService.ts` | Queries de sospechosas + bloqueadas; campos en `DashboardKPIData` |
| `go-admin-erp/src/components/inicio/DashboardKPIs.tsx` | Badge de alerta si hay sospechosas |
| `go-admin-erp/src/app/api/web-analytics/` | 5 API routes nuevas |
| `go-admin-erp/src/app/app/pos/pedidos-online/seguridad/page.tsx` | Panel de seguridad (nuevo) |
| `go-admin-erp/messages/{es,en,pt,fr}.json` | Claves de traducción |

---

## 3. Orden de implementación

```
Fase 1 (filtrado de bots)
  └─ Sin dependencias. Se puede hacer primero.
  └─ Impacto inmediato: reduce ruido en website_visits.

Fase 2 (visitantes únicos)
  └─ Depende de Fase 1 idealmente (bots ya filtrados = métricas más limpias).
  └─ Pero se puede implementar en paralelo.

Fase 3 (tráfico sospechoso)
  └─ Depende de Fase 1 (is_bot) y Fase 2 (ip_hash en queries).
  └─ Es la más compleja: nueva tabla, API routes, panel de seguridad.
```

## 4. Consideraciones

### Rendimiento
- `COUNT(DISTINCT ip_hash)` en Postgres es eficiente con el índice existente
  `idx_website_visits_org_created`.
- La verificación de IP bloqueada en el endpoint de tracking es una query
  indexada (org_id + ip_hash) que retorna 0 o 1 fila — <5ms.
- La detección de umbral sospechoso (>50/hora) solo se ejecuta cuando el
  `ip_hash` tiene >20 visitas recientes, no en cada INSERT.

### Privacidad
- `ip_hash` es SHA-256 truncado — no se puede reversar.
- `website_blocked_ips` guarda el hash, no el IP real.
- Cumple con GDPR/Ley 1581: no se almacenan PII.

### Limitaciones conocidas
- `x-forwarded-for` puede ser spoofado o no estar presente (ej: detrás de
  Cloudflare que lo reemplaza). En esos casos `ip_hash` es `null` y se usa
  `session_id` como fallback para deduplicar.
- La deduplicación en el cliente (hook Realtime) es viable porque el volumen
  de visitas en 5 min es bajo. Si crece a miles, se moverá a una RPC de
  Postgres.

### Tests
- Fase 1: test unitario de `isBotUserAgent` con lista de UAs conocidos.
- Fase 2: test de `dedupByVisitor` con datos simulados.
- Fase 3: test de detección de umbral con 51 visitas en 1 hora.
