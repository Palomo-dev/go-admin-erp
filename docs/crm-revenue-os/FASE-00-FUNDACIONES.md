# FASE 00 — Fundaciones, higiene y registry de proveedores

> Proyecto Supabase: `jgmgphmzusbluqhuqihj`
> Depende de: — (es la base de todo)
> Bloquea: F1–F15 (nada arranca sin F0 en ≥9.5)

---

## 0. Objetivo y alcance

**Qué resuelve:** deja el suelo firme antes de construir. Corrige los bugs críticos de multi-tenancy (G1–G4), elimina código muerto y duplicados (G5, G7, G11, G14), instala las dependencias base que las fases siguientes necesitan, crea el registry de proveedores configurable por organización (la columna vertebral de telefonía/IA/email de F3–F8), y deja un guardarraíl automatizado que impide regresiones.

**Qué NO entra:** no implementa features del CRM (pipeline, llamadas, email, IA). Esos son F1–F15. F0 solo prepara.

**Puntos del método que cubre:** 32 (modelo de datos canónico — parcial, se completa en F2/F9) y la frontera de plataforma del PLAN.md §0.

---

## 1. Estado actual verificado

| Qué | Estado | Archivo:línea |
|---|---|---|
| `callService.ts` con service-role global | 🔴 bug G1 | `src/lib/services/callService.ts:8` |
| `callService.ts` consulta `user_profiles` (no existe) | 🔴 bug G2 | `src/lib/services/callService.ts:262` |
| `callService.ts` hardcodea `organizationId: 1` | 🔴 bug G1 | `src/lib/services/callService.ts:270,292` |
| `/api/crm/ia/discovery-summary` sin validar org | 🔴 bug G3 | `src/app/api/crm/ia/discovery-summary/route.ts` |
| `/api/crm/ia/next-action` sin validar org | 🔴 bug G3 | `src/app/api/crm/ia/next-action/route.ts` |
| `/api/ai-assistant/transcribe` sin auth/org/límite | 🔴 bug G4 | `src/app/api/ai-assistant/transcribe/route.ts` |
| Webhooks legacy desactivados | 🟠 bug G5 | `src/app/api/webhooks/{voip,sms,email}/twilio/route.ts` |
| `.env.example` incompleto (23 vars faltantes) | 🟠 bug G6 | `.env.example` |
| `stages.display_order` duplica `position` | 🟠 bug G7 | BD + `src/components/crm/reportes/ReportesService.ts` |
| `/app/crm/configuracion` link sin destino | 🟡 bug G8 | `src/components/crm/dashboard/CRMQuickNav.tsx:112` |
| `elevenLabsTTS.ts`/`deepgramSTT.ts`/`realtimeSession.ts` muerto | 🟡 bug G11 | `src/lib/services/integrations/twilio/voiceAgent/` |
| `verticals` sin `slug`/`color`/`sort_order` | 🟡 bug G12 | BD |
| `ConfiguracionHub.tsx`/`CustomersList.tsx` huérfanos | 🟡 bug G14 | `src/components/crm/{configuracion,customers}/` |
| WhatsApp validate/templates sin auth | 🟠 bug G15 | `src/app/api/integrations/whatsapp/{validate,templates}/route.ts` |
| `provider_configs` (registry) | ❌ no existe | — |
| Helper `getServerOrgContext()` | ❌ no existe | — |
| Tipos canónicos consolidados | ❌ duplicados en `src/types/crm.ts` + `src/components/crm/oportunidades/types.ts` + `src/components/crm/pipeline/*types*` | — |
| `motion` instalado | ❌ | `package.json` |
| `@twilio/voice-sdk` instalado | ❌ | `package.json` |
| `resend` / `react-email` instalado | ❌ | `package.json` |

---

## 2. Base de datos

### 2.1 Migraciones

Aplicar vía `apply_migration` del MCP de Supabase (project `jgmgphmzusbluqhuqihj`). No crear archivos `.sql` en el repo.

#### Migración 1 — `provider_configs`

