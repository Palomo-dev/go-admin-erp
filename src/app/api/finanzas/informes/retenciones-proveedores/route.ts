import { NextResponse } from 'next/server';
import { withOrg, readOrgBody, OrgContextError } from '@/lib/utils/orgContext';
import { exigirLecturaInformes } from '@/lib/finanzas/informes/acceso.server';
import { leerFiltrosInforme } from '@/lib/finanzas/informes/filtros';
import { fechaAnoAnterior } from '@/lib/finanzas/informes/estados';
import { errorDeExpedicion } from '@/lib/services/compras/certificadoRetenciones.server';
import { resolveOrgCurrency, monedaDelPais } from '@/lib/services/monedaOrganizacion';
import type { DocumentoInforme, TablaInforme } from '@/components/finanzas/contabilidad/informes/catalogo';

export const dynamic = 'force-dynamic';

/** El certificado y sus exportaciones comparten la RPC canónica de #265. */
export const GET = withOrg(async (ctx, request) => {
  const query = new URL(request.url).searchParams;
  readOrgBody(ctx, query);
  await exigirLecturaInformes(ctx);
  const lectura = leerFiltrosInforme(query);
  if (!lectura.datos) return NextResponse.json({ error: lectura.error }, { status: 400 });
  const filtros = lectura.datos;
  if (filtros.branch_id) {
    const sucursal = await ctx.supabase.from('branches').select('id').eq('organization_id', ctx.organizationId).eq('id', filtros.branch_id).maybeSingle();
    if (sucursal.error || !sucursal.data) throw new OrgContextError('Sucursal no encontrada', 404, 'BRANCH_NOT_FOUND');
    const permiso = await ctx.supabase.rpc('app_branch_access', { p_branch_id: filtros.branch_id });
    if (permiso.error || permiso.data !== true) throw new OrgContextError('Sucursal sin acceso', 403, 'BRANCH_FORBIDDEN');
  }
  const centros: { id: string; code: string; name: string }[] = [];
  for (let offset = 0; ; offset += 1000) {
    let consulta = ctx.supabase.from('cost_centers').select('id,code,name').eq('organization_id', ctx.organizationId);
    if (filtros.branch_id) consulta = consulta.or(`branch_id.is.null,branch_id.eq.${filtros.branch_id}`);
    const { data, error } = await consulta.order('id').range(offset, offset + 999);
    if (error) throw error;
    centros.push(...(data ?? []));
    if ((data?.length ?? 0) < 1000) break;
  }
  const proveedor = query.get('supplier_id');
  if (!proveedor) return NextResponse.json({ centros }, { headers: { 'Cache-Control': 'private, no-store' } });
  if (!/^[1-9]\d*$/.test(proveedor) || !Number.isSafeInteger(Number(proveedor))) return NextResponse.json({ error: 'Proveedor inválido' }, { status: 400 });
  const moneda = await resolveOrgCurrency(ctx.supabase, ctx.organizationId);
  if (moneda.code !== monedaDelPais('CO')) return NextResponse.json({ error: 'El certificado tributario requiere una base verificable en pesos colombianos. No se convirtieron importes con una tasa actual.' }, { status: 422 });
  const periodos = [{ desde: filtros.desde, hasta: filtros.hasta }, { desde: fechaAnoAnterior(filtros.desde), hasta: fechaAnoAnterior(filtros.hasta) }];
  const tablas: TablaInforme[] = [];
  const avisos: string[] = [];
  for (const [indice, periodo] of periodos.entries()) {
    const { data, error } = await ctx.supabase.rpc('fn_certificado_retenciones_proveedor', {
      p_organization_id: ctx.organizationId, p_supplier_id: Number(proveedor), p_desde: periodo.desde, p_hasta: periodo.hasta,
      p_filtros: { contabilizados: true, branch_id: filtros.branch_id ?? null, cost_center_id: filtros.cost_center_id ?? null },
    });
    if (error) throw errorDeExpedicion(error);
    const crudo = data as { conceptos?: Record<string, unknown>[]; avisos?: string[] } | null;
    avisos.push(...(crudo?.avisos ?? []).map((aviso) => `${indice === 0 ? 'Actual' : 'Comparativo'}: ${aviso}`));
    const filas = (crudo?.conceptos ?? []).map((fila) => {
      if ([fila.base, fila.valor, fila.tarifa].some((valor) => valor == null || valor === '')) throw new Error('La retención contiene un importe no verificable.');
      const base = Number(fila.base), valor = Number(fila.valor), tarifa = Number(fila.tarifa);
      if (![base, valor, tarifa].every(Number.isFinite)) throw new Error('La retención contiene un importe no verificable.');
      return { clase: String(fila.clase ?? ''), concepto: String(fila.concepto ?? ''), cuenta: String(fila.cuenta ?? ''), tarifa, base, valor };
    });
    tablas.push({
      titulo: `${indice === 0 ? 'Periodo actual' : 'Mismo periodo del año anterior'} · ${periodo.desde} a ${periodo.hasta}`,
      columnas: [{ clave: 'clase', titulo: 'Retención' }, { clave: 'concepto', titulo: 'Concepto' }, { clave: 'cuenta', titulo: 'Cuenta' }, { clave: 'tarifa', titulo: 'Tarifa (%)', formato: 'numero' }, { clave: 'base', titulo: 'Base', formato: 'pesos' }, { clave: 'valor', titulo: 'Retenido', formato: 'pesos' }],
      filas,
    });
  }
  const documento: DocumentoInforme = { titulo: 'Retenciones a proveedores · Borrador', textos: [`Entidad: ${ctx.organizationName}`], tablas, avisos: ['Solo retenciones vinculadas a asientos contabilizados al corte, sin borradores ni anulados. El contador debe revisar el borrador antes de expedir.', ...avisos] };
  return NextResponse.json({ centros, documento, organizacion: { nombre: ctx.organizationName } }, { headers: { 'Cache-Control': 'private, no-store' } });
});
