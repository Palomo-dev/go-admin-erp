/**
 * GET /api/documentos/[tipo]/[id]?formato=pdf|html&papel=carta|a4|80mm&idioma=es|en|fr|pt
 *
 * Ruta ÚNICA de documentos imprimibles (motor en `src/lib/documents`):
 * factura de venta, nota crédito, cotización, factura de compra, documento
 * soporte, estado de cuenta de cliente, recibo de caja, comprobante de
 * egreso, cierre y arqueo de caja, cierre de periodo y reporte del catálogo.
 *
 * Seguridad:
 * - Sesión y organización activa con `getServerOrgContext`; una organización
 *   distinta en la query → 403 `FOREIGN_ORGANIZATION` y registro.
 * - Permiso por tipo resuelto en el servidor (`finance.view`, `pos.view`…;
 *   cajas: quien la abrió, administración o finanzas) → 403.
 * - El documento se lee de la base con el cliente de la sesión (RLS) y con la
 *   organización de la sesión; de otra organización, inexistente o id mal
 *   formado → 404 (sin distinguir). Es GET: no hay cuerpo que pueda mandar.
 * - HTML con todos los textos escapados y CSP estricta (sin red, script solo
 *   con nonce para `imprimir=1`); PDF sin ninguna petición de red al renderizar.
 * - `Cache-Control: private, no-store`: nada queda en cachés compartidas.
 * - Sin navegador para el PDF → 503 `PDF_NO_DISPONIBLE` (el cliente cae al
 *   HTML imprimible).
 *
 * Parámetros de presentación (no cambian el contenido): `formato`, `papel`,
 * `idioma`, `descargar=1` (adjunto en vez de en línea), `imprimir=1` (HTML que
 * abre el diálogo de impresión) y, en los estados de cuenta y el certificado
 * de retenciones, `desde`/`hasta` (días `YYYY-MM-DD`). El documento `reporte`
 * lee además `periodo`, `sucursal`, `hi`, `hf`, `vista` y `comparar` (filtros del visor,
 * validados contra el plan y el alcance de sucursal de la sesión).
 */

import { randomBytes } from 'crypto';
import { getServerOrgContext, readOrgBody, type ServerOrgContext } from '@/lib/utils/orgContext';
import { routeErrorResponse } from '@/lib/security/orgGuards';
import { nombreArchivoSeguro } from '@/lib/documents/escape';
import { armarDocumento } from '@/lib/documents/server/motor';
import { ErrorPdfNoDisponible, generarPdf } from '@/lib/documents/server/pdf';
import { cargarTextos } from '@/lib/documents/textos';
import { OrgContextError } from '@/lib/utils/orgContextError';
import {
  esFormatoDocumento,
  esIdiomaDocumento,
  esPapelDocumento,
  esTipoDocumento,
  type IdiomaDocumento,
} from '@/lib/documents/tipos';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const RUTA = 'GET /api/documentos/[tipo]/[id]';
/** Filtros del documento `reporte`; el cargador los valida. */
const PARAMETROS_REPORTE = ['periodo', 'sucursal', 'hi', 'hf', 'vista', 'comparar'] as const;

function json(status: number, cuerpo: Record<string, unknown>): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
  });
}

/**
 * Errores que el usuario puede ver (la pantalla de caja muestra el mensaje):
 * se responden en su idioma desde `documentos.errores`. El código no cambia.
 */
const CLAVE_ERROR: Record<string, string> = {
  NOT_FOUND: 'noEncontrado',
  PERMISSION_REQUIRED: 'sinPermiso',
  PAPEL_NO_DISPONIBLE: 'papelNoDisponible',
  PDF_NO_DISPONIBLE: 'pdfNoDisponible',
};

async function mensajeError(idioma: IdiomaDocumento, codigo: string, respaldo: string): Promise<string> {
  const clave = CLAVE_ERROR[codigo];
  if (!clave) return respaldo;
  try {
    const t = await cargarTextos(idioma);
    const texto = t(`errores.${clave}`);
    return texto === `errores.${clave}` ? respaldo : texto;
  } catch {
    return respaldo;
  }
}

async function idiomaDelUsuario(pedido: string | null, ctx: ServerOrgContext): Promise<IdiomaDocumento> {
  if (esIdiomaDocumento(pedido)) return pedido;
  try {
    const { data } = await ctx.supabase.from('profiles').select('preferred_language').eq('id', ctx.userId).maybeSingle();
    const preferido = String((data as { preferred_language?: string | null } | null)?.preferred_language ?? '').slice(0, 2).toLowerCase();
    if (esIdiomaDocumento(preferido)) return preferido;
  } catch {
    // Sin perfil legible: español.
  }
  return 'es';
}

export async function GET(request: Request, { params }: { params: Promise<{ tipo: string; id: string }> }): Promise<Response> {
  let idioma: IdiomaDocumento | null = null;
  try {
    const ctx = await getServerOrgContext(request);
    readOrgBody(ctx, {}, { request, route: RUTA });

    const { tipo, id } = await params;
    if (!esTipoDocumento(tipo)) return json(404, { error: 'Tipo de documento desconocido', code: 'NOT_FOUND' });

    const url = new URL(request.url);
    const formato = url.searchParams.get('formato') ?? 'pdf';
    const papel = url.searchParams.get('papel') ?? 'carta';
    if (!esFormatoDocumento(formato)) return json(400, { error: 'Formato no soportado', code: 'FORMATO_INVALIDO' });
    if (!esPapelDocumento(papel)) return json(400, { error: 'Papel no soportado', code: 'PAPEL_INVALIDO' });
    idioma = await idiomaDelUsuario(url.searchParams.get('idioma'), ctx);
    const imprimir = formato === 'html' && url.searchParams.get('imprimir') === '1';
    const nonce = randomBytes(16).toString('base64');

    const { payload, html } = await armarDocumento(ctx, {
      tipo,
      id: String(id ?? ''),
      papel,
      idioma,
      imprimir,
      nonce,
      desde: url.searchParams.get('desde'),
      hasta: url.searchParams.get('hasta'),
      parametros: Object.fromEntries(PARAMETROS_REPORTE.map((k) => [k, url.searchParams.get(k)])),
    });
    const nombre = nombreArchivoSeguro(payload.nombreArchivo);

    if (formato === 'html') {
      return new Response(html, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'private, no-store',
          'Content-Security-Policy': `default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'`,
          'X-Content-Type-Options': 'nosniff',
          'Referrer-Policy': 'no-referrer',
        },
      });
    }

    const pdf = await generarPdf(html, papel);
    const disposicion = url.searchParams.get('descargar') === '1' ? 'attachment' : 'inline';
    return new Response(Buffer.from(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${disposicion}; filename="${nombre}.pdf"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (err) {
    if (err instanceof ErrorPdfNoDisponible) {
      console.error('[documentos] PDF no disponible', { motivo: err.message });
      const error = await mensajeError(idioma ?? 'es', 'PDF_NO_DISPONIBLE', 'La generación de PDF no está disponible en este momento');
      return json(503, { error, code: 'PDF_NO_DISPONIBLE' });
    }
    if (idioma && err instanceof OrgContextError && CLAVE_ERROR[err.code]) {
      return json(err.statusCode, { error: await mensajeError(idioma, err.code, err.message), code: err.code });
    }
    return routeErrorResponse('documentos', err);
  }
}
