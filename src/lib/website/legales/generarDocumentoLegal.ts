/**
 * Generador único de un documento legal. Servidor.
 *
 * `modo: 'auto'` (creación del sitio y backfill) no cobra.
 * `modo: 'ia'` con `cobrar: true` (el botón de la UI) cobra 1 crédito solo si
 * la respuesta de la IA pasa la validación. Sin clave, sin créditos, timeout
 * de 20 s, error o HTML inválido: la plantilla determinista.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod';
import type { ClaveLegal } from '@/lib/website/configuracionSitio';
import { giroDeTipoOrganizacion, type Giro } from '@/components/sitio-web/paginas/plantillasPagina';
import { hostSitio, type DominioDelSitio } from '@/lib/website/hostSitio';
import { toPlainDate } from '@/lib/utils/dateCore';
import { loadOrgModelSettings, resolveModel } from '@/lib/ai/agent/modelRouter';
import { chargeAiCredits, InsufficientCreditsError } from '@/lib/services/crm/aiCostService';
import { ensureAiSettings } from '@/lib/services/aiCreditsService';
import {
  elegirDocumento,
  plantillaLegal,
  type DatosLegales,
  type ResultadoPlantilla,
} from '@/lib/website/legales/plantillasLegales';

export const CREDITOS_LEGAL = 1;
export const ACCION_IA_LEGAL = 'website_legal_document';
const TIMEOUT_MS = 20_000;

const Salida = z.object({ html: z.string().max(20000) });

const PEDIDO: Record<ClaveLegal, string> = {
  tratamiento:
    'Política de tratamiento de datos. Incluye la Ley 1581 de 2012 y el Decreto 1377 de 2013: responsable, finalidades, derechos del titular, consultas en 10 días hábiles, reclamos en 15 días hábiles, canal de contacto y vigencia.',
  devoluciones:
    'Cambios, devoluciones y garantías. Incluye la Ley 1480 de 2011: garantía de los artículos 7 y 8, retracto de 5 días hábiles (artículo 47) y reversión del pago (artículo 51 y Decreto 587 de 2016).',
  envios: 'Política de envíos: costos, envío gratis desde el umbral indicado y tipos de entrega. Si un dato no viene, omite esa frase.',
  terminos: 'Términos y condiciones de compra o reserva en Colombia, en español, sin inventar precios ni plazos.',
  privacidad: 'Política de privacidad: qué datos se recogen, para qué y cómo pedir corrección o supresión.',
  cookies: 'Política de cookies: técnicas necesarias y que las de medición solo aplican si el negocio las configuró.',
};

const TIPOS_ENTREGA: Record<string, string> = {
  pickup: 'recogida en el local',
  delivery_own: 'entrega propia',
  delivery_third_party: 'entrega con transportadora',
};

export interface OpcionesGenerar {
  modo: 'ia' | 'auto';
  /** Solo la UI. La autogeneración y el backfill van en false. */
  cobrar?: boolean;
  supabase: SupabaseClient;
  branchId?: number | null;
  userId?: string | null;
  /** Pruebas: sustituye la llamada a OpenAI. `null` simula caída. */
  pedirIa?: (datos: DatosLegales, clave: ClaveLegal) => Promise<string | null>;
  ahora?: Date;
}

export interface DocumentoGenerado extends ResultadoPlantilla {
  datos: DatosLegales;
  giro: Giro;
  incluyeEnvios: boolean;
}

function texto(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t || null;
}

function dinero(v: unknown): string | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(n);
}

function tiposEntrega(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => TIPOS_ENTREGA[String(x)] ?? String(x)).filter((x) => x && x !== 'undefined');
}

function nitDe(org: { nit?: unknown; tax_id?: unknown; dv?: unknown }): string | null {
  const nit = texto(org.nit);
  const dv = org.dv == null || org.dv === '' ? null : String(org.dv);
  if (nit) return dv && !nit.includes('-') ? `${nit}-${dv}` : nit;
  const tax = texto(org.tax_id);
  if (!tax) return null;
  return dv ? `${tax}-${dv}` : tax;
}

export function incluyeEnvios(giro: Giro, enableShipping: boolean): boolean {
  return giro === 'tienda' || giro === 'restaurante' || enableShipping;
}

