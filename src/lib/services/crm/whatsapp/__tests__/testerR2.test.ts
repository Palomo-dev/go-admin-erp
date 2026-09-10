/**
 * TESTER F16 · ronda 2 — tests que FIJARON los defectos encontrados en el re-test.
 *
 * Convención (la misma que `testerR1.test.ts`): cada test afirmaba el
 * comportamiento DEFECTUOSO y el comentario decía cómo debía quedar al
 * corregirlo, para que la corrección rompiera el test y se notara.
 *
 * RONDA 3 (2026-09-10): (a), F-1, F-2, F-4 y F-13 están corregidos, así que
 * estos tests quedan INVERTIDOS — ahora afirman el comportamiento correcto y
 * valen como regresión. Los comentarios originales se conservan para no perder
 * el porqué. Las pruebas de comportamiento de cada arreglo están en
 * `round3.test.ts`; las de F-12, en
 * `src/app/api/chat/ai/auto-response/__tests__/autoResponse.f16.test.ts`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { zCreateCampaignBody, zSendBody } from '../schemas';
import { updateCampaign } from '../campaignStore';
import { makeSupabase } from './mockSupabase';
import { renderVariables, emptyContext } from '@/lib/services/crm/email/variables';
import { resolveParam, renderTemplateComponents } from '../templateRender';

const ROOT = path.resolve(__dirname, '../../../../../..');
const readSrc = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-8222-222222222222';
const UUID_C = '33333333-3333-4333-8333-333333333333';

describe('F16 r2 · schemas: `noOrgInBody` no rechaza nada', () => {
  // El informe de la ronda 2 y §1.1 del doc afirman «el body NUNCA puede traer
  // organization_id: se rechaza en vez de ignorarse». No es cierto: zod v3
  // ELIMINA las claves desconocidas ANTES de ejecutar `.refine`, así que el
  // refine nunca ve `organization_id` y el body pasa la validación.
  // Cuando se corrija (`.strict()` o `.passthrough()` + refine), estos dos
  // tests deben invertirse a `success === false`.
  const body = {
    name: 'Masivo', channel: 'whatsapp', channel_id: UUID_A, template_id: null, content: 'hola',
    audience: { source: 'manual', customer_ids: [UUID_B] },
    throttle_mps: 5, respect_allowed_hours: true, purpose: 'utility',
  };

  // CORREGIDO en r3: la comprobación se movió a `preprocess`, que sí ve el
  // objeto crudo antes de que zod elimine las claves desconocidas.
  it('createCampaign con organization_id en el body: se RECHAZA', () => {
    expect(zCreateCampaignBody.safeParse({ ...body, organization_id: 999 }).success).toBe(false);
  });

  it('send con orgId en el body: se RECHAZA', () => {
    expect(zSendBody.safeParse({ customerId: UUID_B, channelId: UUID_A, text: 'hola', orgId: 7 }).success).toBe(false);
  });
});

describe('F16 r2 · updateCampaign: cambiar de canal NO invalida la materialización', () => {
  // `materializeCampaign` calcula la ventana de 24 h POR CANAL
  // (`openWindowSet(orgId, channelId, …)`) y el proveedor (QR o no) también sale
  // del canal. Al arreglar el fallo 3 del tester r1 la invalidación pasó a
  // comparar solo audiencia / template_id / purpose, así que un cambio de
  // `channel_id` conserva `materialized_at` y la campaña se lanza con contactos
  // calculados contra OTRO canal (verificado en vivo: 3 pending → 3
  // `skipped:window_required`, con los créditos ya reservados).
  // Cuando se corrija, `materialized_at` debe quedar en null aquí.
  it('conserva materialized_at al cambiar channel_id', async () => {
    const stats = {
      audience: { source: 'manual', segment_id: null, pipeline_id: null, stage_ids: [], opportunity_ids: [], customer_ids: [UUID_B] },
      channel_id: UUID_A, materialized_at: '2026-09-09T00:00:00.000Z', pending: 3, purpose: 'utility',
    };
    const row = { id: UUID_C, organization_id: 2, name: 'C', channel: 'whatsapp', status: 'draft', scheduled_at: null, template_id: null, segment_id: null, content: 'hola', statistics: stats, created_by: null, created_at: '2026-09-09T00:00:00.000Z', updated_at: '2026-09-09T00:00:00.000Z' };
    let written: Record<string, unknown> | null = null;
    const { sb } = makeSupabase({
      campaigns: (ops) => {
        const upd = ops.find((o) => o.method === 'update');
        if (!upd) return { data: row };
        written = upd.args[0] as Record<string, unknown>;
        return { data: { ...row, statistics: (written as { statistics: unknown }).statistics } };
      },
      channels: () => ({ data: { id: UUID_B } }),
    });
    await updateCampaign(2, UUID_C, { channel_id: UUID_B }, sb);
    const s = (written as unknown as { statistics: { materialized_at?: string | null; channel_id?: string | null } }).statistics;
    expect(s.channel_id).toBe(UUID_B);          // el canal cambia
    expect(s.materialized_at).toBeNull();       // CORREGIDO en r3 (F-13)
  });
});

describe('F16 r2 · message_events: `event_time` es GENERATED ALWAYS AS (created_at)', () => {
  // Verificado contra la BD: cualquier INSERT que incluya `event_time` falla con
  // 428C9 «cannot insert a non-DEFAULT value into column "event_time"».
  // Ni `processStatusUpdate` ni `recordResult` de la Edge Function comprueban el
  // error, así que TODOS los eventos de estado se pierden en silencio
  // (message_events lleva 20 filas y ninguna posterior al 2026-08-25, con 24
  // salientes despachados hoy). Otros módulos del repo ya documentan el mismo
  // patrón para `integration_events`.
  // Cuando se corrija (quitar `event_time` del insert y comprobar el error),
  // estas expectativas deben invertirse.
  // CORREGIDO en r3 (F-1): la columna sale del INSERT (la marca del proveedor
  // se conserva dentro de `provider_payload.event_time`) y los dos escritores
  // comprueban el error. El comportamiento se prueba en `round3.test.ts`.
  it('whatsappCloudService.processStatusUpdate ya no inserta event_time', () => {
    const src = readSrc('src/lib/services/integrations/whatsapp/whatsappCloudService.ts');
    const i = src.indexOf("from('message_events').insert(");
    expect(i).toBeGreaterThan(-1);
    expect(src.slice(i, i + 400)).not.toMatch(/^\s*event_time:/m);
  });

  it('la Edge Function channel-dispatch ya no inserta event_time', () => {
    const src = readSrc('supabase/functions/channel-dispatch/index.ts');
    const i = src.indexOf('from("message_events").insert(');
    expect(i).toBeGreaterThan(-1);
    expect(src.slice(i, i + 400)).not.toMatch(/^\s*event_time:/m);
  });

  it('los dos comprueban el error del insert', () => {
    const ts = readSrc('src/lib/services/integrations/whatsapp/whatsappCloudService.ts');
    const i = ts.indexOf("from('message_events').insert(");
    expect(ts.slice(i - 60, i)).toContain('error');
    const edge = readSrc('supabase/functions/channel-dispatch/index.ts');
    const j = edge.indexOf('from("message_events").insert(');
    expect(edge.slice(j - 60, j)).toContain('error');
  });
});

describe('F16 r2 · claims caducados: `claimed_at` se escribe y nunca se lee', () => {
  // Un lote que muere a mitad (timeout de la función, despliegue, crash) deja
  // sus filas en `metadata.state='queued'` con `claim_token`. `claimContacts`
  // solo reclama las que están en `pending`, así que esas filas quedan
  // bloqueadas para siempre: la campaña nunca llega a `sent` y cada lote
  // vuelve a encolar el siguiente (verificado en vivo: 4 ejecuciones → 5 jobs,
  // claimed 0, queued 2 constantes).
  // Cuando exista un recuperador de claims caducados, este test debe invertirse.
  // CORREGIDO en r3 (F-2): `isStaleClaim` lee `claimed_at` y `claimContacts`
  // vuelve a reclamar las filas 'queued' cuyo lote murió; además el
  // encadenamiento se corta tras `MAX_STALLED_BATCHES` lotes sin progreso.
  // El comportamiento (no el fuente) se prueba en `round3.test.ts`.
  it('claimed_at se lee para recuperar un claim caducado', () => {
    const src = readSrc('src/lib/services/crm/whatsapp/campaignBatch.ts');
    expect(src.match(/claimed_at/g)?.length ?? 0).toBeGreaterThan(1);
    expect(src).toContain('isStaleClaim');
    expect(src).toContain('MAX_STALLED_BATCHES');
  });
});

describe('F16 r2 · el webhook Cloud no normaliza el teléfono', () => {
  // Meta manda `from` en dígitos («15550109701»); el CRM guarda los teléfonos en
  // E.164 con «+» (683 de 848 clientes de las orgs con WhatsApp). La búsqueda
  // `customers.phone === phone` no normaliza, así que cada respuesta de un
  // cliente existente crea un cliente DUPLICADO y se pierde la atribución de la
  // respuesta a la campaña (verificado en vivo).
  // Cuando se corrija, debe aparecer una normalización antes del eq('phone', …).
  it('findOrCreateCustomer busca por el teléfono crudo', () => {
    const src = readSrc('src/lib/services/integrations/whatsapp/whatsappCloudService.ts');
    const i = src.indexOf('private async findOrCreateCustomer');
    const block = src.slice(i, i + 1800);
    // CORREGIDO en r3 (F-4): se normaliza a dígitos E.164 y la búsqueda
    // compara NÚMEROS (`findCustomerIdByPhone`), no cadenas.
    expect(block).not.toContain(".eq('phone', phone)");
    expect(block).toContain('normalizePhoneDigits');
    expect(block).toContain('findCustomerIdByPhone');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Re-verificación de la ronda 2 (2026-09-10). Hallazgo NUEVO y CRÍTICO:
// las llaves que el motor de variables NO reconoce como ruta válida se envían
// LITERALES al cliente y NO se cuentan como faltantes, así que no hay
// MISSING_VARIABLES ni 422 que lo pare. Es exactamente el fallo que la ronda 1
// dio por cerrado («{{nombre}} literal al cliente»), reabierto por otra puerta.
// ─────────────────────────────────────────────────────────────────────────────

describe('F16 r2-bis · texto libre: llaves no-ruta salen LITERALES sin marcarse como faltantes', () => {
  // `PATH_RE = /^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)*$/` en
  // `email/variables.ts:165`. Todo lo que no encaje (posicionales {{1}},
  // acentos, guiones, espacios, mayúsculas con espacio) cae en la rama
  // `return lit(match)` de la línea 232, que devuelve el literal y NO llama a
  // `missing.add`. `{{1}}`/`{{2}}` es la sintaxis por defecto del gestor de
  // plantillas de Meta y de Twilio: es lo que un usuario pega en una campaña.
  // Cuando se corrija, estos casos deben aparecer en `missing` (o resolverse):
  // invertir a `expect(r.missing).toContain(...)`.
  // CORREGIDO en r3 (defecto (a)): la rama de `variables.ts:232` registra
  // ahora en `missing` y devuelve vacío, así que ni el literal sale ni el
  // envío pasa (F7 y F16 paran con 422 MISSING_VARIABLES).
  const cases = ['{{1}}', '{{2}}', '{{ 1 }}', '{{año}}', '{{nombre-cliente}}', '{{nombre cliente}}', '{{Nombre Completo}}'];
  for (const c of cases) {
    it(`«${c}» NO llega al cuerpo y se marca como faltante`, () => {
      const ctx = { ...emptyContext(), contact: { first_name: 'Ana' } } as unknown as Parameters<typeof renderVariables>[1];
      const r = renderVariables(`Hola ${c}, gracias.`, ctx, { escapeHtml: false, strictPaths: true });
      expect(r.out).not.toContain('{{');
      expect(r.missing.length).toBeGreaterThan(0);
    });
  }

  it('contraste: «{{nombre}}» (ruta válida sin valor) SÍ se marca como faltante', () => {
    const ctx = { ...emptyContext(), contact: { first_name: 'Ana' } } as unknown as Parameters<typeof renderVariables>[1];
    const r = renderVariables('Hola {{nombre}}, gracias.', ctx, { escapeHtml: false, strictPaths: true });
    expect(r.missing).toContain('nombre');
  });
});

describe('F16 r2-bis · HSM posicional: el parámetro se resuelve al literal «{{custom.N}}»', () => {
  // `resolveParam` (templateRender.ts:38) prueba `renderVariables('{{custom.' + p + '}}')`
  // y acepta el resultado si no está vacío. Con p = '1' la ruta `custom.1` no
  // pasa PATH_RE, así que `renderVariables` devuelve el literal «{{custom.1}}»
  // y `resolveParam` lo toma por un valor bueno: `missing` queda vacío y ESE
  // texto es el que viaja a Graph como parámetro del mensaje.
  // Afecta a toda plantilla con parámetros posicionales, incluidas las que
  // `syncFromMeta` importa de la cuenta de Meta (`defaultVariableMap` les asigna
  // `custom.1`, `custom.2`, …).
  // Al corregir: `resolveParam` debe devolver `null` y el envío parar en 422.
  // CORREGIDO en r3: `resolveParam` devuelve null y el envío para en 422.
  // Una plantilla posicional sigue siendo usable si el usuario da los valores
  // explícitos (`variables`/`default_variables` con las claves "1", "2", …).
  it('resolveParam("1") devuelve null', () => {
    const ctx = { ...emptyContext() } as unknown as Parameters<typeof renderVariables>[1];
    expect(resolveParam('1', { variable_map: {} } as never, ctx as never, {})).toBeNull();
  });

  it('renderTemplateComponents reporta {{1}}/{{2}} como faltantes y no manda «{{» a Graph', () => {
    const ctx = { ...emptyContext() } as unknown as Parameters<typeof renderVariables>[1];
    const t = {
      name: 'promo',
      body: 'Hola {{1}}, tu pedido {{2}} ya salio.',
      meta: { language: 'es', variable_map: {}, components: [{ type: 'BODY', text: 'Hola {{1}}, tu pedido {{2}} ya salio.' }] },
    };
    const out = renderTemplateComponents(t as never, ctx as never, {});
    expect(out.missing.sort()).toEqual(['1', '2']);
    expect(out.values['1']).toBeUndefined();
    expect(JSON.stringify(out.payload)).not.toContain('{{');
  });
});

describe('F16 r2-bis · message_events: cualquiera con la clave anon puede escribirlos', () => {
  // Política real de la BD: `System can create message events` es INSERT para
  // el rol `public` con `with_check = true`, y `anon` tiene GRANT INSERT.
  // Comprobado contra la base (con ROLLBACK): un INSERT como `anon` en
  // message_events para una organización ajena es ACEPTADO. Esos eventos los
  // consume `syncCampaignFromEvents` al inicio de cada lote.
  // Este test solo fija que el código sigue confiando en la tabla sin filtro.
  it('syncCampaignFromEvents lee message_events sin ninguna verificación de origen', () => {
    const src = readSrc('src/lib/services/crm/whatsapp/campaignEvents.ts');
    expect(src).toContain("from('message_events')");
    expect(src).not.toMatch(/provider_payload_signature|trusted|verified_source/);
  });
});
