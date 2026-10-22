/**
 * POST /api/sitio-web/legales/generar
 * { clave, sitio, version, accion: 'vista' | 'aplicar', confirmar?, texto?, origen? }
 *
 * vista: datos que usará el texto y los que faltan. No escribe ni cobra.
 * aplicar: el mismo generador. Crea la página con texto o llena una vacía.
 * Si el texto fue editado y no viene confirmar, responde 409 con el diff.
 * Confirmar guarda una instantánea y reemplaza. Cobra 1 crédito solo si el
 * origen es IA y la persona lo pidió desde aquí.
 */
import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { aplicarAlBorrador } from '@/lib/services/website/paginasSitioService';
import { crearInstantanea } from '@/lib/services/website/editorSitioService';
import { listarSitios, obtenerBorrador } from '@/lib/services/website/siteDocumentService';
import { manejarError, respuestaError } from '@/lib/website/v2/respuestasApi';
import { DOCUMENTOS_LEGALES, type ClaveLegal } from '@/lib/website/configuracionSitio';
import { sitioDeCuerpo, versionDeCuerpo } from '@/components/sitio-web/paginas/parametrosPaginas';
import { aplicarHtml, fueEditado, vistaDeDatos } from '@/lib/website/legales/plantillasLegales';
import { cargarDatosLegales, CREDITOS_LEGAL, generarDocumentoLegal, ACCION_IA_LEGAL } from '@/lib/website/legales/generarDocumentoLegal';
import { chargeAiCredits } from '@/lib/services/crm/aiCostService';
import { ensureAiSettings } from '@/lib/services/aiCreditsService';
import { loadOrgModelSettings, resolveModel } from '@/lib/ai/agent/modelRouter';
import {
  ajustarMenusLegales,
  colocarDocumentoLegal,
  diffPlano,
  htmlDePagina,
  paginaPorClave,
} from '@/lib/website/legales/documentoLegal';

export const dynamic = 'force-dynamic';

function esClave(valor: unknown): valor is ClaveLegal {
  return DOCUMENTOS_LEGALES.some((d) => d.clave === valor);
}

export const POST = withOrg(async (ctx, request) => {
  try {
    const body = (await readOrgBody(ctx, request, { route: 'sitio-web/legales/generar' })) as Record<string, unknown>;
    if (!esClave(body.clave)) return respuestaError('peticion_invalida', 'La clave del documento legal no es válida.');
    const clave = body.clave;
    const sitio = sitioDeCuerpo(body.sitio);
    if (sitio === 'invalido') return respuestaError('peticion_invalida', 'El sitio no es válido.');

    if (body.accion === 'vista') {
      const { datos } = await cargarDatosLegales(ctx.supabase, ctx.organizationId, sitio);
      const vista = vistaDeDatos(datos);
      return NextResponse.json({
        ...vista,
        origenPrevisto: process.env.OPENAI_API_KEY ? 'ia' : 'plantilla',
      });
    }
    if (body.accion !== 'aplicar') return respuestaError('peticion_invalida', 'Se esperaba { accion: "vista" | "aplicar" }.');
    const version = versionDeCuerpo(body.version);
    if (version === 'invalido') return respuestaError('peticion_invalida', 'Falta la versión del borrador.');
    const confirmar = body.confirmar === true;
    const texto = typeof body.texto === 'string' ? body.texto : null;
    const origenCliente = body.origen === 'ia' || body.origen === 'plantilla' ? body.origen : null;

    const saldo = await ensureAiSettings(ctx.organizationId, ctx.supabase).catch(() => null);
    const puedeIa = Boolean(process.env.OPENAI_API_KEY) && !!saldo && saldo.credits_remaining >= CREDITOS_LEGAL;
    const generado =
      confirmar && texto && origenCliente
        ? await (async () => {
            const cargado = await cargarDatosLegales(ctx.supabase, ctx.organizationId, sitio);
            return { ...aplicarHtml(clave, cargado.datos, texto, origenCliente), ...cargado };
          })()
        : await generarDocumentoLegal(ctx.organizationId, clave, {
            modo: 'ia',
            cobrar: false,
            supabase: ctx.supabase,
            branchId: sitio,
            userId: ctx.userId,
            pedirIa: puedeIa ? undefined : async () => null,
          });

    const sitios = await listarSitios(ctx.supabase, ctx.organizationId);
    const estado = sitios.find((s) => s.branchId === sitio);
    if (estado) {
      const borrador = await obtenerBorrador(ctx.supabase, ctx.organizationId, estado.id);
      const pagina = paginaPorClave(borrador.documento.paginas, clave);
      const bloque = pagina?.secciones.find((s) => s.tipo === 'text_block');
      if (pagina && fueEditado(bloque?.contenido) && !confirmar) {
        const actual = htmlDePagina(pagina);
        return NextResponse.json(
          {
            error: {
              code: 'requiere_confirmacion',
              message: 'El texto fue editado. Confirma si quieres reemplazarlo.',
              details: {
                actual,
                propuesto: generado.body,
                origen: generado.origen,
                faltantes: generado.faltantes,
                diff: diffPlano(actual, generado.body),
              },
            },
          },
          { status: 409 },
        );
      }
      if (confirmar && pagina && fueEditado(bloque?.contenido)) {
        await crearInstantanea(ctx.supabase, ctx.organizationId, estado.id, {
          documento: borrador.documento,
          version: borrador.version,
          motivo: 'antes_de_restaurar',
        });
      }
    }

    const ahora = new Date().toISOString();
    const resultado = await aplicarAlBorrador(ctx, sitio, version, (documento) => {
      const puesto = colocarDocumentoLegal(documento, clave, generado, ahora, randomUUID, { forzar: confirmar });
      if (puesto.accion === 'omitida' && puesto.editado) {
        return { ok: true, documento, paginaId: puesto.paginaId ?? undefined };
      }
      const menu = ajustarMenusLegales(puesto.documento, randomUUID);
      return { ok: true, documento: menu.documento, paginaId: puesto.paginaId ?? undefined };
    });

    if (generado.origen === 'ia' && puedeIa) {
      const ajustes = await loadOrgModelSettings(ctx.supabase, ctx.organizationId);
      const { model } = resolveModel('cheap', ajustes);
      await chargeAiCredits({
        orgId: ctx.organizationId,
        actionType: ACCION_IA_LEGAL,
        model,
        units: 1000,
        credits: CREDITOS_LEGAL,
        userId: ctx.userId,
        metadata: { origen: 'sitio-web/legales', clave },
      });
    }

    return NextResponse.json({ ...resultado, origen: generado.origen, faltantes: generado.faltantes });
  } catch (error) {
    return manejarError(error, 'POST sitio-web/legales/generar');
  }
});