```sql
CREATE TABLE provider_configs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN (
    'voice','stt','tts','llm','email','whatsapp','sms',
    'analysis','esign','calendar','video','enrichment'
  )),
  provider text NOT NULL,
  credentials jsonb NOT NULL DEFAULT '{}'::jsonb,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  priority integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, category, provider)
);

CREATE INDEX idx_provider_configs_org_category
  ON provider_configs (organization_id, category, priority);

ALTER TABLE provider_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY provider_configs_select ON provider_configs
  FOR SELECT USING (organization_id = current_org_id());
CREATE POLICY provider_configs_insert ON provider_configs
  FOR INSERT WITH CHECK (organization_id = current_org_id());
CREATE POLICY provider_configs_update ON provider_configs
  FOR UPDATE USING (organization_id = current_org_id());
CREATE POLICY provider_configs_delete ON provider_configs
  FOR DELETE USING (organization_id = current_org_id());
```

#### Migración 2 — Helper `current_org_id()`

Función SQL que las políticas RLS usan para resolver la organización desde el JWT de Supabase. Las políticas existentes del repo ya usan un patrón similar — verificar con `list_tables` + `execute_sql` qué función existe antes de crearla.

```sql
-- Si ya existe current_org_id() en el schema, NO recrear.
-- Si no existe:
CREATE OR REPLACE FUNCTION current_org_id()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (auth.jwt() ->> 'organization_id')::integer,
    NULL
  );
$$;
```

> **Nota:** los webhooks de Twilio/Resend usan service-role (sin JWT) y NO pueden usar `current_org_id()`. Esos endpoints resuelven la org manualmente desde `phone_numbers.e164` o `provider_call_sid` (ver §5). El helper es solo para endpoints autenticados.

#### Migración 3 — Columnas en `templates` y `verticals`

```sql
ALTER TABLE templates
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE verticals
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS color text,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS positioning jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS idx_verticals_org_slug
  ON verticals (organization_id, slug)
  WHERE slug IS NOT NULL;
```

#### Migración 4 — Eliminar `stages.display_order`

```sql
-- 1. Migrar cualquier valor de display_order a position donde position sea NULL o 0
UPDATE stages
  SET position = display_order
  WHERE position IS NULL OR (position = 0 AND display_order > 0);

-- 2. Eliminar la columna
ALTER TABLE stages DROP COLUMN IF EXISTS display_order;
```

> **Verificar antes:** grep `display_order` en `src/` y corregir todos los usos a `position` (ver §3.2). Si hay usos en `src/components/crm/reportes/ReportesService.ts`, cambiarlos antes de aplicar esta migración.

#### Migración 5 — Normalizar `stages.probability` a 0–100

```sql
-- Si existen valores 0.0–1.0, multiplicar por 100
UPDATE stages
  SET probability = probability * 100
  WHERE probability IS NOT NULL AND probability <= 1.0;

-- Asegurar tipo integer
ALTER TABLE stages ALTER COLUMN probability TYPE integer
  USING COALESCE(probability, 0)::integer;

-- Constraint de rango
ALTER TABLE stages ADD CONSTRAINT stages_probability_range
  CHECK (probability >= 0 AND probability <= 100);
```

### 2.2 Seeds idempotentes

No hay seeds de datos en F0 — los seeds de roles/ICP/verticales son de F1. F0 solo crea la infraestructura (`provider_configs` vacía, el helper, las columnas).

### 2.3 Verificación post-migración

```sql
-- provider_configs existe y tiene RLS
SELECT relname, relrowsecurity FROM pg_class WHERE relname = 'provider_configs';
-- Esperado: provider_configs | true

-- display_order eliminado
SELECT column_name FROM information_schema.columns
  WHERE table_name = 'stages' AND column_name = 'display_order';
-- Esperado: 0 filas

-- probability en rango 0–100
SELECT MIN(probability), MAX(probability) FROM stages;
-- Esperado: 0 | 100

-- verticals tiene las nuevas columnas
SELECT column_name FROM information_schema.columns
  WHERE table_name = 'verticals' AND column_name IN ('slug','color','sort_order','positioning','metadata');
-- Esperado: 5 filas

-- templates.metadata existe
SELECT column_name FROM information_schema.columns
  WHERE table_name = 'templates' AND column_name = 'metadata';
-- Esperado: 1 fila
```

