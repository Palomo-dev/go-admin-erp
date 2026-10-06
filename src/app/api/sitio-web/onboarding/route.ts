/**
 * Avance del asistente de creación del sitio (Figma A/03a-03j) en
 * `website_site_states.onboarding` del sitio principal.
 *
 * GET   → { onboarding, sitioId, contexto }: lo guardado (leído sin confiar en su
 *         forma) y lo que el asistente toma del ERP para no pedirlo dos veces:
 *         organización (nombre, logo, giro), sede principal (dirección, teléfono,
 *         horario), WhatsApp del sitio, dirección real, pasarela y permisos.
 * PATCH { giro?, objetivos?, pasoActual?, pasos?, completado? } → { onboarding, sitioId }
 *
 * La organización sale de la sesión (`withOrg`); una organización en el body o
 * la query → 403 y registro (`readOrgBody`). Escribir exige
 * `website.sites.edit` (`fn_website_tiene_permiso`, el mismo criterio que la
 * RLS de update y el grant por columna de `website_site_states`). Si el sitio
 * aún no existe se crea con `crearSitio` (idempotente; importa el legacy y no
 * cambia la web pública).
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody, OrgContextError } from '@/lib/utils/orgContext';
import { crearSitio, ErrorSitio, errorDesdePostgrest } from '@/lib/services/website/siteDocumentService';
import { permisosSitio } from '@/lib/services/website/paginasSitioService';
import { aplicarParcheOnboarding, giroDesdeTipo, leerOnboarding } from '@/lib/website/onboardingSitio';
import { direccionSitio, tienePasarela } from '@/lib/website/resumenSitio';
import type { ContextoAsistente } from '@/lib/website/contextoAsistente';
import { manejarError, respuestaError } from '@/lib/website/v2/respuestasApi';

export const dynamic = 'force-dynamic';

const SIN_CACHE = { 'Cache-Control': 'private, no-store' } as const;

/** Errores de PostgREST (objeto con `code`) → código de la API (42501 → 403). */
function normalizar(error: unknown): unknown {
  if (error instanceof ErrorSitio || error instanceof OrgContextError || error instanceof Error) return error;
  const e = error as { code?: string; message?: string } | null;
  return e && typeof e.code === 'string' ? errorDesdePostgrest(e, 'sitio-web/onboarding') : error;
}

type Ctx = Parameters<Parameters<typeof withOrg>[0]>[0];

async function estadoPrincipal(ctx: Ctx) {
  const { data, error } = await ctx.supabase
    .from('website_site_states')
    .select('id, onboarding, primary_domain_id')
    .eq('organization_id', ctx.organizationId)
    .is('branch_id', null)
    .maybeSingle();
  if (error) throw error;
  return data as { id: string; onboarding: unknown; primary_domain_id: string | null } | null;
}

/** Lo que el asistente toma del ERP (solo lectura, cliente de la sesión y RLS). */
async function leerContexto(ctx: Ctx, primaryDomainId: string | null): Promise<ContextoAsistente> {
  const org = ctx.organizationId;
  const db = ctx.supabase;
  const [o, sede, ajustes, dominios, pagos, permisos] = await Promise.all([
    db.from('organizations').select('name, logo_url, type_id, subdomain').eq('id', org).maybeSingle(),
    db
      .from('branches')
      .select('name, address, city, phone, opening_hours')
      .eq('organization_id', org)
      .eq('is_main', true)
      .limit(1)
      .maybeSingle(),
    db.from('website_settings').select('social_links').eq('organization_id', org).is('branch_id', null).maybeSingle(),
    db.from('organization_domains').select('id, host, domain_type, status, is_primary, is_active').eq('organization_id', org),
    db.from('organization_payment_methods').select('integration_connection_id, show_on_website, is_active').eq('organization_id', org),
    permisosSitio(ctx),
  ]);
  for (const r of [o, sede, ajustes, dominios, pagos]) if (r.error) throw r.error;
  const organizacion = o.data as { name: string; logo_url: string | null; type_id: number | null; subdomain: string | null } | null;
  const s = sede.data as { name: string; address: string | null; city: string | null; phone: string | null; opening_hours: unknown } | null;
  const redes = (ajustes.data as { social_links: Record<string, unknown> | null } | null)?.social_links ?? null;
  const subdominio = organizacion?.subdomain || null;
  return {
    organizacion: {
      nombre: organizacion?.name ?? '',
      logoUrl: organizacion?.logo_url ?? null,
      giro: giroDesdeTipo(organizacion?.type_id),
      subdominio,
    },
    sede: s ? { nombre: s.name, direccion: [s.address, s.city].filter(Boolean).join(', ') || null, telefono: s.phone, horario: s.opening_hours ?? null } : null,
    whatsapp: typeof redes?.whatsapp === 'string' && redes.whatsapp.trim() ? redes.whatsapp.trim() : null,
    direccion: direccionSitio((dominios.data ?? []) as never[], subdominio, primaryDomainId),
    pasarela: tienePasarela((pagos.data ?? []) as never[]),
    permisos,
  };
}

export const GET = withOrg(async (ctx, request) => {
  try {
    await readOrgBody(ctx, request, { route: 'sitio-web/onboarding' });
    const estado = await estadoPrincipal(ctx);
    const contexto = await leerContexto(ctx, estado?.primary_domain_id ?? null);
    return NextResponse.json(
      { onboarding: leerOnboarding(estado?.onboarding), sitioId: estado?.id ?? null, contexto },
      { headers: SIN_CACHE },
    );
  } catch (error) {
    return manejarError(normalizar(error), 'GET sitio-web/onboarding');
  }
});

export const PATCH = withOrg(async (ctx, request) => {
  try {
    const body = (await readOrgBody(ctx, request, { route: 'sitio-web/onboarding' })) as unknown;

    if (!(await permisosSitio(ctx)).editar) return respuestaError('sin_permiso', 'No tienes permiso para configurar el sitio web.');

    let estado = await estadoPrincipal(ctx);
    if (!estado) {
      await crearSitio(ctx.supabase, ctx.organizationId, null);
      estado = await estadoPrincipal(ctx);
      if (!estado) return respuestaError('sitio_no_encontrado', 'No se pudo crear el sitio.');
    }

    const resultado = aplicarParcheOnboarding(leerOnboarding(estado.onboarding), body);
    if (!resultado.ok) return respuestaError('peticion_invalida', 'El avance del asistente no es válido.', resultado.errores);

    const { data, error } = await ctx.supabase
      .from('website_site_states')
      .update({ onboarding: resultado.onboarding })
      .eq('id', estado.id)
      .eq('organization_id', ctx.organizationId)
      .select('id')
      .maybeSingle();
    if (error) throw error;
    // 0 filas con permiso confirmado: la RLS lo negó igual (fail-closed).
    if (!data) return respuestaError('sin_permiso', 'No tienes permiso para configurar el sitio web.');
    return NextResponse.json({ onboarding: resultado.onboarding, sitioId: estado.id }, { headers: SIN_CACHE });
  } catch (error) {
    return manejarError(normalizar(error), 'PATCH sitio-web/onboarding');
  }
});
