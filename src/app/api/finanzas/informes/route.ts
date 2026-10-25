import { NextResponse } from 'next/server';
import { readOrgBody, withOrg } from '@/lib/utils/orgContext';
import { exigirLecturaInformes } from '@/lib/finanzas/informes/acceso.server';
import { leerFiltrosInforme } from '@/lib/finanzas/informes/filtros';
import { documentosEstados, documentosIndicadores } from '@/lib/finanzas/informes/documentosEstados';
import { generarIndicadoresDesdeFuente } from '@/lib/finanzas/informes/indicadoresFuente';
import { cargarFuenteInformes } from '@/lib/services/finanzas/informesFuente.server';
import { documentosLibros } from '@/lib/finanzas/informes/documentosLibros';
import { cargarFuenteTributaria } from '@/lib/services/finanzas/tributariosFuente.server';
import { generarBorradoresTributarios, leerParametrosTributarios } from '@/lib/finanzas/informes/tributarios';
import { fechaAnoAnterior } from '@/lib/finanzas/informes/estados';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, request) => {
  const parametros = new URL(request.url).searchParams;
  readOrgBody(ctx, parametros);
  await exigirLecturaInformes(ctx);
  const lectura = leerFiltrosInforme(parametros);
  if (!lectura.datos) return NextResponse.json({ error: lectura.error }, { status: 400 });
  const filtros = lectura.datos;
  const fuente = await cargarFuenteInformes(ctx.supabase, ctx.organizationId, {
    desde: filtros.desde, hasta: filtros.hasta,
    branchId: filtros.branch_id, costCenterId: filtros.cost_center_id,
  });
  const configuracion = fuente.configuracion;
  const { estados, documentos } = documentosEstados({
    cuentas: fuente.cuentas,
    movimientos: fuente.movimientos,
    desde: filtros.desde, hasta: filtros.hasta,
    grupoNiif: configuracion.grupo_niif,
  }, {
    nivel: filtros.nivel === 'auxiliar' ? 'auxiliar' : Number(filtros.nivel) as 1 | 2 | 4 | 6,
    notas: configuracion.notas,
    certificacion: configuracion.certificacion,
    patrimonioOpcional: configuracion.presenta_cambios_patrimonio,
  });
  Object.assign(documentos, documentosIndicadores(generarIndicadoresDesdeFuente({
    estados, fuente, organizationId: ctx.organizationId,
    costCenterId: filtros.cost_center_id, productId: filtros.product_id,
    monedaBase: fuente.monedaBase,
  })));
  const stock = { movimientos: fuente.stock, completo: fuente.stockCompleto, advertencias: fuente.advertenciasStock };
  Object.assign(documentos, documentosLibros({
    entrada: { cuentas: fuente.cuentas, movimientos: fuente.movimientos, desde: filtros.desde, hasta: filtros.hasta,
      nivel: filtros.nivel === 'auxiliar' ? 99 : Number(filtros.nivel) },
    stock: stock.movimientos, cuenta: filtros.cuenta, productoId: filtros.product_id,
    stockCompleto: stock.completo, advertenciasStock: stock.advertencias,
  }));
  for (const id of ['inventarios-balances', 'kardex-sede']) {
    documentos[id].avisos = [...new Set([...(documentos[id].avisos ?? []), ...stock.advertencias])];
  }
  const parametrosFiscales = leerParametrosTributarios(configuracion.parametros_fiscales);
  const periodos = [
    { desde: filtros.desde, hasta: filtros.hasta },
    { desde: fechaAnoAnterior(filtros.desde), hasta: fechaAnoAnterior(filtros.hasta) },
  ];
  const borradores = await Promise.all(periodos.map(async (periodo) => {
    const datos = await cargarFuenteTributaria(ctx.supabase, ctx.organizationId, {
      ...periodo, branchId: filtros.branch_id, costCenterId: filtros.cost_center_id, monedaBase: fuente.monedaBase,
    }, fuente.movimientos, parametrosFiscales.parametros.anios?.[periodo.hasta.slice(0, 4)]);
    return generarBorradoresTributarios({
      organizationId: ctx.organizationId, monedaBase: fuente.monedaBase, ...periodo,
      movimientos: fuente.movimientos, ...datos,
      parametros: parametrosFiscales.parametros,
      estados: { cuentas: fuente.cuentas, movimientos: fuente.movimientos, ...periodo, grupoNiif: configuracion.grupo_niif },
      pendientesFuente: [...datos.pendientesFuente, ...parametrosFiscales.avisos],
    });
  }));
  for (const [id, actual] of Object.entries(borradores[0])) {
    const anterior = borradores[1][id];
    documentos[id] = {
      ...actual,
      tablas: [...actual.tablas, ...(anterior?.tablas ?? []).map((tabla) => ({ ...tabla, titulo: `${tabla.titulo} · mismo periodo del año anterior` }))],
      avisos: [...new Set([...(actual.avisos ?? []), ...(anterior?.avisos ?? []).map((aviso) => `Comparativo: ${aviso}`)])],
    };
  }
  if (fuente.advertencias.length) {
    for (const documento of Object.values(documentos)) {
      documento.avisos = [...new Set([...(documento.avisos ?? []), ...fuente.advertencias])];
    }
  }
  return NextResponse.json({
    documentos,
    organizacion: fuente.organizacion,
    monedaBase: fuente.monedaBase,
    grupoNiif: configuracion.grupo_niif,
    patrimonioOpcional: configuracion.presenta_cambios_patrimonio,
    centros: fuente.centros,
    cuentas: fuente.cuentas.map(({ account_code, name }) => ({ account_code, name })),
    productos: fuente.productos,
  }, { headers: { 'Cache-Control': 'private, no-store' } });
});