---

## 3. Backend

### 3.1 Endpoints

| Endpoint | Archivo | Acción | Método | Qué hace | Validación de org |
|---|---|---|---|---|---|
| (varios CRM IA) | `src/app/api/crm/ia/discovery-summary/route.ts` | modificar | POST | Añadir validación de org | `getServerOrgContext()` + verificar `opportunities.organization_id` |
| (varios CRM IA) | `src/app/api/crm/ia/next-action/route.ts` | modificar | POST | Igual | Igual |
| `/api/ai-assistant/transcribe` | `src/app/api/ai-assistant/transcribe/route.ts` | modificar | POST | Añadir auth, org, límite 25 MB, MIME, créditos | `getServerOrgContext()` |
| `/api/integrations/whatsapp/validate` | `src/app/api/integrations/whatsapp/validate/route.ts` | modificar | POST | Añadir auth de sesión | `getServerOrgContext()` |
| `/api/integrations/whatsapp/templates` | `src/app/api/integrations/whatsapp/templates/route.ts` | modificar | GET | Añadir auth de sesión | `getServerOrgContext()` |

### 3.2 Servicios

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `src/lib/services/serverOrgContext.ts` | **crear** | Helper único para resolver org en endpoints autenticados |
| `src/lib/services/providerRegistry.ts` | **crear** | Resolver proveedor activo por categoría y organización |
| `src/lib/services/callService.ts` | modificar | Eliminar service-role global, `organizationId: 1`, `user_profiles` |
| `src/types/crm.ts` | modificar | Consolidar tipos canónicos (fuente única) |
| `src/components/crm/oportunidades/types.ts` | modificar | Re-exportar de `src/types/crm.ts` |
| `src/components/crm/pipeline/*types*` | modificar | Re-exportar de `src/types/crm.ts` |
| `src/components/crm/reportes/ReportesService.ts` | modificar | `display_order` → `position` |

#### `serverOrgContext.ts` — firmas principales

```typescript
// src/lib/services/serverOrgContext.ts
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export interface ServerOrgContext {
  userId: string;
  organizationId: number;
  organizationName: string;
  role: string;
  supabase: SupabaseClient; // cliente con JWT del usuario (respeta RLS)
}

/**
 * ÚNICA vía de resolver la organización en endpoints autenticados.
 * Lanza error si no hay sesión o si el usuario no pertenece a ninguna org.
 * NUNCA devuelve un default como 1 o 2.
 */
export async function getServerOrgContext(): Promise<ServerOrgContext>;

/**
 * Para webhooks con service-role (Twilio, Resend, Meta).
 * Resuelve la org desde un identificador externo (número, CallSid, domain).
 * Lanza error si no encuentra — NUNCA cae a un default.
 */
export async function resolveOrgFromExternal(
  identifier: string,
  identifierType: 'phone' | 'call_sid' | 'domain' | 'message_id'
): Promise<{ organizationId: number; serviceClient: SupabaseClient }>;
```

#### `providerRegistry.ts` — firmas principales

```typescript
// src/lib/services/providerRegistry.ts
export type ProviderCategory =
  | 'voice' | 'stt' | 'tts' | 'llm' | 'email'
  | 'whatsapp' | 'sms' | 'analysis' | 'esign' | 'calendar'
  | 'video' | 'enrichment';

export interface ProviderConfig {
  provider: string;
  credentials: Record<string, string>;
  settings: Record<string, unknown>;
}

/**
 * Resuelve el proveedor activo para una categoría y organización.
 * Orden: provider_configs de la org (priority ASC) → fallback a env var global.
 */
export async function getActiveProvider(
  organizationId: number,
  category: ProviderCategory
): Promise<ProviderConfig>;

/**
 * Lista todos los proveedores configurados para una org y categoría.
 */
export async function listProviders(
  organizationId: number,
  category: ProviderCategory
): Promise<ProviderConfig[]>;
```

### 3.3 Snippets de la lógica no obvia

#### Fix de `callService.ts` — antes/después

