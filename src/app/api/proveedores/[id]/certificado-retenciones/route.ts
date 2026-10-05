/**
 * POST /api/proveedores/[id]/certificado-retenciones — expide el certificado
 * de retenciones del proveedor para un periodo (serie CR por organización,
 * Figma 09 · 1491:126182). Cuerpo: `{ desde, hasta, sucursalId? }`.
 * Responde `{ certificado: { id, numero, reexpedido } }`; el documento se pide
 * después al motor: `GET /api/documentos/certificado-retenciones/<id>`.
 *
 * - Organización de la sesión (`withOrg`). Una organización ajena en el body
 *   o en la query → 403 y queda registrada (`readOrgBody`).
 * - Permiso `finance.view` resuelto en el servidor: el mismo que abre el
 *   certificado en el motor y que exige la RPC.
 * - Proveedor de otra organización → 404 (no se distingue de «no existe»).
 * - La numeración y la foto las hace una sola RPC transaccional.
 */
import { NextResponse } from 'next/server';
import { withOrg, OrgContextError } from '@/lib/utils/orgContext';
import { expedirCertificadoSchema } from '@/lib/services/compras/contrato';
import { expedirCertificadoRetenciones } from '@/lib/services/compras/certificadoRetenciones.server';
import { SIN_CACHE, exigirDeLaOrg, exigirPermisos, leerCuerpo, respuestaError } from '@/lib/services/compras/rutas.server';

export const dynamic = 'force-dynamic';
const RUTA = 'POST /api/proveedores/[id]/certificado-retenciones';

export const POST = withOrg(async (ctx, req, routeParams) => {
  try {
    const cuerpo = await leerCuerpo(ctx, req, expedirCertificadoSchema, RUTA);
    const p = routeParams ? await routeParams.params : {};
    const crudo = Array.isArray(p.id) ? p.id[0] : p.id;
    const proveedorId = Number.parseInt(String(crudo ?? ''), 10);
    if (!Number.isInteger(proveedorId) || proveedorId <= 0 || String(proveedorId) !== String(crudo)) {
      throw new OrgContextError('No encontrado', 404, 'no_encontrado');
    }
    await exigirPermisos(ctx, ['finance.view'], RUTA);
    await exigirDeLaOrg(ctx, 'suppliers', proveedorId);
    const certificado = await expedirCertificadoRetenciones(ctx, {
      proveedorId,
      desde: cuerpo.desde,
      hasta: cuerpo.hasta,
      sucursalId: cuerpo.sucursalId ?? null,
    });
    return NextResponse.json({ certificado }, { status: certificado.reexpedido ? 200 : 201, headers: SIN_CACHE });
  } catch (err) {
    return respuestaError(RUTA, err);
  }
});
