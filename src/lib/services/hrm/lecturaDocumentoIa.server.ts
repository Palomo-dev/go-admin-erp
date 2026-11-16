/**
 * «Leer documento con IA» (Figma 20.3, 95-hrm-03-09): lee un documento de
 * identidad ya subido al bucket privado y PROPONE los campos de la ficha. La IA
 * nunca guarda nada: la persona confirma campo por campo (decisión 13).
 *
 * - Permiso: editar identificación de esa persona (se comprueba ANTES de gastar
 *   créditos).
 * - Descarga: `urlDescarga` (comprueba el permiso y deja la fila del registro).
 * - Modelo: `resolveModel('vision', ajustes de la organización)`; el proveedor y
 *   la llave salen de la configuración de IA de la organización, igual que el
 *   lector de documentos del GO Assistant. Nada cableado.
 * - Créditos: saldo ANTES de llamar al proveedor; cobro con `chargeAiCredits`
 *   DESPUÉS de una respuesta válida. Una lectura fallida no se cobra.
 */
import { getServiceClient } from '@/lib/supabase/server-service';
import { loadOrgModelSettings, resolveModel } from '@/lib/ai/agent/modelRouter';
import { HrmError, errorDeRpc, esUuid, type ContextoPeticion } from './tipos';
import { urlDescarga } from './documentosService.server';
import { leerDatosSensibles } from './datosSensiblesService.server';
import type { ContextoSesionPersonas } from './personasService.server';

export const CREDITOS_LECTURA_DOCUMENTO = 2;
const ACCION_IA = 'hr_document_read';
const MAX_BYTES = 10 * 1024 * 1024;

export const CAMPOS_LECTURA = [
  'doc_type',
  'doc_number',
  'nombres',
  'apellidos',
  'birth_date',
  'doc_issue_date',
  'doc_issue_place',
] as const;
export type CampoLectura = (typeof CAMPOS_LECTURA)[number];

export interface CampoPropuesto {
  campo: CampoLectura;
  valor: string;
  confianza: 'alta' | 'media' | 'baja';
  actual: string | null;
}

const PROMPT = [
  'Lee este documento de identidad colombiano (cédula de ciudadanía, cédula de extranjería, tarjeta de identidad, pasaporte, PEP o PPT).',
  'Devuelve SOLO lo que se lee en el documento; si un dato no aparece, deja el valor vacío y confianza "baja". No inventes.',
  'doc_type: uno de CC, CE, TI, RC, PA, PEP, PPT. doc_number: solo dígitos y letras, sin puntos.',
  'nombres y apellidos tal como aparecen, con mayúscula inicial. Fechas en formato YYYY-MM-DD.',
  'doc_issue_place: municipio y departamento de expedición («Envigado, Antioquia»).',
  'confianza: "alta" si el dato se lee con claridad, "media" si dudas, "baja" si es ilegible o no aparece.',
].join(' ');

function esquema() {
  const campo = {
    type: 'OBJECT',
    properties: { valor: { type: 'STRING' }, confianza: { type: 'STRING', enum: ['alta', 'media', 'baja'] } },
    required: ['valor', 'confianza'],
  };
  return {
    type: 'OBJECT',
    properties: Object.fromEntries(CAMPOS_LECTURA.map((c) => [c, campo])),
    required: [...CAMPOS_LECTURA],
  };
}

const MIME_PERMITIDOS = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'];

