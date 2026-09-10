/**
 * TESTER F16 · ronda 2 — tests que FIJAN los defectos encontrados en el re-test.
 *
 * Convención (la misma que `testerR1.test.ts`): cada test afirma el
 * comportamiento ACTUAL y el comentario dice cómo debe quedar cuando se
 * corrija, para que la corrección rompa el test y se note.
 */
import fs from 'node:fs';
import path from 'node:path';
import { zCreateCampaignBody, zSendBody } from '../schemas';
import { updateCampaign } from '../campaignStore';
import { makeSupabase } from './mockSupabase';

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

  it('createCampaign con organization_id en el body: PASA (debería rechazar)', () => {
    const r = zCreateCampaignBody.safeParse({ ...body, organization_id: 999 });
    expect(r.success).toBe(true);
    // y la clave simplemente desaparece del resultado
    expect(Object.keys((r as { data: Record<string, unknown> }).data)).not.toContain('organization_id');
  });

  it('send con orgId en el body: PASA (debería rechazar)', () => {
    const r = zSendBody.safeParse({ customerId: UUID_B, channelId: UUID_A, text: 'hola', orgId: 7 });
    expect(r.success).toBe(true);
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
    expect(s.channel_id).toBe(UUID_B);          // el canal sí cambia
    expect(s.materialized_at).toBe('2026-09-09T00:00:00.000Z');  // ← debería ser null
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
  it('whatsappCloudService.processStatusUpdate todavía inserta event_time', () => {
    const src = readSrc('src/lib/services/integrations/whatsapp/whatsappCloudService.ts');
    const insertBlock = src.slice(src.indexOf("from('message_events')"), src.indexOf("from('message_events')") + 400);
    expect(insertBlock).toContain('event_time');
  });

  it('la Edge Function channel-dispatch todavía inserta event_time', () => {
    const src = readSrc('supabase/functions/channel-dispatch/index.ts');
    const i = src.indexOf('message_events');
    expect(src.slice(i, i + 400)).toContain('event_time');
  });

  it('ninguno de los dos comprueba el error del insert', () => {
    const src = readSrc('src/lib/services/integrations/whatsapp/whatsappCloudService.ts');
    const i = src.indexOf("from('message_events')");
    expect(src.slice(i - 120, i)).not.toContain('error');
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
  it('nadie consulta claimed_at para recuperar un claim caducado', () => {
    const src = readSrc('src/lib/services/crm/whatsapp/campaignBatch.ts');
    expect(src).toContain('claimed_at');                       // se escribe
    expect(src.match(/claimed_at/g)?.length).toBe(1);          // …y solo una vez
    expect(src).not.toContain('stale');
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
    const block = src.slice(i, i + 1600);
    expect(block).toContain(".eq('phone', phone)");
    expect(block).not.toMatch(/replace\(\/\\D\/g|normalizePhone|E164|e164/);
  });
});