**Antes (bug G1, G2):**
```typescript
// src/lib/services/callService.ts:8
const supabase = createClient(URL, SERVICE_ROLE_KEY); // bypass RLS

// :262
const { data } = await supabase.from('user_profiles').select(...); // tabla inexistente

// :270
return 1; // organización hardcodeada

// :292
organizationId: 1 // en twilioToCallEvent
```

**Después:**
```typescript
// callService.ts deja de crear su propio cliente.
// Recibe el cliente y el organizationId como parámetros de cada función.
// El llamador (endpoint/route handler) obtiene ambos de getServerOrgContext()
// o de resolveOrgFromExternal() en el caso de webhooks.

export async function logCallActivity(
  supabase: SupabaseClient, // cliente del llamador, con JWT o service-role según contexto
  params: {
    organizationId: number; // siempre explícito, nunca default
    callSid: string;
    // ...resto de params
  }
): Promise<void> {
  // INSERT en activities con organization_id = params.organizationId
}
```

#### Fix de `/api/crm/ia/*` — validación de org

```typescript
// src/app/api/crm/ia/discovery-summary/route.ts
import { getServerOrgContext } from '@/lib/services/serverOrgContext';

export async function POST(req: Request) {
  const ctx = await getServerOrgContext();
  const { opportunityId } = await req.json();

  // Verificar que la oportunidad pertenece a la org del usuario
  const { data: opp, error } = await ctx.supabase
    .from('opportunities')
    .select('id, organization_id')
    .eq('id', opportunityId)
    .eq('organization_id', ctx.organizationId) // ← el fix
    .single();

  if (!opp) {
    return Response.json({ error: 'Oportunidad no encontrada' }, { status: 404 });
  }
  // ... continuar con la lógica existente
}
```

### 3.4 Variables de entorno

Tabla completa a documentar en `.env.example`. Cada variable con un comentario de una línea.

| Variable | Requerida | Para qué | Ejemplo |
|---|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | sí (server) | Webhooks y operaciones server-side | `eyJ...` |
| `OPENAI_API_KEY` | sí | Chat, transcripción, análisis | `sk-...` |
| `OPENAI_MODEL` | no | Modelo default (default: `gpt-4o-mini`) | `gpt-4o-mini` |
| `OPENAI_MAX_TOKENS` | no | Límite de tokens | `4096` |
| `OPENAI_TEMPERATURE` | no | Temperatura default | `0.7` |
| `OPENAI_REALTIME_MODEL` | no | Realtime API (F6) | `gpt-4o-realtime-preview` |
| `TWILIO_ACCOUNT_SID` | sí | Subcuenta principal | `AC...` |
| `TWILIO_AUTH_TOKEN` | sí | Auth de subcuenta | `xxx` |
| `TWILIO_API_KEY` | sí (F3) | AccessToken Voice SDK | `SK...` |
| `TWILIO_API_SECRET` | sí (F3) | AccessToken Voice SDK | `xxx` |
| `TWILIO_TWIML_APP_SID` | sí (F3) | TwiML App | `AP...` |
| `TWILIO_PHONE_NUMBER` | sí | Número default | `+57...` |
| `TWILIO_WHATSAPP_NUMBER` | no | WhatsApp default | `whatsapp:+57...` |
| `TWILIO_VERIFY_SERVICE_SID` | no | Verify (verificación de móviles) | `VA...` |
| `TWILIO_WEBHOOK_BASE_URL` | sí | URL pública para callbacks | `https://app.goadmin.io` |
| `TWILIO_PUSH_CREDENTIAL_SID_IOS` | no (F5) | Push VoIP iOS | `CR...` |
| `TWILIO_PUSH_CREDENTIAL_SID_ANDROID` | no (F5) | Push FCM Android | `CR...` |
| `WS_SERVER_URL` | sí (F6) | URL del WebSocket server | `wss://app.goadmin.io` |
| `WS_PORT` | sí (F6) | Puerto del WS server | `8080` |
| `DEEPGRAM_API_KEY` | no | STT alternativo | `xxx` |
| `DEEPGRAM_MODEL` | no | Modelo Deepgram | `nova-3` |
| `ELEVENLABS_API_KEY` | sí (F4/F6) | Scribe + TTS | `xxx` |
| `ELEVENLABS_VOICE_ID` | no | Voz default | `xxx` |
| `ELEVENLABS_MODEL` | no | Modelo TTS | `eleven_v3` |
| `ELEVENLABS_SCRIBE_MODEL` | no | Modelo STT (F4) | `scribe_v2` |
| `RESEND_API_KEY` | sí (F7) | Email | `re_...` |
| `RESEND_WEBHOOK_SECRET` | sí (F7) | Verificación Svix | `whsec_...` |
| `GOOGLE_AI_API_KEY` | no (F4) | Gemini análisis | `xxx` |
| `GOOGLE_APPLICATION_CREDENTIALS` | no (F4) | Chirp 3 | `/path/to.json` |
| `WHATSAPP_VERIFY_TOKEN` | sí | Meta webhook verify | `xxx` |
| `WHATSAPP_APP_SECRET` | sí | Meta webhook signature | `xxx` |
| `WHATSAPP_ACCESS_TOKEN` | sí | Meta Cloud API | `xxx` |
| `SENDGRID_API_KEY` | no | Fallback email | `SG...` |
| `CALCOM_API_KEY` | no (F10) | Agendamiento | `xxx` |
| `DAILY_API_KEY` | no (F10) | Video demo | `xxx` |
| `DOCUMENSO_API_KEY` | no (F10) | Firma electrónica | `xxx` |
| `APOLLO_API_KEY` | no (F14) | Enriquecimiento B2B | `xxx` |
| `POSTHOG_KEY` | no (F11) | Analítica de producto | `phc_...` |