export async function leerDocumentoConIa(
  ctx: ContextoSesionPersonas,
  personaId: string,
  documentoId: string,
  p: ContextoPeticion
): Promise<{ campos: CampoPropuesto[]; modelo: string; creditos: number; segundos: number }> {
  if (!esUuid(personaId) || !esUuid(documentoId)) throw new HrmError(400, 'documento_invalido');
  const db = getServiceClient();
  const { data: puede, error: errPuede } = await db.rpc('fn_hr_actor_puede_grupo', {
    p_actor: ctx.userId,
    p_org: ctx.organizationId,
    p_person: personaId,
    p_grupo: 'identificacion',
    p_accion: 'editar',
  });
  if (errPuede) throw errorDeRpc(errPuede);
  if (puede !== true) throw new HrmError(403, 'sin_permiso');

  const ajustes = await loadOrgModelSettings(ctx.supabase, ctx.organizationId);
  const resuelto = resolveModel('vision', ajustes);
  if (!/^gemini/i.test(resuelto.model)) throw new HrmError(503, 'ia_no_disponible');
  const { getProviderCredentials } = await import('@/lib/services/providerCredentials.server');
  const cfg = await getProviderCredentials(ctx.organizationId, 'analysis', 'google');
  const apiKey = (cfg.credentials.GOOGLE_AI_API_KEY ?? cfg.credentials.GEMINI_API_KEY) as string | undefined;
  if (!apiKey) throw new HrmError(503, 'ia_no_disponible');

  // Saldo ANTES de llamar al proveedor.
  const { checkAICredits } = await import('@/lib/services/aiCreditsService');
  const saldo = await checkAICredits(ctx.organizationId);
  if (!saldo.allowed) throw new HrmError(402, 'sin_creditos');

  const { url } = await urlDescarga(ctx, documentoId, p);
  if (!url.includes(`/${personaId}/`)) throw new HrmError(404, 'no_existe');
  const resp = await fetch(url);
  if (!resp.ok) throw new HrmError(502, 'error_almacenamiento');
  const mime = (resp.headers.get('content-type') ?? '').split(';')[0].trim();
  if (!MIME_PERMITIDOS.includes(mime)) throw new HrmError(422, 'tipo_no_permitido');
  const bytes = Buffer.from(await resp.arrayBuffer());
  if (bytes.length > MAX_BYTES) throw new HrmError(422, 'tamano_no_permitido');

  const inicio = Date.now();
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey });
  let texto: string;
  try {
    const r = await ai.models.generateContent({
      model: resuelto.model,
      contents: [{ role: 'user', parts: [{ inlineData: { mimeType: mime, data: bytes.toString('base64') } }, { text: PROMPT }] }] as never,
      config: {
        httpOptions: { timeout: 30_000, retryOptions: { attempts: 1 } },
        responseMimeType: 'application/json',
        responseSchema: esquema() as never,
        temperature: 0,
      },
    });
    texto = r.text ?? '';
  } catch (err) {
    console.error('[hrm] lectura IA fallida:', err instanceof Error ? err.message : err);
    throw new HrmError(502, 'lectura_fallida');
  }
  let leido: Record<string, { valor?: unknown; confianza?: unknown }>;
  try {
    leido = JSON.parse(texto);
  } catch {
    throw new HrmError(502, 'lectura_fallida');
  }

  const actual = await leerDatosSensibles(ctx, personaId, 'identificacion', p);
  const ident = (actual.identificacion ?? {}) as Record<string, string | null>;
  const { data: persona } = await db
    .from('hr_people')
    .select('first_name, second_name, last_name, second_last_name')
    .eq('id', personaId)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle();
  const actuales: Record<CampoLectura, string | null> = {
    doc_type: ident.doc_type ?? null,
    doc_number: ident.doc_number ?? null,
    nombres: [persona?.first_name, persona?.second_name].filter(Boolean).join(' ') || null,
    apellidos: [persona?.last_name, persona?.second_last_name].filter(Boolean).join(' ') || null,
    birth_date: ident.birth_date ?? null,
    doc_issue_date: ident.doc_issue_date ?? null,
    doc_issue_place: ident.doc_issue_place ?? null,
  };
  const campos: CampoPropuesto[] = CAMPOS_LECTURA.map((c) => {
    const v = leido?.[c];
    const valor = typeof v?.valor === 'string' ? v.valor.trim().slice(0, 120) : '';
    const confianza: CampoPropuesto['confianza'] = v?.confianza === 'alta' || v?.confianza === 'media' ? v.confianza : 'baja';
    return { campo: c, valor, confianza, actual: actuales[c] };
  }).filter((c) => c.valor !== '');
  if (campos.length === 0) throw new HrmError(422, 'lectura_vacia');

  // Cobro DESPUÉS de una respuesta válida.
  const { chargeAiCredits } = await import('@/lib/services/crm/aiCostService');
  await chargeAiCredits({
    orgId: ctx.organizationId,
    actionType: ACCION_IA,
    model: resuelto.model,
    units: 0,
    credits: CREDITOS_LECTURA_DOCUMENTO,
    userId: ctx.userId,
    metadata: { documento: documentoId, origen: 'hrm/ficha' },
  });
  return { campos, modelo: resuelto.model, creditos: CREDITOS_LECTURA_DOCUMENTO, segundos: Math.round((Date.now() - inicio) / 1000) };
}
