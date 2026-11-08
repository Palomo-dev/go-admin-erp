/**
 * Datos fiscales de las líneas de un documento (clasificación de IVA, P3; y en
 * compras y documento soporte, procedencia del descontable, P9).
 *
 * GET  ?tipo=factura_venta|factura_compra|documento_soporte|venta_pos&id=<uuid>
 *      → líneas con su clasificación guardada y la sugerencia actual. `finance.view`.
 * POST { tabla: 'invoice_items'|'sale_items', id, datos } → `fn_iva_clasificar_linea`.
 *      `finance.create` (o administrador) aquí y otra vez en la RPC, que además
 *      comprueba que la línea es de la organización y deja bitácora.
 *
 * Organización de la sesión: una ajena en el cuerpo o la query responde 403 y
 * queda registrada (`readOrgBody`). Cuerpo por lista blanca. No cambia importes.
 */
import { NextResponse } from 'next/server';
import { withOrg, hasOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { PERMISOS_FINANZAS, requireOrgPermission } from '@/lib/security/orgGuards';
import { esUuid, TIPOS_DOCUMENTO_LINEAS, validarClasificacion, type TipoDocumentoLineas } from '@/lib/finanzas/tributario/formulario300';
import { respuestaErrorTributario, SIN_CACHE } from '@/lib/services/tributario/tributario.server';
import { clasificarLinea, leerLineasDocumento } from '@/lib/services/tributario/iva300.server';

export const dynamic = 'force-dynamic';

const RUTA_GET = 'GET /api/finanzas/tributario/iva/lineas';
const RUTA_POST = 'POST /api/finanzas/tributario/iva/lineas';

export const GET = withOrg(async (ctx, req) => {
  try {
    await readOrgBody(ctx, req, { route: RUTA_GET });
    if (!(await hasOrgAdminOrPermission(ctx, PERMISOS_FINANZAS.VER))) {
      return NextResponse.json({ error: 'sin_permiso', codigo: 'sin_permiso' }, { status: 403, headers: SIN_CACHE });
    }
    const params = new URL(req.url).searchParams;
    const tipo = params.get('tipo') as TipoDocumentoLineas;
    const id = params.get('id');
    if (!TIPOS_DOCUMENTO_LINEAS.includes(tipo) || !esUuid(id)) {
      return NextResponse.json({ error: 'datos_invalidos', codigo: 'datos_invalidos' }, { status: 400, headers: SIN_CACHE });
    }
    const [lectura, puedeClasificar] = await Promise.all([leerLineasDocumento(ctx, tipo, id), hasOrgAdminOrPermission(ctx, PERMISOS_FINANZAS.CREAR)]);
    return NextResponse.json({ ...lectura, puedeClasificar }, { headers: SIN_CACHE });
  } catch (err) {
    return respuestaErrorTributario(RUTA_GET, err);
  }
});

export const POST = withOrg(async (ctx, req) => {
  try {
    const cuerpo = (await readOrgBody<Record<string, unknown>>(ctx, req, { route: RUTA_POST })) ?? {};
    await requireOrgPermission(ctx, PERMISOS_FINANZAS.CREAR, RUTA_POST);
    const tabla = cuerpo.tabla;
    const id = cuerpo.id;
    if ((tabla !== 'invoice_items' && tabla !== 'sale_items') || !esUuid(id)) {
      return NextResponse.json({ error: 'datos_invalidos', codigo: 'datos_invalidos' }, { status: 400, headers: SIN_CACHE });
    }
    // La RPC decide si la línea es de compra (y rechaza «descontable» en ventas); aquí solo se valida la forma.
    const v = validarClasificacion(cuerpo.datos, { compra: tabla === 'invoice_items' });
    if (!v.ok) return NextResponse.json({ error: v.error, codigo: v.error }, { status: 400, headers: SIN_CACHE });
    const r = await clasificarLinea(ctx, tabla, id, v.datos);
    return NextResponse.json({ clasificacion: r }, { headers: SIN_CACHE });
  } catch (err) {
    return respuestaErrorTributario(RUTA_POST, err);
  }
});