### 3.5 Dependencias npm a instalar

```bash
npm i motion @twilio/voice-sdk resend react-email @google/genai svix
```

> **Regla del proyecto:** preferir versiones publicadas hace ≥7 días. No usar `latest` ni rangos flotantes sin `^` acotado. Verificar `npm view <pkg> time` antes de instalar.

| Paquete | Para qué fase | Notas |
|---|---|---|
| `motion` | F15 (primitivas en F0) | Sucesor de Framer Motion. `import { motion } from 'motion/react'` |
| `@twilio/voice-sdk` | F3 | WebRTC calling en browser/PWA/Electron |
| `resend` | F7 | Email transaccional y marketing |
| `react-email` | F7 | Plantillas TSX → HTML |
| `@google/genai` | F4 | Gemini 2.5 Flash para análisis de llamadas |
| `svix` | F7 | Verificación de webhooks de Resend |

---

## 4. UI

### 4.1 Rutas

| URL | Archivo | Acción | Qué muestra |
|---|---|---|---|
| `/app/crm/configuracion` | `src/app/app/crm/configuracion/page.tsx` | **crear** | Redirect a `/app/configuracion?modulo=crm` |

#### Implementación del redirect

```typescript
// src/app/app/crm/configuracion/page.tsx
import { redirect } from 'next/navigation';

export default function CrmConfiguracionPage() {
  redirect('/app/configuracion?modulo=crm');
}
```

> Verificar antes cómo funciona `configModulesRegistry.ts` y `useConfiguracionState` para confirmar que `?modulo=crm` abre el tab correcto. Si el registry usa un ID distinto, ajustar el query param.

### 4.2 Componentes

| Archivo | Acción | Props | Qué hace |
|---|---|---|---|
| `src/components/crm/dashboard/CRMQuickNav.tsx` | modificar | — | Verificar que el link de configuración apunta a `/app/crm/configuracion` (ya existe en `:112`) |
| `src/components/crm/configuracion/ConfiguracionHub.tsx` | **eliminar** | — | Código huérfano (bug G14) |
| `src/components/crm/customers/CustomersList.tsx` | **eliminar** | — | Código huérfano (bug G14) |
| `src/components/shared/MotionProvider.tsx` | **crear** | `children` | `MotionConfig` global con `reducedMotion: 'user'` |

#### `MotionProvider.tsx`