export async function cargarDatosLegales(
  supabase: SupabaseClient,
  orgId: number,
  branchId: number | null,
  ahora: Date = new Date(),
): Promise<{ datos: DatosLegales; giro: Giro; incluyeEnvios: boolean }> {
  const [orgRes, settingsRes, domainsRes] = await Promise.all([
    supabase
      .from('organizations')
      .select('legal_name, name, nit, tax_id, dv, address, city, state, country, email, phone, custom_domain, subdomain, timezone, type_id')
      .eq('id', orgId)
      .maybeSingle(),
    supabase
      .from('website_settings')
      .select('contact_email, contact_phone, whatsapp_number, enable_shipping, shipping_flat_rate, free_shipping_threshold, available_delivery_types, branch_id')
      .eq('organization_id', orgId),
    supabase.from('organization_domains').select('host, domain_type, status, is_primary, is_active, updated_at').eq('organization_id', orgId),
  ]);
  const org = (orgRes.data ?? {}) as Record<string, unknown>;
  const filas = (settingsRes.data ?? []) as Record<string, unknown>[];
  const deSede = branchId != null ? filas.find((f) => f.branch_id === branchId) : undefined;
  const general = filas.find((f) => f.branch_id == null);
  const settings = { ...(general ?? {}), ...(deSede ?? {}) };
  const typeId = typeof org.type_id === 'number' ? org.type_id : null;
  const giro = giroDeTipoOrganizacion(typeId);
  const envioActivo = settings.enable_shipping === true;
  // `giroDeTipoOrganizacion(null)` cae en tienda. Envíos solo si el tipo es
  // restaurante (1) o tienda (3), o si el sitio tiene envíos activos.
  const vende = typeId === 1 || typeId === 3;
  const tz = texto(org.timezone) || 'America/Bogota';
  const dominios = (domainsRes.data ?? []) as DominioDelSitio[];
  const host = hostSitio(dominios, texto(org.subdomain)) || texto(org.custom_domain);
  const datos: DatosLegales = {
    legalName: texto(org.legal_name),
    name: texto(org.name),
    nit: nitDe(org),
    address: texto(org.address),
    city: texto(org.city),
    state: texto(org.state),
    country: texto(org.country) || 'Colombia',
    email: texto(settings.contact_email) || texto(org.email),
    phone: texto(settings.contact_phone) || texto(org.phone),
    whatsapp: texto(settings.whatsapp_number),
    dominio: host,
    envioTarifa: dinero(settings.shipping_flat_rate),
    envioGratisDesde: dinero(settings.free_shipping_threshold),
    envioActivo,
    tiposEntrega: tiposEntrega(settings.available_delivery_types),
    vigencia: toPlainDate(ahora, tz),
  };
  return { datos, giro, incluyeEnvios: vende || envioActivo };
}

async function pedirOpenAi(datos: DatosLegales, clave: ClaveLegal, model: string): Promise<string | null> {
  if (!process.env.OPENAI_API_KEY) return null;
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: TIMEOUT_MS });
  const controlador = new AbortController();
  const timer = setTimeout(() => controlador.abort(), TIMEOUT_MS);
  try {
    const r = await openai.responses.parse(
      {
        model,
        store: false,
        input: [
          {
            role: 'system',
            content: [
              'Redactas documentos legales para un negocio en Colombia.',
              'Responde solo JSON con la clave html.',
              'El html usa únicamente h2, p, ul, ol, li, strong, em, a y br.',
              'Español de Colombia, trato de usted, sin emojis.',
              'Usa exclusivamente los datos del mensaje. Si un dato no está, omite la frase.',
              'No inventes NIT, teléfonos, direcciones, plazos ni precios.',
              'No escribas {{ ni la palabra undefined.',
              PEDIDO[clave],
            ].join(' '),
          },
          { role: 'user', content: JSON.stringify({ documento: clave, datos }) },
        ],
        text: { format: zodTextFormat(Salida, 'documento_legal') },
      },
      { signal: controlador.signal },
    );
    return r.output_parsed?.html ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function generarDocumentoLegal(orgId: number, clave: ClaveLegal, opts: OpcionesGenerar): Promise<DocumentoGenerado> {
  const { datos, giro, incluyeEnvios: envios } = await cargarDatosLegales(opts.supabase, orgId, opts.branchId ?? null, opts.ahora);
  const base = plantillaLegal(clave, datos);
  const cobrar = opts.cobrar === true && opts.modo === 'ia';
  let htmlIa: string | null = null;

  const puedeIa = Boolean(opts.pedirIa) || Boolean(process.env.OPENAI_API_KEY);
  if (puedeIa) {
    if (cobrar) {
      const saldo = await ensureAiSettings(orgId, opts.supabase).catch(() => null);
      if (!saldo || saldo.credits_remaining < CREDITOS_LEGAL) {
        htmlIa = null;
      } else {
        htmlIa = opts.pedirIa ? await opts.pedirIa(datos, clave).catch(() => null) : await pedirConModelo(opts.supabase, orgId, datos, clave);
      }
    } else {
      htmlIa = opts.pedirIa ? await opts.pedirIa(datos, clave).catch(() => null) : await pedirConModelo(opts.supabase, orgId, datos, clave);
    }
  }

  const resultado = elegirDocumento(clave, datos, htmlIa);
  if (cobrar && resultado.origen === 'ia') {
    const ajustes = await loadOrgModelSettings(opts.supabase, orgId);
    const { model } = resolveModel('cheap', ajustes);
    try {
      await chargeAiCredits({
        orgId,
        actionType: ACCION_IA_LEGAL,
        model,
        units: 1000,
        credits: CREDITOS_LEGAL,
        userId: opts.userId,
        metadata: { origen: 'sitio-web/legales', clave },
      });
    } catch (error) {
      if (!(error instanceof InsufficientCreditsError)) throw error;
      return { ...base, datos, giro, incluyeEnvios: envios };
    }
  }
  return { ...resultado, datos, giro, incluyeEnvios: envios };
}

async function pedirConModelo(supabase: SupabaseClient, orgId: number, datos: DatosLegales, clave: ClaveLegal): Promise<string | null> {
  if (!process.env.OPENAI_API_KEY) return null;
  try {
    const ajustes = await loadOrgModelSettings(supabase, orgId);
    const { model } = resolveModel('cheap', ajustes);
    return await pedirOpenAi(datos, clave, model);
  } catch {
    return null;
  }
}
