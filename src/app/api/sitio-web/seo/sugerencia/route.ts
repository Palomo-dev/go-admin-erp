/**
 * POST /api/sitio-web/seo/sugerencia — «Sugerir con IA» de SEO y redes (Figma
 * B/08-01, nota-ux 2: «usa créditos (chargeAiCredits) solo al aceptar»).
 *
 * { accion: 'generar' } → comprueba el saldo ANTES de llamar al proveedor y
 *     devuelve una propuesta de título (≤ 60) y descripción (≤ 160). No cobra.
 * { accion: 'aceptar', modelo } → cobra 1 crédito con `chargeAiCredits` (el
 *     punto único de cobro) cuando la persona aplica la propuesta. Una
 *     generación fallida o descartada nunca se cobra.
 *
 * Modelo: `ai_settings` de la organización → variable de entorno → default
 * (`resolveModel('cheap')` del núcleo compartido; nada cableado aquí).
 * Datos del prompt: nombre, giro y categorías de la organización de la SESIÓN.
 * Permiso: `website.sites.edit` (fn_website_tiene_permiso).
 */
import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod';
import { withOrg, readOrgBody, OrgContextError } from '@/lib/utils/orgContext';
import { permisosSitio } from '@/lib/services/website/paginasSitioService';
import { chargeAiCredits, InsufficientCreditsError } from '@/lib/services/crm/aiCostService';
import { ensureAiSettings } from '@/lib/services/aiCreditsService';
import { loadOrgModelSettings, resolveModel } from '@/lib/ai/agent/modelRouter';
import { giroDesdeTipo } from '@/lib/website/onboardingSitio';
import { ErrorSeo, respuestaErrorSeo } from '@/components/sitio-web/seoanalitica/seo.server';
import { LIMITE_DESCRIPCION, LIMITE_TITULO } from '@/components/sitio-web/seoanalitica/seoLogica';

export const dynamic = 'force-dynamic';

const CREDITOS_SUGERENCIA = 1;
const ACCION_IA = 'website_seo_suggestion';

const Propuesta = z.object({
  titulo: z.string().max(80),
  descripcion: z.string().max(200),
});

const SISTEMA = [
  'Eres redactor SEO para pequeños negocios de Colombia.',
  `Escribe un título de máximo ${LIMITE_TITULO} caracteres y una descripción de entre 110 y ${LIMITE_DESCRIPCION} caracteres para la página de inicio.`,
  'Español de Colombia, tuteo, voz activa, sin emojis, sin signos de admiración, sin cifras ni promesas que no estén en los datos.',
  'El título empieza por el nombre del negocio. La descripción dice qué ofrece y cómo se compra o reserva.',
].join(' ');

function recortar(texto: string, max: number): string {
  const t = Array.from(texto.trim());
  return t.length <= max ? t.join('') : t.slice(0, max).join('').replace(/\s+\S*$/, '');
}

export const POST = withOrg(async (ctx, request) => {
  try {
    const body = (await readOrgBody(ctx, request, { route: 'sitio-web/seo/sugerencia' })) as { accion?: unknown; modelo?: unknown } | null;
    const permisos = await permisosSitio(ctx);
    if (!permisos.editar) throw new ErrorSeo('sin_permiso', 403, 'No tienes permiso para editar el SEO.');
    const ajustesModelo = await loadOrgModelSettings(ctx.supabase, ctx.organizationId);
    const { model } = resolveModel('cheap', ajustesModelo);

    if (body?.accion === 'aceptar') {
      if (body.modelo !== model) throw new ErrorSeo('peticion_invalida', 400, 'La propuesta ya no es válida. Genera otra.');
      const cobro = await chargeAiCredits({
        orgId: ctx.organizationId,
        actionType: ACCION_IA,
        model,
        units: 1000,
        credits: CREDITOS_SUGERENCIA,
        userId: ctx.userId,
        metadata: { origen: 'sitio-web/seo' },
      });
      return NextResponse.json({ cobrado: cobro.credits });
    }
    if (body?.accion !== 'generar') throw new ErrorSeo('peticion_invalida', 400, 'Se esperaba { accion: "generar" | "aceptar" }.');

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: 'La IA no está disponible.', codigo: 'ia_no_disponible' }, { status: 503 });
    }
    // Saldo ANTES de llamar al proveedor (el cobro va después, al aceptar).
    const saldo = await ensureAiSettings(ctx.organizationId, ctx.supabase).catch(() => null);
    if (!saldo || saldo.credits_remaining < CREDITOS_SUGERENCIA) {
      return NextResponse.json({ error: 'No tienes créditos de IA.', codigo: 'sin_creditos' }, { status: 402 });
    }

    const [orgRes, catRes] = await Promise.all([
      ctx.supabase.from('organizations').select('name, type_id').eq('id', ctx.organizationId).maybeSingle(),
      ctx.supabase.from('categories').select('name').eq('organization_id', ctx.organizationId).order('name').limit(12),
    ]);
    const org = orgRes.data as { name: string | null; type_id: number | null } | null;
    const datos = {
      negocio: org?.name ?? '',
      giro: giroDesdeTipo(org?.type_id ?? null),
      categorias: ((catRes.data ?? []) as { name: string }[]).map((c) => c.name).filter(Boolean),
      pais: 'Colombia',
    };

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const r = await openai.responses.parse({
      model,
      store: false,
      input: [
        { role: 'system', content: SISTEMA },
        { role: 'user', content: JSON.stringify(datos) },
      ],
      text: { format: zodTextFormat(Propuesta, 'seo_sitio') },
    });
    const p = r.output_parsed;
    if (!p) return NextResponse.json({ error: 'La IA no devolvió una propuesta.', codigo: 'ia_vacia' }, { status: 422 });
    return NextResponse.json({
      titulo: recortar(p.titulo, LIMITE_TITULO),
      descripcion: recortar(p.descripcion, LIMITE_DESCRIPCION),
      modelo: model,
      creditos: CREDITOS_SUGERENCIA,
    });
  } catch (error) {
    if (error instanceof OrgContextError) throw error;
    if (error instanceof InsufficientCreditsError) {
      return NextResponse.json({ error: 'No tienes créditos de IA.', codigo: 'sin_creditos' }, { status: 402 });
    }
    return respuestaErrorSeo(error, 'sitio-web/seo/sugerencia', ctx.organizationId);
  }
});