```tsx
'use client';
import { MotionConfig } from 'motion/react';
import { ReactNode } from 'react';

export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={{ type: 'spring', stiffness: 300, damping: 30 }}>
      {children}
    </MotionConfig>
  );
}
```

Montar en `src/app/app/layout.tsx` envolviendo el contenido autenticado.

### 4.3 Wireframes

No aplica — F0 no tiene pantallas nuevas (solo un redirect).

### 4.4 Animaciones Motion

En F0 solo se instala el `MotionProvider` global y las primitivas compartidas que las fases siguientes usarán:

```tsx
// src/components/shared/motion/primitives.tsx
'use client';
import { motion, AnimatePresence } from 'motion/react';

export const FadeIn = motion.div; // fade + translateY
export const SlideIn = motion.div; // slide desde la derecha (drawers)
export const ScaleIn = motion.div; // scale + fade (dialogs)
export { AnimatePresence };
```

> **Performance:** usar `m` + `LazyMotion` para 4.6 KB. Prohibido animar `layout` en listas con >100 items (Kanban).

### 4.5 Accesibilidad

- `MotionConfig` con `reducedMotion: 'user'` respeta `prefers-reduced-motion`.
- El redirect de configuración no rompe la navegación con teclado (es server-side, instantáneo).

---

## 5. Multi-tenant y seguridad

### 5.1 `getServerOrgContext()` — garantía de aislamiento

1. Lee la sesión desde `cookies()` de Next.js.
2. Verifica que el JWT tiene `sub` (userId).
3. Consulta `organization_members` para obtener `organization_id` y `role`.
4. Si el usuario no pertenece a ninguna org → 403.
5. **Nunca** devuelve un default. No hay fallback a `1` o `2`.
6. Devuelve un cliente Supabase con el JWT del usuario (respeta RLS).

### 5.2 `resolveOrgFromExternal()` — webhooks con service-role

Los webhooks de Twilio/Resend/Meta reciben peticiones sin sesión. Resuelven la org así:

| Tipo | De dónde saca la org |
|---|---|
| `phone` | `SELECT organization_id FROM phone_numbers WHERE e164 = $1` (F3 crea la tabla) |
| `call_sid` | `SELECT organization_id FROM calls WHERE provider_call_sid = $1` (F3 crea la tabla) |
| `domain` | `SELECT organization_id FROM email_domains WHERE domain = $1` (F7 crea la tabla) |
| `message_id` | `SELECT organization_id FROM email_messages WHERE provider_message_id = $1` (F7 crea la tabla) |

Si no encuentra → responde 200 con body vacío al webhook (para que Twilio no reintente) y registra la anomalía en `integration_events`. **Nunca** cae a un default.

> **En F0**, las tablas `phone_numbers`, `calls`, `email_domains`, `email_messages` aún no existen. `resolveOrgFromExternal()` se crea con la interfaz pero las implementaciones se completan en F3/F7. Por ahora, los webhooks existentes de WhatsApp ya resuelven la org desde `whatsapp_qr_sessions` o credenciales — no se tocan.

### 5.3 Frontera de plataforma

El CRM **nunca** lee: `organizations`, `subscriptions`, `plans`, `sellers*`, `payout*`. Eso vive en `go-admin-super`. El test automatizado (§7.1) lo garantiza.

---

## 6. Cross-platform

F0 no introduce cambios cross-platform. La instalación de `motion` y `@twilio/voice-sdk` es agnóstica de plataforma. Los cambios en `mobile/`, `electron/`, `public/sw.js` son de F3/F5/F15.

---

## 7. Pruebas

### 7.1 Unitarios — guardarraíl de frontera e higiene

**Archivo:** `src/__tests__/guardrails.test.ts`

Casos:

1. **Sin `organizationId = 1` o `organization_id: 1` en `src/`:**
   ```typescript
   // Lee todos los .ts/.tsx de src/ y verifica que no aparece el string
   // 'organizationId: 1' ni 'organizationId = 1' ni 'organization_id: 1'
   ```

2. **Sin lecturas de tablas de plataforma:**
   ```typescript
   // Verifica que en src/ no aparece:
   // .from('organizations') .from('subscriptions') .from('plans')
   // .from('sellers .from('payout
   ```

