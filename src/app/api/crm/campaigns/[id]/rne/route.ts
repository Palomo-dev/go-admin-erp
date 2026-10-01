import { NextResponse } from 'next/server';
import { withWhatsAppRoute } from '@/lib/services/crm/whatsapp/http';
import { getCampaignCompliance, registerCampaignRne } from '@/lib/services/crm/whatsapp/campaignRneService';
import { WhatsAppError } from '@/lib/services/crm/whatsapp/types';
import { MAX_BYTES_ARCHIVO_RNE, VIGENCIA_RNE_DIAS } from '@/lib/services/crm/voiceAgent/rne';
import { CRM_PERMISOS, exigirPermisoCrm, UUID_RE } from '@/lib/services/crm/crmRouteSupport';
import { hasOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { getServiceClient } from '@/lib/supabase/server-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const NO_STORE = { 'Cache-Control': 'no-store, max-age=0' };

function campaignId(id: string): string {
  if (!UUID_RE.test(id)) throw new WhatsAppError('VALIDATION', 'Campaña inválida', 400);
  return id;
}

/** Limita también cuerpos sin Content-Length; el servicio valida los bytes del archivo decodificado. */
async function readUpload(req: Request): Promise<unknown> {
  const maximum = MAX_BYTES_ARCHIVO_RNE * 2;
  if (Number(req.headers.get('content-length')) > maximum) throw new WhatsAppError('VALIDATION', 'El archivo supera 8 MB', 413);
  const reader = req.body?.getReader();
  if (!reader) throw new WhatsAppError('VALIDATION', 'El archivo está vacío', 400);
  const parts: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maximum) { await reader.cancel(); throw new WhatsAppError('VALIDATION', 'El archivo supera 8 MB', 413); }
      parts.push(chunk.value);
    }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(parts).toString('utf8')); }
  catch { throw new WhatsAppError('VALIDATION', 'Body inválido: se espera JSON', 400); }
}

export const GET = withWhatsAppRoute(async (ctx, req, params) => {
  readOrgBody(ctx, {}, { request: req });
  await exigirPermisoCrm(ctx, [CRM_PERMISOS.oportunidadesVer], 'Consultar cumplimiento de campañas');
  const [data, puedeVerificar] = await Promise.all([
    getCampaignCompliance(ctx.organizationId, campaignId(params.id), ctx.supabase),
    hasOrgAdminOrPermission(ctx, CRM_PERMISOS.campanasGestionar),
  ]);
  return NextResponse.json({ data, puede_verificar: puedeVerificar, vigencia_dias: VIGENCIA_RNE_DIAS }, { headers: NO_STORE });
});

export const POST = withWhatsAppRoute(async (ctx, req, params) => {
  readOrgBody(ctx, {}, { request: req });
  const id = campaignId(params.id);
  const raw = readOrgBody(ctx, await readUpload(req), { request: req });
  if (!raw || typeof raw !== 'object' || !('contenido' in raw) || typeof raw.contenido !== 'string')
    throw new WhatsAppError('VALIDATION', 'Selecciona un archivo RNE de texto', 400);
  const nombre = 'nombre_archivo' in raw && typeof raw.nombre_archivo === 'string' ? raw.nombre_archivo : null;
  const data = await registerCampaignRne(ctx.organizationId, id, ctx.userId,
    { nombre, contenido: raw.contenido }, ctx.supabase, getServiceClient());
  return NextResponse.json({ data }, { headers: NO_STORE });
}, { admin: true, permission: CRM_PERMISOS.campanasGestionar });