3. **Sin `display_order` en `src/`:**
   ```typescript
   // grep display_order en src/ → 0 resultados
   ```

4. **Sin service-role en servicios compartidos por el cliente:**
   ```typescript
   // callService.ts no debe contener SERVICE_ROLE_KEY
   ```

> Implementación: usar `fs.readdirSync` recursivo + `fs.readFileSync` + regex. Es un test lento pero crítico. Marcar con `describe.skip` en CI si la velocidad es problema, pero mantenerlo en pre-commit.

### 7.2 Integración / API

- `getServerOrgContext()` devuelve 403 sin sesión.
- `getServerOrgContext()` devuelve la org correcta con sesión válida.
- `getServerOrgContext()` devuelve 403 si el usuario no pertenece a ninguna org.
- `/api/crm/ia/discovery-summary` devuelve 404 si la oportunidad es de otra org.
- `/api/ai-assistant/transcribe` devuelve 401 sin sesión.
- `/api/ai-assistant/transcribe` devuelve 413 si el audio > 25 MB.
- `/api/ai-assistant/transcribe` descuenta créditos.

### 7.3 Casos borde

- Usuario con sesión pero sin `organization_members` → 403.
- Webhook con `CallSid` desconocido → 200 vacío + log de anomalía.
- `provider_configs` vacía para una categoría → fallback a env var.
- Dos organizaciones con el mismo proveedor configurado → cada una usa sus propias credenciales.

### 7.4 E2E

No aplica en F0 (no hay UI nueva).

---

## 8. Definition of Done

- [ ] `provider_configs` existe con RLS habilitado (verificar con `SELECT relrowsecurity FROM pg_class WHERE relname = 'provider_configs'`).
- [ ] `current_org_id()` existe y funciona (verificar con `SELECT current_org_id()` usando un JWT de prueba).
- [ ] `stages.display_order` eliminada; `grep -r display_order src/` devuelve 0 resultados.
- [ ] `stages.probability` es integer 0–100.
- [ ] `templates.metadata` y `verticals.slug/color/sort_order/positioning/metadata` existen.
- [ ] `callService.ts` no contiene `SERVICE_ROLE_KEY`, `user_profiles`, `organizationId: 1` ni `organization_id: 1`.
- [ ] `/api/crm/ia/discovery-summary` y `/api/crm/ia/next-action` validan `organization_id`.
- [ ] `/api/ai-assistant/transcribe` requiere auth, valida org, límite 25 MB, descuenta créditos.
- [ ] `/api/integrations/whatsapp/validate` y `/templates` requieren auth.
- [ ] `.env.example` documenta las 23 variables faltantes + las nuevas.
- [ ] `motion`, `@twilio/voice-sdk`, `resend`, `react-email`, `@google/genai`, `svix` instalados.
- [ ] `MotionProvider` montado en `src/app/app/layout.tsx`.
- [ ] `/app/crm/configuracion` responde con redirect a `/app/configuracion?modulo=crm`.
- [ ] `ConfiguracionHub.tsx` y `CustomersList.tsx` eliminados.
- [ ] Webhooks legacy `/api/webhooks/{voip,sms,email}/twilio` eliminados; `docs/VOIP_SETUP.md` actualizado.
- [ ] `src/__tests__/guardrails.test.ts` pasa.
- [ ] `npm run lint` limpio.
- [ ] `tsc --noEmit` limpio.
- [ ] `npm test` limpio.
- [ ] Cero archivos `.sql` creados en el repo.

---

## 9. Riesgos y decisiones de diseño

| Riesgo | Mitigación |
|---|---|
| Eliminar `display_order` rompe código que no se encontró | grep exhaustivo antes de la migración; si hay usos en archivos no previstos, se corrigen primero |
| `current_org_id()` ya existe con otra firma | Verificar con `execute_sql` antes de crear; si existe, reutilizar |
| Instalar `motion` cambia el bundle size | Usar `m` + `LazyMotion` (4.6 KB); medir con `next build` |
| `@twilio/voice-sdk` en SSR causa errores | Importar dinámicamente solo en client components (`'use client'` + `dynamic(() => import(...), { ssr: false })`) |
| Eliminar webhooks legacy rompe integraciones existentes | Verificar con `grep -r '/api/webhooks' src/` que ningún componente los referencia; los activos son `/api/integrations/twilio/*` |

### Decisiones

- **No borrar `elevenLabsTTS.ts`/`deepgramSTT.ts`/`realtimeSession.ts`:** son código escrito pero no cableado. Se cablean en F4 (STT) y F6 (TTS/Realtime). Documentar con un comentario `// F4: cablear` / `// F6: cablear` en cada archivo.
- **`provider_configs` con `credentials jsonb`:** las credenciales se guardan cifradas a nivel de aplicación (usar el mismo patrón que `channel_credentials`/`integration_credentials` — investigar `src/lib/services/` para el helper de cifrado existente). Si no hay helper, crear `cryptoService.ts` con AES-256-GCM usando `ENCRYPTION_KEY` de env.
- **SendGrid se mantiene:** no se elimina. El `provider_configs` decide qué proveedor usa cada org. SendGrid es el fallback para orgs existentes; Resend es el default para nuevas.

---

## 10. Archivos tocados — resumen

| Ruta | Acción | Motivo |
|---|---|---|
| `src/lib/services/serverOrgContext.ts` | crear | Helper único de org en server |
| `src/lib/services/providerRegistry.ts` | crear | Registry de proveedores por org |
| `src/lib/services/callService.ts` | modificar | Eliminar bugs G1, G2 |
| `src/types/crm.ts` | modificar | Consolidar tipos canónicos |
| `src/components/crm/oportunidades/types.ts` | modificar | Re-export de `src/types/crm.ts` |
| `src/components/crm/pipeline/*types*` | modificar | Re-export de `src/types/crm.ts` |
| `src/components/crm/reportes/ReportesService.ts` | modificar | `display_order` → `position` |
| `src/app/api/crm/ia/discovery-summary/route.ts` | modificar | Validar org (G3) |
| `src/app/api/crm/ia/next-action/route.ts` | modificar | Validar org (G3) |
| `src/app/api/ai-assistant/transcribe/route.ts` | modificar | Auth, org, límite, créditos (G4) |
| `src/app/api/integrations/whatsapp/validate/route.ts` | modificar | Auth (G15) |
| `src/app/api/integrations/whatsapp/templates/route.ts` | modificar | Auth (G15) |
| `src/app/api/webhooks/voip/twilio/route.ts` | eliminar | Webhook legacy (G5) |
| `src/app/api/webhooks/sms/twilio/route.ts` | eliminar | Webhook legacy (G5) |
| `src/app/api/webhooks/email/twilio/route.ts` | eliminar | Webhook legacy (G5) |
| `src/app/app/crm/configuracion/page.tsx` | crear | Redirect (G8) |
| `src/components/crm/dashboard/CRMQuickNav.tsx` | modificar | Verificar link (G8) |
| `src/components/crm/configuracion/ConfiguracionHub.tsx` | eliminar | Huérfano (G14) |
| `src/components/crm/customers/CustomersList.tsx` | eliminar | Huérfano (G14) |
| `src/components/shared/MotionProvider.tsx` | crear | `MotionConfig` global |
| `src/components/shared/motion/primitives.tsx` | crear | Primitivas compartidas |
| `src/app/app/layout.tsx` | modificar | Montar `MotionProvider` |
| `.env.example` | modificar | Documentar 23+ vars (G6) |
| `docs/VOIP_SETUP.md` | modificar | Eliminar refs a webhooks legacy (G5) |
| `src/__tests__/guardrails.test.ts` | crear | Guardarraíl automatizado |
| `package.json` | modificar | Instalar 6 dependencias |
| `src/lib/services/integrations/twilio/voiceAgent/elevenLabsTTS.ts` | modificar | Comentario `// F6: cablear` |
| `src/lib/services/integrations/twilio/voiceAgent/deepgramSTT.ts` | modificar | Comentario `// F4: cablear` |
| `src/lib/services/integrations/twilio/voiceAgent/realtimeSession.ts` | modificar | Comentario `// F6: cablear` |
