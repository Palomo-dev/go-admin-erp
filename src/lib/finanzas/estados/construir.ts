/**
 * Arma cada informe a partir de la medición. Las cifras no se recalculan aquí.
 */

import { anioDe, cierreDiciembre, restarAnio } from './fechas';
import { saldo1435, valorizarKardex, valorKardexPorSede } from './kardex';
import { Medicion } from './medir';
import type { ColumnaPatrimonio } from './medir';
import {
  bajo,
  claseDe,
  cuentaDe,
  mapaCuentas,
  negar,
  pesos,
  saldoAcreedor,
  saldoDeudor,
  variacion,
} from './saldos';
import { AVISO_BORRADOR, POLITICAS_DEFECTO, basesDePreparacion, politica, textoCertificacion, textoDictamen } from './textos';
import {
  INFORMES_BORRADOR,
  TITULOS_INFORME,
  type ColumnaInforme,
  type EntradaInforme,
  type FilaInforme,
  type IdInforme,
  type InformeResultado,
  type KpiInforme,
  type LineaIva,
  type Movimiento,
} from './tipos';

const COLS: ColumnaInforme[] = [
  { key: 'concepto', titulo: 'Concepto', tipo: 'texto' },
  { key: 'actual', titulo: 'Periodo', tipo: 'moneda' },
  { key: 'anterior', titulo: 'Año anterior', tipo: 'moneda' },
  { key: 'variacion', titulo: 'Variación $', tipo: 'moneda' },
  { key: 'porcentaje', titulo: 'Variación %', tipo: 'porcentaje' },
];

const PAT = ['31', '32', '33', '34', '35', '36', '37', '38'] as const;

function informe(
  id: IdInforme,
  columnas: ColumnaInforme[],
  filas: FilaInforme[],
  lectura: string[],
  kpis: KpiInforme[] = [],
  diferencia: number | null = null,
  oculto = false,
  motivoOculto: string | null = null,
): InformeResultado {
  return {
    id,
    titulo: TITULOS_INFORME[id],
    borrador: INFORMES_BORRADOR.has(id),
    oculto,
    motivoOculto,
    columnas,
    filas,
    diferencia,
    lectura: INFORMES_BORRADOR.has(id) ? [AVISO_BORRADOR, ...lectura] : lectura,
    kpis,
  };
}

function comp(id: string, concepto: string, actual: number, anterior: number, nivel: number, esTotal = false, cuenta = ''): FilaInforme {
  const delta = variacion(actual, anterior);
  return {
    id,
    concepto,
    cuenta,
    nivel,
    actual,
    anterior,
    variacion: delta.variacion,
    porcentaje: delta.porcentaje,
    esTotal: esTotal ? 1 : 0,
  };
}

function ocultar(id: IdInforme, motivo: string): InformeResultado {
  return informe(id, [], [], [motivo], [], null, true, motivo);
}

export function construirInforme(id: IdInforme, entrada: EntradaInforme): InformeResultado {
  const med = new Medicion(entrada);
  switch (id) {
    case 'situacion-financiera':
      return situacion(med, entrada);
    case 'resultados-integral':
      return resultados(med, entrada);
    case 'cambios-patrimonio':
      return patrimonio(med, entrada);
    case 'flujo-indirecto':
      return flujo(med, entrada);
    case 'notas-estados':
      return notas(med, entrada);
    case 'certificacion-estados':
      return certificacion(med, entrada);
    case 'libro-mayor':
      return libroMayor(med, entrada);
    case 'auxiliar-cuenta':
      return auxiliarCuenta(med, entrada);
    case 'auxiliar-centro':
      return auxiliarCentro(med, entrada);
    case 'inventarios-balances':
      return inventarios(med, entrada);
    case 'conciliacion-inventario':
      return conciliacion(med, entrada);
    case 'kardex':
      return kardexInforme(entrada);
    case 'indicadores':
      return indicadores(med, entrada);
    case 'punto-equilibrio':
      return equilibrio(med, entrada);
    case 'formulario-300':
      return formulario300(med, entrada);
    case 'formulario-350':
      return formulario350(med, entrada);
    case 'ica-municipal':
      return ica(med, entrada);
    case 'reteica':
      return reteica(med, entrada);
    case 'exogena':
      return exogena(med, entrada);
    case 'certificado-220':
      return certificado220(med, entrada);
    case 'certificado-retenciones':
      return certificadoProveedores(med, entrada);
    case 'conciliacion-fiscal':
      return conciliacionFiscal(med, entrada);
    case 'informe-gestion':
      return gestion(med, entrada);
    case 'registro-accionistas':
      return accionistas(entrada);
    case 'pila':
      return pila(entrada);
    default:
      return ocultar(id, 'Este informe no está definido.');
  }
}

export function paqueteEstados(entrada: EntradaInforme): InformeResultado[] {
  const ids: IdInforme[] = ['situacion-financiera', 'resultados-integral'];
  if (entrada.perfil.grupo !== 3 || entrada.perfil.cambiosPatrimonio) ids.push('cambios-patrimonio');
  if (entrada.perfil.grupo !== 3) ids.push('flujo-indirecto');
  ids.push('notas-estados', 'certificacion-estados');
  return ids.map((id) => construirInforme(id, entrada)).filter((i) => !i.oculto);
}

function situacion(med: Medicion, entrada: EntradaInforme): InformeResultado {
  const hoy = med.situacion(entrada.hasta);
  const ayer = med.situacion(restarAnio(entrada.hasta));
  const filas: FilaInforme[] = [
    comp('bs-titulo-corriente', 'Activo corriente', 0, 0, 0, true),
    comp('bs-efectivo', 'Efectivo y equivalentes', hoy.efectivo, ayer.efectivo, 1, false, '11'),
    comp('bs-inv-corto', 'Inversiones de corto plazo', hoy.inversionesCorto, ayer.inversionesCorto, 1, false, '12'),
    comp('bs-deudores', 'Deudores comerciales, neto', hoy.deudores, ayer.deudores, 1, false, '13'),
    comp('bs-inventarios', 'Inventarios, neto', hoy.inventarios, ayer.inventarios, 1, false, '14'),
    comp('bs-otros-corrientes', 'Otros activos corrientes', hoy.otrosCorrientes, ayer.otrosCorrientes, 1, false, '17'),
    comp('bs-total-corriente', 'Total activo corriente', hoy.activoCorriente, ayer.activoCorriente, 0, true),
    comp('bs-titulo-nocorriente', 'Activo no corriente', 0, 0, 0, true),
    comp('bs-ppe', 'Propiedad, planta y equipo, neto', hoy.ppe, ayer.ppe, 1, false, '15'),
    comp('bs-intangibles', 'Intangibles, neto', hoy.intangibles, ayer.intangibles, 1, false, '16'),
    comp('bs-inv-largo', 'Inversiones de largo plazo', hoy.inversionesLargo, ayer.inversionesLargo, 1, false, '12'),
    comp('bs-otros-nocorrientes', 'Otros activos no corrientes', hoy.otrosNoCorrientes, ayer.otrosNoCorrientes, 1),
    comp('bs-total-nocorriente', 'Total activo no corriente', hoy.activoNoCorriente, ayer.activoNoCorriente, 0, true),
    comp('bs-total-activo', 'Total activo', hoy.activo, ayer.activo, 0, true),
    comp('bs-titulo-pcorriente', 'Pasivo corriente', 0, 0, 0, true),
  ];
  const grupos = new Set([...hoy.pasivosCorrientes, ...ayer.pasivosCorrientes].map((l) => l.codigo));
  for (const codigo of [...grupos].sort()) {
    const a = hoy.pasivosCorrientes.find((l) => l.codigo === codigo)?.valor ?? 0;
    const b = ayer.pasivosCorrientes.find((l) => l.codigo === codigo)?.valor ?? 0;
    filas.push(comp(`bs-pc-${codigo}`, `Pasivo ${codigo}`, a, b, 1, false, codigo));
  }
  filas.push(comp('bs-total-pcorriente', 'Total pasivo corriente', hoy.pasivoCorriente, ayer.pasivoCorriente, 0, true));
  filas.push(comp('bs-titulo-pnocorriente', 'Pasivo no corriente', 0, 0, 0, true));
  const largos = new Set([...hoy.pasivosNoCorrientes, ...ayer.pasivosNoCorrientes].map((l) => l.codigo));
  for (const codigo of [...largos].sort()) {
    const a = hoy.pasivosNoCorrientes.find((l) => l.codigo === codigo)?.valor ?? 0;
    const b = ayer.pasivosNoCorrientes.find((l) => l.codigo === codigo)?.valor ?? 0;
    filas.push(comp(`bs-pnc-${codigo}`, `Pasivo ${codigo}`, a, b, 1, false, codigo));
  }
  filas.push(
    comp('bs-total-pnocorriente', 'Total pasivo no corriente', hoy.pasivoNoCorriente, ayer.pasivoNoCorriente, 0, true),
    comp('bs-total-pasivo', 'Total pasivo', hoy.pasivo, ayer.pasivo, 0, true),
  );
  const patrimonios = new Set([...hoy.patrimonioGrupos, ...ayer.patrimonioGrupos].map((l) => l.codigo));
  for (const codigo of [...patrimonios].sort()) {
    const a = hoy.patrimonioGrupos.find((l) => l.codigo === codigo)?.valor ?? 0;
    const b = ayer.patrimonioGrupos.find((l) => l.codigo === codigo)?.valor ?? 0;
    filas.push(comp(`bs-pat-${codigo}`, codigo === 'otros' ? 'Otras cuentas de patrimonio' : `Patrimonio ${codigo}`, a, b, 1, false, codigo));
  }
  if (hoy.resultadoNoCerrado !== 0 || ayer.resultadoNoCerrado !== 0) {
    filas.push(comp('bs-resultado', 'Resultado del ejercicio no cerrado', hoy.resultadoNoCerrado, ayer.resultadoNoCerrado, 1));
  }
  filas.push(comp('bs-total-patrimonio', 'Total patrimonio', hoy.patrimonio, ayer.patrimonio, 0, true));
  filas.push(comp('bs-ecuacion', 'Total pasivo y patrimonio', pesos(hoy.pasivo + hoy.patrimonio), pesos(ayer.pasivo + ayer.patrimonio), 0, true));
  const descuadre = pesos(hoy.activo - (hoy.pasivo + hoy.patrimonio));
  const lectura = [
    descuadre === 0
      ? 'El activo iguala al pasivo más el patrimonio.'
      : `El estado no cuadra: la diferencia es ${descuadre}.`,
  ];
  if (entrada.perfil.grupo === 3) lectura.push('Grupo 3: este estado se presenta sin otro resultado integral.');
  return informe(
    'situacion-financiera',
    [
      { key: 'concepto', titulo: 'Concepto', tipo: 'texto' },
      { key: 'actual', titulo: 'Al corte', tipo: 'moneda' },
      { key: 'anterior', titulo: 'Corte del año anterior', tipo: 'moneda' },
      { key: 'variacion', titulo: 'Variación $', tipo: 'moneda' },
      { key: 'porcentaje', titulo: 'Variación %', tipo: 'porcentaje' },
    ],
    filas.filter((f) => f.esTotal === 1 || f.actual !== 0 || f.anterior !== 0 || String(f.id).startsWith('bs-titulo') || String(f.id).startsWith('bs-total') || f.id === 'bs-ecuacion'),
    lectura,
    [
      { titulo: 'Activo', valor: hoy.activo, formato: 'moneda' },
      { titulo: 'Pasivo', valor: hoy.pasivo, formato: 'moneda' },
      { titulo: 'Patrimonio', valor: hoy.patrimonio, formato: 'moneda' },
    ],
    descuadre,
  );
}

function resultados(med: Medicion, entrada: EntradaInforme): InformeResultado {
  const a = med.resultados(entrada.desde, entrada.hasta);
  const prev = med.rangoAnterior();
  const b = med.resultados(prev.desde, prev.hasta);
  const filas: FilaInforme[] = [
    comp('er-ingresos', 'Ingresos de actividades ordinarias', a.ingresos, b.ingresos, 1, false, '41'),
    comp('er-devoluciones', 'Devoluciones en ventas', a.devoluciones, b.devoluciones, 1, false, '4175'),
    comp('er-ventas', 'Ventas netas', a.ventasNetas, b.ventasNetas, 0, true),
    comp('er-costo', 'Costo de ventas', a.costo, b.costo, 1, false, '6'),
  ];
  if (a.produccion !== 0 || b.produccion !== 0) filas.push(comp('er-produccion', 'Costos de producción', a.produccion, b.produccion, 1, false, '7'));
  filas.push(
    comp('er-bruta', 'Utilidad bruta', a.bruta, b.bruta, 0, true),
    comp('er-admin', 'Gastos de administración', a.administracion, b.administracion, 1, false, '51'),
    comp('er-ventas-gasto', 'Gastos de ventas', a.gastosVentas, b.gastosVentas, 1, false, '52'),
    comp('er-operacional', 'Utilidad operacional', a.operacional, b.operacional, 0, true),
    comp('er-otros-ing', 'Otros ingresos', a.otrosIngresos, b.otrosIngresos, 1, false, '42'),
    comp('er-no-op', 'Gastos no operacionales', a.noOperacionales, b.noOperacionales, 1, false, '53'),
  );
  if (a.otrosGastos !== 0 || b.otrosGastos !== 0) filas.push(comp('er-otros-gas', 'Otros gastos', a.otrosGastos, b.otrosGastos, 1));
  filas.push(
    comp('er-antes', 'Utilidad antes de impuestos', a.antesImpuesto, b.antesImpuesto, 0, true),
    comp('er-impuesto', 'Impuesto de renta', a.impuesto, b.impuesto, 1, false, '54'),
    comp('er-neta', 'Utilidad del ejercicio', a.neta, b.neta, 0, true),
  );
  if (entrada.perfil.grupo !== 3) {
    for (const linea of a.ori) {
      const previa = b.ori.find((o) => o.cuenta === linea.cuenta)?.valor ?? 0;
      filas.push(comp(`ori-${linea.cuenta}`, linea.nombre === linea.cuenta ? `ORI ${linea.cuenta}` : linea.nombre, linea.valor, previa, 1, false, linea.cuenta));
    }
    for (const linea of b.ori) {
      if (a.ori.some((o) => o.cuenta === linea.cuenta)) continue;
      filas.push(comp(`ori-${linea.cuenta}`, linea.nombre, 0, linea.valor, 1, false, linea.cuenta));
    }
    filas.push(comp('er-ori', 'Otro resultado integral', a.oriTotal, b.oriTotal, 0, true, '38'));
    filas.push(comp('er-integral', 'Resultado integral total', a.integral, b.integral, 0, true));
  }
  const lectura = [`La utilidad del ejercicio es ${a.neta}.`];
  if (entrada.perfil.grupo === 3) lectura.push('Grupo 3: no se presenta otro resultado integral.');
  else if (a.ori.length === 0) lectura.push('No hay auxiliares de la 38 marcados como ORI en este periodo.');
  return informe('resultados-integral', COLS, filas, lectura, [
    { titulo: 'Ventas netas', valor: a.ventasNetas, formato: 'moneda' },
    { titulo: 'Utilidad operacional', valor: a.operacional, formato: 'moneda' },
    { titulo: 'Utilidad del ejercicio', valor: a.neta, formato: 'moneda' },
  ]);
}

function patrimonio(med: Medicion, entrada: EntradaInforme): InformeResultado {
  if (entrada.perfil.grupo === 3 && !entrada.perfil.cambiosPatrimonio) {
    return ocultar(
      'cambios-patrimonio',
      'El grupo 3 no está obligado a presentar el estado de cambios en el patrimonio. Se puede activar en la configuración.',
    );
  }
  const actual = med.patrimonio(entrada.desde, entrada.hasta);
  const prev = med.rangoAnterior();
  const anterior = med.patrimonio(prev.desde, prev.hasta);
  const columnas: ColumnaInforme[] = [
    { key: 'concepto', titulo: 'Concepto', tipo: 'texto' },
    ...PAT.map((c) => ({ key: c, titulo: c, tipo: 'moneda' as const })),
    { key: 'total', titulo: 'Total', tipo: 'moneda' },
    { key: 'anterior', titulo: 'Total año anterior', tipo: 'moneda' },
    { key: 'variacion', titulo: 'Variación $', tipo: 'moneda' },
  ];
  const filas: FilaInforme[] = actual.filas.map((fila) => {
    const previa = anterior.filas.find((f) => f.id === fila.id);
    const delta = variacion(fila.total, previa?.total ?? 0);
    const celdas: FilaInforme = {
      id: fila.id,
      concepto: fila.concepto,
      total: fila.total,
      anterior: previa?.total ?? 0,
      variacion: delta.variacion,
      porcentaje: delta.porcentaje,
      esTotal: fila.id === 'pat-final' || fila.id === 'pat-inicial' ? 1 : 0,
      nivel: fila.id === 'pat-final' ? 0 : 1,
    };
    for (const c of PAT) celdas[c] = fila.valores[c as ColumnaPatrimonio];
    return celdas;
  });
  const lectura = [
    actual.diferencia === 0
      ? 'El saldo final iguala al patrimonio del estado de situación financiera.'
      : `El saldo final difiere del patrimonio del balance en ${actual.diferencia}.`,
  ];
  if (entrada.perfil.grupo === 3) lectura.push('Grupo 3: el ORI no se presenta. Los movimientos de la 38 quedan en otros movimientos.');
  return informe('cambios-patrimonio', columnas, filas, lectura, [
    { titulo: 'Patrimonio final', valor: actual.totalFinal, formato: 'moneda' },
  ], actual.diferencia);
}

function flujo(med: Medicion, entrada: EntradaInforme): InformeResultado {
  if (entrada.perfil.grupo === 3) {
    return ocultar(
      'flujo-indirecto',
      'El grupo 3 no presenta el estado de flujos de efectivo. El marco del anexo 3 comprende la situación financiera, el resultado y las notas.',
    );
  }
  const a = med.flujo(entrada.desde, entrada.hasta);
  const prev = med.rangoAnterior();
  const b = med.flujo(prev.desde, prev.hasta);
  const filas = [
    comp('fe-utilidad', 'Utilidad del ejercicio', a.utilidad, b.utilidad, 1),
    comp('fe-dep', 'Depreciación, amortización y deterioro', a.depreciacion, b.depreciacion, 1),
    comp('fe-provisiones', 'Otras provisiones sin salida de caja', a.otrasProvisiones, b.otrasProvisiones, 1),
    comp('fe-util-venta', 'Utilidad en venta de activos', negar(a.utilidadVenta), negar(b.utilidadVenta), 1, false, '4245'),
    comp('fe-perdida', 'Pérdida en venta de activos', a.perdidaVenta, b.perdidaVenta, 1, false, '5310'),
    comp('fe-deudores', 'Variación de deudores, neta', negar(a.variacionDeudores), negar(b.variacionDeudores), 1, false, '13'),
    comp('fe-inventarios', 'Variación de inventarios, neta', negar(a.variacionInventarios), negar(b.variacionInventarios), 1, false, '14'),
    comp('fe-otros-act', 'Variación de otros activos', negar(a.variacionOtrosActivos), negar(b.variacionOtrosActivos), 1, false, '17'),
    comp('fe-pasivos', 'Variación de pasivos de operación', a.variacionPasivos, b.variacionPasivos, 1),
    comp('fe-operacion', 'Efectivo de la operación', a.operacion, b.operacion, 0, true),
    comp('fe-compras', 'Compras de activos', negar(a.comprasActivos), negar(b.comprasActivos), 1),
    comp('fe-ventas-act', 'Recibido por venta de activos', a.ventaActivos, b.ventaActivos, 1),
    comp('fe-inversion', 'Efectivo de inversión', a.inversion, b.inversion, 0, true),
    comp('fe-obligaciones', 'Variación de obligaciones financieras', a.obligaciones, b.obligaciones, 1, false, '21'),
    comp('fe-aportes', 'Aportes', a.aportes, b.aportes, 1),
    comp('fe-dividendos', 'Dividendos pagados', negar(a.dividendosPagados), negar(b.dividendosPagados), 1),
    comp('fe-financiacion', 'Efectivo de financiación', a.financiacion, b.financiacion, 0, true),
    comp('fe-efectivo', 'Aumento del efectivo y equivalentes', a.efectivo, b.efectivo, 0, true, '11'),
  ];
  const lectura = [
    a.diferencia === 0
      ? 'El flujo cuadra con la variación del efectivo y los equivalentes.'
      : `El flujo no cuadra. La diferencia contra el efectivo es ${a.diferencia}.`,
    'La depreciación se toma del crédito de la 1592, la 1598, la 1399 y la 1499, no del gasto 5160 ni 5260.',
  ];
  return informe('flujo-indirecto', COLS, filas, lectura, [
    { titulo: 'Operación', valor: a.operacion, formato: 'moneda' },
    { titulo: 'Inversión', valor: a.inversion, formato: 'moneda' },
    { titulo: 'Financiación', valor: a.financiacion, formato: 'moneda' },
  ], a.diferencia);
}

function notas(med: Medicion, entrada: EntradaInforme): InformeResultado {
  const filas: FilaInforme[] = [
    { id: 'nota-bases', concepto: 'Bases de preparación', detalle: basesDePreparacion(entrada.perfil), actual: null, anterior: null, nivel: 0, esTotal: 1 },
  ];
  for (const politicaDef of POLITICAS_DEFECTO) {
    filas.push({
      id: `nota-${politicaDef.id}`,
      concepto: politicaDef.titulo,
      detalle: politica(entrada.perfil, politicaDef.id, politicaDef.texto),
      actual: null,
      anterior: null,
      nivel: 1,
      esTotal: 0,
    });
  }
  const digitos = entrada.perfil.digitosNota;
  const rubros = [
    ['11', 'Efectivo'],
    ['12', 'Inversiones'],
    ['13', 'Deudores'],
    ['14', 'Inventarios'],
    ['15', 'Propiedad, planta y equipo'],
    ['16', 'Intangibles'],
    ['17', 'Diferidos'],
    ['21', 'Obligaciones financieras'],
    ['22', 'Proveedores'],
    ['23', 'Cuentas por pagar'],
    ['24', 'Impuestos por pagar'],
    ['25', 'Obligaciones laborales'],
    ['26', 'Pasivos estimados'],
    ['27', 'Diferidos pasivos'],
    ['28', 'Otros pasivos'],
    ['31', 'Capital'],
    ['32', 'Superávit de capital'],
    ['33', 'Reservas'],
    ['34', 'Revalorización'],
    ['35', 'Dividendos en acciones'],
    ['36', 'Resultados del ejercicio'],
    ['37', 'Resultados de ejercicios anteriores'],
    ['38', 'Superávit por valorizaciones'],
    ['41', 'Ingresos'],
    ['42', 'Otros ingresos'],
    ['51', 'Gastos de administración'],
    ['52', 'Gastos de ventas'],
    ['53', 'Gastos no operacionales'],
    ['54', 'Impuesto de renta'],
    ['6', 'Costo de ventas'],
  ] as const;
  const mapa = mapaCuentas(entrada.cuentas);
  for (const [prefijo, titulo] of rubros) {
    const detalle = detalleRubro(med, entrada, prefijo, digitos, mapa);
    if (detalle.length === 0) continue;
    filas.push({ id: `nota-rubro-${prefijo}`, concepto: `Nota ${prefijo} — ${titulo}`, detalle: '', actual: null, anterior: null, nivel: 0, esTotal: 1 });
    filas.push(...detalle);
  }
  return informe(
    'notas-estados',
    [
      { key: 'concepto', titulo: 'Nota', tipo: 'texto' },
      { key: 'detalle', titulo: 'Detalle', tipo: 'texto' },
      { key: 'actual', titulo: 'Al corte', tipo: 'moneda' },
      { key: 'anterior', titulo: 'Año anterior', tipo: 'moneda' },
    ],
    filas,
    [`El detalle de cada rubro está a ${digitos} dígitos.`],
  );
}

function detalleRubro(med: Medicion, entrada: EntradaInforme, prefijo: string, digitos: number, mapa: Map<string, { nombre: string }>): FilaInforme[] {
  const codigos = new Set<string>();
  for (const m of med.movs) {
    if (m.cuenta.startsWith(prefijo)) codigos.add(m.cuenta.slice(0, Math.min(digitos, m.cuenta.length)));
  }
  const corteAnt = restarAnio(entrada.hasta);
  const filas: FilaInforme[] = [];
  for (const codigo of [...codigos].sort()) {
    const actual = saldoPresentacion(med.movs, entrada.hasta, codigo);
    const anterior = saldoPresentacion(med.movs, corteAnt, codigo);
    if (actual === 0 && anterior === 0) continue;
    const meta = mapa.get(codigo);
    filas.push({
      id: `nota-det-${codigo}`,
      concepto: `${codigo} ${meta?.nombre && meta.nombre !== codigo ? meta.nombre : ''}`.trim(),
      detalle: '',
      cuenta: codigo,
      actual,
      anterior,
      nivel: 1,
      esTotal: 0,
    });
  }
  return filas;
}

function saldoPresentacion(movs: Movimiento[], hasta: string, prefijo: string): number {
  const clase = claseDe(prefijo);
  const acreedor = clase === '2' || clase === '3' || clase === '4';
  return acreedor
    ? saldoAcreedor(movs, hasta, new Set(), (m) => m.cuenta.startsWith(prefijo))
    : saldoDeudor(movs, hasta, new Set(), (m) => m.cuenta.startsWith(prefijo));
}

function certificacion(med: Medicion, entrada: EntradaInforme): InformeResultado {
  const sit = med.situacion(entrada.hasta);
  const res = med.resultados(entrada.desde, entrada.hasta);
  const perfil = entrada.perfil;
  const filas: FilaInforme[] = [
    { id: 'cert-texto', concepto: 'Certificación', detalle: textoCertificacion(perfil, entrada.desde, entrada.hasta), actual: null, anterior: null, nivel: 0, esTotal: 0 },
    comp('cert-activo', 'Total activo', sit.activo, med.situacion(restarAnio(entrada.hasta)).activo, 1),
    comp('cert-resultado', 'Utilidad del ejercicio', res.neta, med.resultados(med.rangoAnterior().desde, med.rangoAnterior().hasta).neta, 1),
    { id: 'cert-rep', concepto: 'Representante legal', detalle: [perfil.representanteNombre, perfil.representanteDocumento].filter(Boolean).join(' — ') || 'Sin configurar', actual: null, anterior: null, nivel: 1, esTotal: 0 },
    { id: 'cert-contador', concepto: 'Contador', detalle: [perfil.contadorNombre, perfil.contadorCedula && `C.C. ${perfil.contadorCedula}`, perfil.contadorTarjeta && `T.P. ${perfil.contadorTarjeta}`].filter(Boolean).join(' — ') || 'Sin configurar', actual: null, anterior: null, nivel: 1, esTotal: 0 },
  ];
  const lectura = ['Artículo 37 de la Ley 222 de 1995.'];
  if (perfil.incluirDictamen) {
    filas.push({ id: 'cert-dictamen', concepto: 'Dictamen del revisor fiscal', detalle: textoDictamen(perfil), actual: null, anterior: null, nivel: 0, esTotal: 0 });
    lectura.push('Se reserva el dictamen del revisor fiscal, artículo 38 de la Ley 222 de 1995.');
  }
  return informe('certificacion-estados', [
    { key: 'concepto', titulo: 'Concepto', tipo: 'texto' },
    { key: 'detalle', titulo: 'Texto', tipo: 'texto' },
    { key: 'actual', titulo: 'Periodo', tipo: 'moneda' },
    { key: 'anterior', titulo: 'Año anterior', tipo: 'moneda' },
  ], filas, lectura);
}

function libroMayor(med: Medicion, entrada: EntradaInforme): InformeResultado {
  const mapa = mapaCuentas(entrada.cuentas);
  const codigos = new Set<string>([...mapa.keys(), ...med.movs.map((m) => m.cuenta)]);
  const aperturaFecha = restarAnio(entrada.hasta);
  const filas: FilaInforme[] = [];
  let claseActual = '';
  for (const codigo of [...codigos].sort()) {
    const inicial = saldoPresentacion(med.movs, entrada.desde > '' ? fechaAnterior(entrada.desde) : entrada.desde, codigo);
    const debitos = med.movs.reduce((s, m) => s + (m.cuenta === codigo && m.fecha >= entrada.desde && m.fecha <= entrada.hasta ? m.debito : 0), 0);
    const creditos = med.movs.reduce((s, m) => s + (m.cuenta === codigo && m.fecha >= entrada.desde && m.fecha <= entrada.hasta ? m.credito : 0), 0);
    const final = saldoPresentacion(med.movs, entrada.hasta, codigo);
    const anterior = saldoPresentacion(med.movs, aperturaFecha, codigo);
    if (inicial === 0 && debitos === 0 && creditos === 0 && final === 0 && anterior === 0) continue;
    const clase = claseDe(codigo);
    if (clase !== claseActual) {
      claseActual = clase;
      filas.push({ id: `may-clase-${clase}`, concepto: `Clase ${clase}`, cuenta: clase, inicial: null, debitos: null, creditos: null, final: null, anterior: null, nivel: 0, esTotal: 1 });
    }
    const meta = cuentaDe(codigo, mapa);
    filas.push({
      id: `may-${codigo}`,
      concepto: meta.nombre === codigo ? codigo : `${codigo} ${meta.nombre}`,
      cuenta: codigo,
      inicial,
      debitos: pesos(debitos),
      creditos: pesos(creditos),
      final,
      anterior,
      nivel: meta.nivel || codigo.length,
      esTotal: meta.esMovimiento === false ? 1 : 0,
    });
  }
  return informe('libro-mayor', [
    { key: 'concepto', titulo: 'Cuenta', tipo: 'texto' },
    { key: 'inicial', titulo: 'Saldo inicial', tipo: 'moneda' },
    { key: 'debitos', titulo: 'Débitos', tipo: 'moneda' },
    { key: 'creditos', titulo: 'Créditos', tipo: 'moneda' },
    { key: 'final', titulo: 'Saldo final', tipo: 'moneda' },
    { key: 'anterior', titulo: 'Saldo año anterior', tipo: 'moneda' },
  ], filas, filas.length > 1 ? ['El mayor incluye todas las cuentas con saldo o movimiento. Una fila abre el auxiliar.'] : ['No hay saldos ni movimientos en el corte.']);
}

function fechaAnterior(iso: string): string {
  const [anio, mes, dia] = iso.split('-').map(Number);
  const movido = new Date(Date.UTC(anio, mes - 1, dia - 1));
  const y = movido.getUTCFullYear();
  const m = String(movido.getUTCMonth() + 1).padStart(2, '0');
  const d = String(movido.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function auxiliarCuenta(med: Medicion, entrada: EntradaInforme): InformeResultado {
  const prefijo = entrada.cuenta?.trim() ?? '';
  const mapa = mapaCuentas(entrada.cuentas);
  const cuentas = [...new Set(med.movs.map((m) => m.cuenta))]
    .filter((c) => !prefijo || c.startsWith(prefijo))
    .sort();
  const filas: FilaInforme[] = [];
  for (const codigo of cuentas) {
    let saldo = saldoPresentacion(med.movs, fechaAnterior(entrada.desde), codigo);
    const movimientos = med.movs
      .filter((m) => m.cuenta === codigo && m.fecha >= entrada.desde && m.fecha <= entrada.hasta)
      .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.asientoId - b.asientoId);
    if (saldo === 0 && movimientos.length === 0) continue;
    filas.push({ id: `aux-${codigo}-ini`, concepto: cuentaDe(codigo, mapa).nombre, cuenta: codigo, fecha: entrada.desde, documento: '', debito: null, credito: null, saldo, detalle: 'Saldo inicial', nivel: 0, esTotal: 1 });
    const acreedor = ['2', '3', '4'].includes(claseDe(codigo));
    for (const m of movimientos) {
      saldo = pesos(saldo + (acreedor ? m.credito - m.debito : m.debito - m.credito));
      filas.push({
        id: `aux-${codigo}-${m.asientoId}-${filas.length}`,
        concepto: m.terceroNombre || m.terceroNit || '',
        cuenta: codigo,
        fecha: m.fecha,
        documento: String(m.asientoId),
        debito: m.debito,
        credito: m.credito,
        saldo,
        detalle: m.source,
        nivel: 1,
        esTotal: 0,
      });
    }
  }
  const previo = saldoCuentas(med, restarAnio(entrada.desde), restarAnio(entrada.hasta), prefijo);
  const actual = saldoCuentas(med, entrada.desde, entrada.hasta, prefijo);
  return informe('auxiliar-cuenta', [
    { key: 'fecha', titulo: 'Fecha', tipo: 'texto' },
    { key: 'documento', titulo: 'Asiento', tipo: 'texto' },
    { key: 'cuenta', titulo: 'Cuenta', tipo: 'texto' },
    { key: 'concepto', titulo: 'Tercero', tipo: 'texto' },
    { key: 'detalle', titulo: 'Detalle', tipo: 'texto' },
    { key: 'debito', titulo: 'Débito', tipo: 'moneda' },
    { key: 'credito', titulo: 'Crédito', tipo: 'moneda' },
    { key: 'saldo', titulo: 'Saldo', tipo: 'moneda' },
  ], filas, [prefijo ? `Auxiliar de ${prefijo}.` : 'Auxiliar de todas las cuentas con movimiento.'], [
    { titulo: 'Movimiento neto', valor: actual, formato: 'moneda' },
    { titulo: 'Año anterior', valor: previo, formato: 'moneda' },
  ]);
}

function saldoCuentas(med: Medicion, desde: string, hasta: string, prefijo: string): number {
  let total = 0;
  for (const m of med.movs) {
    if (m.fecha < desde || m.fecha > hasta) continue;
    if (prefijo && !m.cuenta.startsWith(prefijo)) continue;
    const acreedor = ['2', '3', '4'].includes(claseDe(m.cuenta));
    total += acreedor ? m.credito - m.debito : m.debito - m.credito;
  }
  return pesos(total);
}

function auxiliarCentro(med: Medicion, entrada: EntradaInforme): InformeResultado {
  const grupos = new Map<string, { cuenta: string; centro: string; nit: string; nombre: string; debito: number; credito: number }>();
  for (const m of med.movs) {
    if (m.fecha < entrada.desde || m.fecha > entrada.hasta) continue;
    const centro = m.centroId || 'sin-centro';
    const nit = m.terceroNit || 'sin-nit';
    const clave = `${m.cuenta}|${centro}|${nit}`;
    const celda = grupos.get(clave) ?? { cuenta: m.cuenta, centro, nit, nombre: m.terceroNombre, debito: 0, credito: 0 };
    celda.debito += m.debito;
    celda.credito += m.credito;
    if (!celda.nombre && m.terceroNombre) celda.nombre = m.terceroNombre;
    grupos.set(clave, celda);
  }
  const filas: FilaInforme[] = [...grupos.values()]
    .sort((a, b) => a.cuenta.localeCompare(b.cuenta) || a.centro.localeCompare(b.centro) || a.nit.localeCompare(b.nit))
    .map((g) => {
      const acreedor = ['2', '3', '4'].includes(claseDe(g.cuenta));
      return {
        id: `cc-${g.cuenta}-${g.centro}-${g.nit}`,
        cuenta: g.cuenta,
        concepto: entrada.nombresCentro[g.centro] || (g.centro === 'sin-centro' ? 'Sin centro' : g.centro),
        nit: g.nit === 'sin-nit' ? '' : g.nit,
        nombre: g.nombre,
        debito: pesos(g.debito),
        credito: pesos(g.credito),
        neto: pesos(acreedor ? g.credito - g.debito : g.debito - g.credito),
        nivel: 1,
        esTotal: 0,
      };
    });
  return informe('auxiliar-centro', [
    { key: 'cuenta', titulo: 'Cuenta', tipo: 'texto' },
    { key: 'concepto', titulo: 'Centro de costo', tipo: 'texto' },
    { key: 'nit', titulo: 'NIT', tipo: 'texto' },
    { key: 'nombre', titulo: 'Tercero', tipo: 'texto' },
    { key: 'debito', titulo: 'Débito', tipo: 'moneda' },
    { key: 'credito', titulo: 'Crédito', tipo: 'moneda' },
    { key: 'neto', titulo: 'Neto', tipo: 'moneda' },
  ], filas, ['Cuenta, centro de costo y tercero, en el mismo orden que el auxiliar por tercero.']);
}

function inventarios(med: Medicion, entrada: EntradaInforme): InformeResultado {
  const mapa = mapaCuentas(entrada.cuentas);
  const filas: FilaInforme[] = [];
  const codigos = [...new Set(med.movs.map((m) => m.cuenta))].filter((c) => ['1', '2', '3'].includes(claseDe(c))).sort();
  for (const codigo of codigos) {
    const actual = saldoPresentacion(med.movs, entrada.hasta, codigo);
    const anterior = saldoPresentacion(med.movs, restarAnio(entrada.hasta), codigo);
    if (actual === 0 && anterior === 0) continue;
    filas.push(comp(`inv-${codigo}`, `${codigo} ${cuentaDe(codigo, mapa).nombre}`, actual, anterior, codigo.length, false, codigo));
  }
  const sedes = new Set<number>();
  for (const m of med.movs) {
    if (m.cuenta.startsWith('1435') && m.sucursalId != null) sedes.add(m.sucursalId);
  }
  for (const sede of [...sedes].sort((a, b) => a - b)) {
    const actual = saldo1435(med.movs, entrada.hasta, sede);
    const anterior = saldo1435(med.movs, restarAnio(entrada.hasta), sede);
    const nombre = entrada.nombresSucursal[String(sede)] || `Sede ${sede}`;
    filas.push(comp(`inv-sede-${sede}`, `1435 ${nombre}`, actual, anterior, 2, false, '1435'));
  }
  const saldo1405 = saldoDeudor(med.movs, entrada.hasta, new Set(), (m) => m.cuenta.startsWith('1405'));
  const lectura = ['El inventario por sede sale de los auxiliares de la 1435.'];
  if (saldo1405 !== 0) lectura.push(`La 1405 tiene saldo de ${saldo1405} y no se usa para el inventario por sede.`);
  return informe('inventarios-balances', COLS, filas, lectura);
}

function conciliacion(med: Medicion, entrada: EntradaInforme): InformeResultado {
  const filasKardex = valorizarKardex(entrada.kardex, entrada.hasta);
  const valores = valorKardexPorSede(filasKardex);
  const sedes = new Set<number>(valores.keys());
  for (const m of med.movs) {
    if (m.cuenta.startsWith('1435') && m.sucursalId != null && m.fecha <= entrada.hasta) sedes.add(m.sucursalId);
  }
  const filas: FilaInforme[] = [];
  let diferencia = 0;
  for (const sede of [...sedes].sort((a, b) => a - b)) {
    const kardexValor = valores.get(sede) ?? 0;
    const auxiliar = saldo1435(med.movs, entrada.hasta, sede);
    const delta = pesos(kardexValor - auxiliar);
    diferencia = pesos(diferencia + delta);
    filas.push({
      id: `con-${sede}`,
      concepto: entrada.nombresSucursal[String(sede)] || `Sede ${sede}`,
      kardex: kardexValor,
      auxiliar,
      diferencia: delta,
      nivel: 1,
      esTotal: 0,
    });
  }
  return informe('conciliacion-inventario', [
    { key: 'concepto', titulo: 'Sede', tipo: 'texto' },
    { key: 'kardex', titulo: 'Kárdex valorizado', tipo: 'moneda' },
    { key: 'auxiliar', titulo: 'Auxiliar 1435', tipo: 'moneda' },
    { key: 'diferencia', titulo: 'Diferencia', tipo: 'moneda' },
  ], filas, [
    diferencia === 0
      ? 'El kárdex de cada sede iguala al auxiliar 1435.'
      : `Hay diferencias por ${diferencia}. El cuadre no usa la 1405.`,
  ], [], diferencia);
}

function kardexInforme(entrada: EntradaInforme): InformeResultado {
  const filasMov = valorizarKardex(entrada.kardex, entrada.hasta);
  const aperturaPorClave = new Map<string, (typeof filasMov)[number]>();
  const enPeriodo: typeof filasMov = [];
  for (const fila of filasMov) {
    if (fila.fecha < entrada.desde) aperturaPorClave.set(`${fila.sucursalId}|${fila.productoId}`, fila);
    else enPeriodo.push(fila);
  }
  const filas: FilaInforme[] = [];
  for (const [clave, fila] of aperturaPorClave) {
    filas.push({
      id: `kx-ini-${clave}`,
      fecha: entrada.desde,
      documento: '',
      tipo: 'Saldo inicial',
      concepto: entrada.nombresSucursal[String(fila.sucursalId)] || `Sede ${fila.sucursalId}`,
      producto: fila.productoId,
      cantidad: fila.saldoCantidad,
      costo: null,
      saldoCantidad: fila.saldoCantidad,
      saldo: fila.saldoValorizado,
      nivel: 0,
      esTotal: 1,
    });
  }
  for (const fila of enPeriodo) {
    filas.push({
      id: `kx-${fila.sucursalId}-${fila.productoId}-${fila.fecha}-${fila.documento}-${filas.length}`,
      fecha: fila.fecha,
      documento: fila.documento,
      tipo: fila.tipo,
      concepto: entrada.nombresSucursal[String(fila.sucursalId)] || `Sede ${fila.sucursalId}`,
      producto: fila.productoId,
      cantidad: fila.cantidad,
      costo: fila.costoUnitario,
      saldoCantidad: fila.saldoCantidad,
      saldo: fila.saldoValorizado,
      nivel: 1,
      esTotal: 0,
    });
  }
  const total = [...valorKardexPorSede(filasMov).values()].reduce((s, n) => s + n, 0);
  const anterior = [...valorKardexPorSede(valorizarKardex(entrada.kardex, restarAnio(entrada.hasta))).values()].reduce((s, n) => s + n, 0);
  return informe('kardex', [
    { key: 'fecha', titulo: 'Fecha', tipo: 'texto' },
    { key: 'documento', titulo: 'Documento', tipo: 'texto' },
    { key: 'tipo', titulo: 'Tipo', tipo: 'texto' },
    { key: 'concepto', titulo: 'Sede', tipo: 'texto' },
    { key: 'producto', titulo: 'Producto', tipo: 'texto' },
    { key: 'cantidad', titulo: 'Cantidad', tipo: 'numero' },
    { key: 'costo', titulo: 'Costo unitario', tipo: 'moneda' },
    { key: 'saldoCantidad', titulo: 'Saldo cantidad', tipo: 'numero' },
    { key: 'saldo', titulo: 'Saldo valorizado', tipo: 'moneda' },
  ], filas, ['Costo promedio ponderado por producto y sede.'], [
    { titulo: 'Inventario valorizado', valor: pesos(total), formato: 'moneda' },
    { titulo: 'Año anterior', valor: pesos(anterior), formato: 'moneda' },
  ]);
}

function indicadores(med: Medicion, entrada: EntradaInforme): InformeResultado {
  const a = med.indicadores(entrada.desde, entrada.hasta);
  const prev = med.rangoAnterior();
  const b = med.indicadores(prev.desde, prev.hasta);
  const razon = (id: string, concepto: string, actual: number | null, anterior: number | null, formato: 'numero' | 'porcentaje' | 'moneda'): FilaInforme => {
    const delta = actual != null && anterior != null ? variacion(actual, anterior) : { variacion: null, porcentaje: null };
    return {
      id,
      concepto,
      actual,
      anterior,
      variacion: delta.variacion,
      porcentaje: formato === 'porcentaje' ? actual : delta.porcentaje,
      formato,
      nivel: 1,
      esTotal: 0,
    };
  };
  const filas: FilaInforme[] = [
    razon('ind-ac', 'Activo corriente', a.activoCorriente, b.activoCorriente, 'moneda'),
    razon('ind-pc', 'Pasivo corriente', a.pasivoCorriente, b.pasivoCorriente, 'moneda'),
    razon('ind-razon', 'Razón corriente', a.razonCorriente, b.razonCorriente, 'numero'),
    razon('ind-acida', 'Prueba ácida', a.pruebaAcida, b.pruebaAcida, 'numero'),
    razon('ind-kt', 'Capital de trabajo', a.capitalTrabajo, b.capitalTrabajo, 'moneda'),
    razon('ind-end', 'Endeudamiento', a.endeudamiento, b.endeudamiento, 'porcentaje'),
    razon('ind-apal', 'Apalancamiento', a.apalancamiento, b.apalancamiento, 'porcentaje'),
    razon('ind-ventas', 'Ventas netas', a.ventasNetas, b.ventasNetas, 'moneda'),
    razon('ind-bruto', 'Margen bruto', a.margenBruto, b.margenBruto, 'porcentaje'),
    razon('ind-op', 'Margen operacional', a.margenOperacional, b.margenOperacional, 'porcentaje'),
    razon('ind-neto', 'Margen neto', a.margenNeto, b.margenNeto, 'porcentaje'),
    razon('ind-roa', 'ROA', a.roa, b.roa, 'porcentaje'),
    razon('ind-roe', 'ROE', a.roe, b.roe, 'porcentaje'),
    razon('ind-ebitda', 'EBITDA', a.ebitda, b.ebitda, 'moneda'),
    razon('ind-cartera', 'Días de cartera', a.diasCartera, b.diasCartera, 'numero'),
    razon('ind-inv', 'Días de inventario', a.diasInventario, b.diasInventario, 'numero'),
    razon('ind-prov', 'Días de proveedores', a.diasProveedores, b.diasProveedores, 'numero'),
  ];
  return informe('indicadores', [
    { key: 'concepto', titulo: 'Indicador', tipo: 'texto' },
    { key: 'actual', titulo: 'Periodo', tipo: 'numero' },
    { key: 'anterior', titulo: 'Año anterior', tipo: 'numero' },
    { key: 'variacion', titulo: 'Variación', tipo: 'numero' },
  ], filas, [
    'El activo y el pasivo corriente usan la marca de cada cuenta. Sin plazo, «según plazo» no se toma como corriente.',
    'Los días de cartera usan las ventas a crédito (asientos que debitan la 13). Si no hay, el indicador queda vacío.',
  ]);
}

/** Costo de las salidas del kárdex en el periodo, a promedio ponderado, por producto. */
function costoSalidasPeriodo(kardex: EntradaInforme['kardex'], desde: string, hasta: string): Map<string, number> {
  const previo = new Map<string, number>();
  const costo = new Map<string, number>();
  for (const fila of valorizarKardex(kardex, hasta)) {
    const clave = `${fila.sucursalId}|${fila.productoId}`;
    const antes = previo.get(clave) ?? 0;
    if (fila.fecha >= desde && fila.tipo === 'salida') {
      const bajada = pesos(antes - fila.saldoValorizado);
      if (bajada > 0) costo.set(fila.productoId, pesos((costo.get(fila.productoId) ?? 0) + bajada));
    }
    previo.set(clave, fila.saldoValorizado);
  }
  return costo;
}

function equilibrio(med: Medicion, entrada: EntradaInforme): InformeResultado {
  const a = med.equilibrio(entrada.desde, entrada.hasta);
  const prev = med.rangoAnterior();
  const b = med.equilibrio(prev.desde, prev.hasta);
  const costos = costoSalidasPeriodo(entrada.kardex, entrada.desde, entrada.hasta);
  const filas: FilaInforme[] = [
    comp('pe-ventas', 'Ventas netas', a.ventas, b.ventas, 1),
    comp('pe-var', 'Costos variables', a.costosVariables, b.costosVariables, 1),
    comp('pe-fijo', 'Costos fijos', a.costosFijos, b.costosFijos, 1),
    comp('pe-pesos', 'Punto de equilibrio en pesos', a.puntoPesos ?? 0, b.puntoPesos ?? 0, 0, true),
  ];
  const unidades = comp('pe-unidades', 'Punto de equilibrio en unidades', a.puntoUnidades ?? 0, b.puntoUnidades ?? 0, 0, true);
  unidades.formato = 'numero';
  filas.push(unidades);
  for (const linea of entrada.contribucion) {
    const costo = linea.costoVariable > 0 ? linea.costoVariable : (costos.get(linea.producto) ?? 0);
    const margen = pesos(linea.ventas - costo);
    filas.push({
      id: `pe-prod-${linea.producto}-${linea.linea}`,
      concepto: linea.linea ? `${linea.linea} — ${linea.producto}` : linea.producto,
      actual: margen,
      anterior: null,
      ventas: linea.ventas,
      costo,
      nivel: 1,
      esTotal: 0,
    });
  }
  const lectura = [
    'Por defecto la 51 es fija, las comisiones 529505 son variables y toda la clase 6 es costo variable. Una marca de la cuenta cambia el gasto.',
    'El margen por producto resta, a las ventas, el costo de las salidas del kárdex en el periodo.',
  ];
  if (a.puntoPesos == null) lectura.push('No hay punto de equilibrio: las ventas no superan el costo variable.');
  if (a.puntoUnidades == null && a.puntoPesos != null) lectura.push('Faltan las unidades vendidas para expresar el punto en unidades.');
  const columnas = entrada.contribucion.length > 0
    ? [
        COLS[0],
        COLS[1],
        { key: 'ventas', titulo: 'Ventas del producto', tipo: 'moneda' as const },
        { key: 'costo', titulo: 'Costo de las salidas', tipo: 'moneda' as const },
        ...COLS.slice(2),
      ]
    : COLS;
  return informe('punto-equilibrio', columnas, filas, lectura, a.puntoPesos != null ? [{ titulo: 'Punto de equilibrio', valor: a.puntoPesos, formato: 'moneda' }] : []);
}

function formulario300(med: Medicion, entrada: EntradaInforme): InformeResultado {
  const cubos = new Map<string, { base: number; iva: number; origen: string }>();
  for (const linea of entrada.iva) {
    const clave = `${linea.origen}|${cubeta(linea)}`;
    const celda = cubos.get(clave) ?? { base: 0, iva: 0, origen: linea.origen };
    celda.base += linea.base;
    celda.iva += linea.iva;
    cubos.set(clave, celda);
  }
  const filas: FilaInforme[] = [...cubos.entries()].sort().map(([clave, celda]) => ({
    id: `300-${clave}`,
    concepto: etiquetaCubeta(clave),
    base: pesos(celda.base),
    actual: pesos(celda.iva),
    anterior: null,
    nivel: 1,
    esTotal: 0,
  }));
  const desdeAnt = restarAnio(entrada.desde);
  const hastaAnt = restarAnio(entrada.hasta);
  const generado = movimientoEntre(med, entrada.desde, entrada.hasta, '240805', true);
  const descontable = movimientoEntre(med, entrada.desde, entrada.hasta, '240810', false);
  const devoluciones = movimientoEntre(med, entrada.desde, entrada.hasta, '4175', false);
  const reteiva = movimientoEntre(med, entrada.desde, entrada.hasta, '135515', false) || movimientoEntre(med, entrada.desde, entrada.hasta, '1355', false);
  const generadoAnt = movimientoEntre(med, desdeAnt, hastaAnt, '240805', true);
  const descontableAnt = movimientoEntre(med, desdeAnt, hastaAnt, '240810', false);
  const devolucionesAnt = movimientoEntre(med, desdeAnt, hastaAnt, '4175', false);
  const reteivaAnt = movimientoEntre(med, desdeAnt, hastaAnt, '135515', false) || movimientoEntre(med, desdeAnt, hastaAnt, '1355', false);
  filas.push(
    comp('300-generado', 'IVA generado en 240805', generado, generadoAnt, 0, true, '240805'),
    comp('300-descontable', 'IVA descontable en 240810', descontable, descontableAnt, 0, true, '240810'),
    comp('300-dev', 'Devoluciones en 4175', devoluciones, devolucionesAnt, 1, false, '4175'),
    comp('300-rete', 'ReteIVA practicada a la entidad (135515)', reteiva, reteivaAnt, 1, false, '135515'),
    comp('300-saldo', 'Saldo estimado a pagar', pesos(generado - descontable - reteiva), pesos(generadoAnt - descontableAnt - reteivaAnt), 0, true),
  );
  const lectura = [`Periodo ${entrada.perfil.periodoIva} configurado. La tarifa sale de cada factura, no de la cuenta 41.`];
  if (entrada.iva.length === 0) lectura.push('No llegaron líneas de factura con tarifa: se muestran los saldos de las cuentas y el contador completa el formulario.');
  return informe('formulario-300', [
    { key: 'concepto', titulo: 'Concepto', tipo: 'texto' },
    { key: 'base', titulo: 'Base', tipo: 'moneda' },
    { key: 'actual', titulo: 'IVA', tipo: 'moneda' },
    { key: 'anterior', titulo: 'Año anterior', tipo: 'moneda' },
  ], filas, lectura);
}

function cubeta(linea: LineaIva): string {
  if (linea.excluido) return 'excluido';
  const tasa = linea.tarifa > 1 ? linea.tarifa / 100 : linea.tarifa;
  if (tasa === 0) return 'exento';
  const pct = Math.round(tasa * 1000) / 10;
  if (Math.abs(pct - 19) < 0.6) return '19';
  if (Math.abs(pct - 5) < 0.6) return '5';
  return String(pct);
}

function etiquetaCubeta(clave: string): string {
  const [origen, cubo] = clave.split('|');
  const lado = origen === 'compra' ? 'descontable' : origen === 'devolucion' ? 'devolución' : 'generado';
  if (cubo === 'excluido') return `Operaciones excluidas (${lado})`;
  if (cubo === 'exento') return `Operaciones exentas (${lado})`;
  return `Tarifa ${cubo} % (${lado})`;
}

function movimientoEntre(med: Medicion, desde: string, hasta: string, prefijo: string, acreedor: boolean): number {
  let debitos = 0;
  let creditos = 0;
  for (const m of med.movs) {
    if (m.fecha < desde || m.fecha > hasta || !m.cuenta.startsWith(prefijo)) continue;
    debitos += m.debito;
    creditos += m.credito;
  }
  return pesos(acreedor ? creditos - debitos : debitos - creditos);
}

function formulario350(med: Medicion, entrada: EntradaInforme): InformeResultado {
  const filas = agruparRetencion(med, entrada, (cuenta) => cuenta.startsWith('2365') || cuenta.startsWith('2367'), (cuenta) => {
    if (cuenta.startsWith('236570') || cuenta.startsWith('236575')) return 'Autorretención';
    if (cuenta.startsWith('2367')) return 'IVA retenido';
    if (cuenta.startsWith('236505')) return 'Retención de salarios';
    return 'Renta';
  });
  return informe('formulario-350', [
    { key: 'concepto', titulo: 'Concepto', tipo: 'texto' },
    { key: 'cuenta', titulo: 'Auxiliar', tipo: 'texto' },
    { key: 'nit', titulo: 'NIT', tipo: 'texto' },
    { key: 'nombre', titulo: 'Tercero', tipo: 'texto' },
    { key: 'base', titulo: 'Base', tipo: 'moneda' },
    { key: 'tarifa', titulo: 'Tarifa', tipo: 'numero' },
    { key: 'actual', titulo: 'Valor', tipo: 'moneda' },
  ], filas, [
    'La renta está en la 2365 y el IVA retenido en la 2367. La autorretención va en su propio auxiliar. El reteICA de la 2368 no entra aquí.',
    'La base y la tarifa quedan vacías cuando el asiento no las trae: el valor es el del auxiliar.',
  ]);
}

function agruparRetencion(
  med: Medicion,
  entrada: EntradaInforme,
  acepta: (cuenta: string) => boolean,
  conceptoDe: (cuenta: string) => string,
): FilaInforme[] {
  const grupos = new Map<string, { cuenta: string; nit: string; nombre: string; valor: number }>();
  for (const m of med.movs) {
    if (m.fecha < entrada.desde || m.fecha > entrada.hasta || !acepta(m.cuenta)) continue;
    const nit = m.terceroNit || '';
    const clave = `${m.cuenta}|${nit}`;
    const celda = grupos.get(clave) ?? { cuenta: m.cuenta, nit, nombre: m.terceroNombre, valor: 0 };
    celda.valor += m.credito - m.debito;
    if (!celda.nombre) celda.nombre = m.terceroNombre;
    grupos.set(clave, celda);
  }
  return [...grupos.values()]
    .map((g) => ({ ...g, valor: pesos(g.valor) }))
    .filter((g) => g.valor !== 0)
    .sort((a, b) => a.cuenta.localeCompare(b.cuenta) || a.nit.localeCompare(b.nit))
    .map((g) => ({
      id: `ret-${g.cuenta}-${g.nit}`,
      concepto: conceptoDe(g.cuenta),
      cuenta: g.cuenta,
      nit: g.nit,
      nombre: g.nombre,
      base: null,
      tarifa: null,
      actual: g.valor,
      nivel: 1,
      esTotal: 0,
    }));
}

function ica(med: Medicion, entrada: EntradaInforme): InformeResultado {
  const res = med.resultados(entrada.desde, entrada.hasta);
  const prev = med.rangoAnterior();
  const resAnt = med.resultados(prev.desde, prev.hasta);
  const base = pesos(res.ventasNetas - entrada.perfil.exclusionesIcaValor);
  const baseAnt = pesos(resAnt.ventasNetas - entrada.perfil.exclusionesIcaValor);
  const impuesto = entrada.perfil.tarifaIca > 0 ? pesos(base * entrada.perfil.tarifaIca) : 0;
  const impuestoAnt = entrada.perfil.tarifaIca > 0 ? pesos(baseAnt * entrada.perfil.tarifaIca) : 0;
  const causado = movimientoEntre(med, entrada.desde, entrada.hasta, '2412', true);
  const causadoAnt = movimientoEntre(med, prev.desde, prev.hasta, '2412', true);
  const anticipo = pesos(
    movimientoEntre(med, entrada.desde, entrada.hasta, '135517', false) + movimientoEntre(med, entrada.desde, entrada.hasta, '135518', false),
  );
  const anticipoAnt = pesos(
    movimientoEntre(med, prev.desde, prev.hasta, '135517', false) + movimientoEntre(med, prev.desde, prev.hasta, '135518', false),
  );
  const filas: FilaInforme[] = [
    comp('ica-base', 'Ingresos gravados', base, baseAnt, 1, false, '41'),
    comp('ica-imp', 'Impuesto estimado', impuesto, impuestoAnt, 0, true),
    comp('ica-causado', 'Impuesto registrado en 2412', causado, causadoAnt, 1, false, '2412'),
    comp('ica-anticipo', 'Retenciones de ICA practicadas a la entidad', anticipo, anticipoAnt, 1, false, '135517'),
    comp('ica-pagar', 'Saldo estimado', pesos(impuesto - anticipo), pesos(impuestoAnt - anticipoAnt), 0, true),
  ];
  const lectura = [
    entrada.perfil.municipioIca
      ? `Municipio: ${entrada.perfil.municipioIca}. Actividad: ${entrada.perfil.actividad || 'sin actividad'}.`
      : 'Falta el municipio del ICA en la configuración. Medellín y los demás se registran ahí, no en el código.',
  ];
  if (entrada.perfil.exclusionesIca) lectura.push(`Exclusiones: ${entrada.perfil.exclusionesIca}.`);
  if (entrada.perfil.tarifaIca <= 0) lectura.push('La tarifa del ICA no está configurada: el impuesto estimado queda en cero.');
  return informe('ica-municipal', COLS, filas, lectura);
}

function reteica(med: Medicion, entrada: EntradaInforme): InformeResultado {
  const filas = agruparRetencion(med, entrada, (cuenta) => cuenta.startsWith('2368'), () => 'ReteICA practicado');
  return informe('reteica', [
    { key: 'cuenta', titulo: 'Auxiliar', tipo: 'texto' },
    { key: 'nit', titulo: 'NIT', tipo: 'texto' },
    { key: 'nombre', titulo: 'Tercero', tipo: 'texto' },
    { key: 'actual', titulo: 'Valor', tipo: 'moneda' },
  ], filas, ['Declaración aparte del reteICA practicado a terceros, cuenta 2368. No va en el formulario 350.']);
}

function exogena(med: Medicion, entrada: EntradaInforme): InformeResultado {
  const anio = anioDe(entrada.hasta);
  const dic = cierreDiciembre(anio);
  const corte = entrada.hasta >= dic ? dic : entrada.hasta;
  const filas: FilaInforme[] = [];
  const formatos: { codigo: string; titulo: string; filas: { nit: string; nombre: string; valor: number; extra: number }[]; responsable?: boolean }[] = [
    { codigo: '1001', titulo: 'Pagos', filas: pagos1001(med, entrada) },
    { codigo: '1005', titulo: 'IVA descontable', filas: movimientoTercero(med, entrada, (c) => c.startsWith('240810'), false), responsable: true },
    { codigo: '1006', titulo: 'IVA generado', filas: movimientoTercero(med, entrada, (c) => c.startsWith('240805'), true), responsable: true },
    { codigo: '1007', titulo: 'Ingresos', filas: movimientoTercero(med, entrada, (c) => c.startsWith('41') || c.startsWith('42'), true) },
    { codigo: '1008', titulo: 'Cuentas por cobrar', filas: saldoTercero(med, corte, (c) => claseDe(c) === '1' && c.startsWith('13'), false) },
    { codigo: '1009', titulo: 'Cuentas por pagar', filas: saldoTercero(med, corte, (c) => c.startsWith('22') || c.startsWith('23'), true) },
  ];
  const lectura = entrada.topesConfigurados
    ? [`Topes del año ${anio} tomados de la configuración.`]
    : [`No hay topes configurados para ${anio}. No se aplica ningún monto fijo: el borrador trae todos los terceros.`];
  if (corte !== dic) lectura.push('La 1008 y la 1009 se piden al 31 de diciembre. El rango termina antes, así que el saldo es el del corte elegido.');
  for (const formato of formatos) {
    if (formato.responsable && !entrada.perfil.responsableIva) {
      lectura.push(`El formato ${formato.codigo} no se prepara: la organización no está marcada como responsable de IVA.`);
      continue;
    }
    const tope = entrada.topesConfigurados ? entrada.topes.find((t) => t.formato === formato.codigo)?.tope : undefined;
    let menores = 0;
    let menoresValor = 0;
    for (const fila of formato.filas) {
      if (tope != null && Math.abs(fila.valor) < tope) {
        menores += 1;
        menoresValor += fila.valor;
        continue;
      }
      filas.push({
        id: `exo-${formato.codigo}-${fila.nit}-${filas.length}`,
        concepto: formato.titulo,
        formato: formato.codigo,
        nit: fila.nit,
        nombre: fila.nombre,
        actual: fila.valor,
        extra: fila.extra,
        nivel: 1,
        esTotal: 0,
      });
    }
    if (menores > 0) {
      filas.push({
        id: `exo-${formato.codigo}-menores`,
        concepto: `${formato.titulo} — cuantías menores`,
        formato: formato.codigo,
        nit: '',
        nombre: `${menores} terceros`,
        actual: pesos(menoresValor),
        extra: null,
        nivel: 1,
        esTotal: 1,
      });
    }
  }
  return informe('exogena', [
    { key: 'formato', titulo: 'Formato', tipo: 'texto' },
    { key: 'concepto', titulo: 'Concepto', tipo: 'texto' },
    { key: 'nit', titulo: 'NIT', tipo: 'texto' },
    { key: 'nombre', titulo: 'Tercero', tipo: 'texto' },
    { key: 'actual', titulo: 'Valor', tipo: 'moneda' },
    { key: 'extra', titulo: 'Retención', tipo: 'moneda' },
  ], filas, lectura);
}

function pagos1001(med: Medicion, entrada: EntradaInforme): { nit: string; nombre: string; valor: number; extra: number }[] {
  const pagos = new Map<string, { nit: string; nombre: string; valor: number; extra: number }>();
  const tocar = (nit: string, nombre: string) => {
    const clave = nit || 'sin-tercero';
    const celda = pagos.get(clave) ?? { nit, nombre, valor: 0, extra: 0 };
    if (!celda.nombre && nombre) celda.nombre = nombre;
    pagos.set(clave, celda);
    return celda;
  };
  for (const m of med.movs) {
    if (m.fecha < entrada.desde || m.fecha > entrada.hasta) continue;
    const pago = ['5', '6', '7'].includes(claseDe(m.cuenta)) || (bajo(m.cuenta, ['12', '15', '16', '18']) && !bajo(m.cuenta, ['1592', '1598', '1599']));
    if (pago && m.debito > 0) tocar(m.terceroNit, m.terceroNombre).valor += m.debito;
    if ((m.cuenta.startsWith('2365') || m.cuenta.startsWith('2367')) && m.credito > 0) tocar(m.terceroNit, m.terceroNombre).extra += m.credito;
  }
  return [...pagos.values()].map((f) => ({ ...f, valor: pesos(f.valor), extra: pesos(f.extra) })).filter((f) => f.valor !== 0 || f.extra !== 0);
}

function movimientoTercero(med: Medicion, entrada: EntradaInforme, acepta: (cuenta: string) => boolean, acreedor: boolean): { nit: string; nombre: string; valor: number; extra: number }[] {
  const grupos = new Map<string, { nit: string; nombre: string; valor: number }>();
  for (const m of med.movs) {
    if (m.fecha < entrada.desde || m.fecha > entrada.hasta || !acepta(m.cuenta)) continue;
    const clave = m.terceroNit || 'sin-tercero';
    const celda = grupos.get(clave) ?? { nit: m.terceroNit, nombre: m.terceroNombre, valor: 0 };
    celda.valor += acreedor ? m.credito - m.debito : m.debito - m.credito;
    if (!celda.nombre) celda.nombre = m.terceroNombre;
    grupos.set(clave, celda);
  }
  return [...grupos.values()].map((f) => ({ ...f, valor: pesos(f.valor), extra: 0 })).filter((f) => f.valor !== 0);
}

function saldoTercero(med: Medicion, hasta: string, acepta: (cuenta: string) => boolean, acreedor: boolean): { nit: string; nombre: string; valor: number; extra: number }[] {
  const grupos = new Map<string, { nit: string; nombre: string; debito: number; credito: number }>();
  for (const m of med.movs) {
    if (m.fecha > hasta || !acepta(m.cuenta)) continue;
    const clave = `${m.cuenta}|${m.terceroNit || 'sin-tercero'}`;
    const celda = grupos.get(clave) ?? { nit: m.terceroNit, nombre: m.terceroNombre, debito: 0, credito: 0 };
    celda.debito += m.debito;
    celda.credito += m.credito;
    if (!celda.nombre) celda.nombre = m.terceroNombre;
    grupos.set(clave, celda);
  }
  const porNit = new Map<string, { nit: string; nombre: string; valor: number }>();
  for (const celda of grupos.values()) {
    const valor = pesos(acreedor ? celda.credito - celda.debito : celda.debito - celda.credito);
    if (valor === 0) continue;
    const clave = celda.nit || 'sin-tercero';
    const acum = porNit.get(clave) ?? { nit: celda.nit, nombre: celda.nombre, valor: 0 };
    acum.valor += valor;
    if (!acum.nombre) acum.nombre = celda.nombre;
    porNit.set(clave, acum);
  }
  return [...porNit.values()].map((f) => ({ ...f, valor: pesos(f.valor), extra: 0 }));
}

function certificado220(med: Medicion, entrada: EntradaInforme): InformeResultado {
  const personas = new Map<string, { nombre: string; documento: string; c5105: number; c5205: number; retencion: number }>();
  const tocar = (nit: string, nombre: string) => {
    const clave = nit || nombre || 'sin-tercero';
    const celda = personas.get(clave) ?? { nombre, documento: nit, c5105: 0, c5205: 0, retencion: 0 };
    if (!celda.nombre && nombre) celda.nombre = nombre;
    personas.set(clave, celda);
    return celda;
  };
  for (const m of med.movs) {
    if (m.fecha < entrada.desde || m.fecha > entrada.hasta) continue;
    if (m.cuenta.startsWith('5105')) tocar(m.terceroNit, m.terceroNombre).c5105 += m.debito - m.credito;
    if (m.cuenta.startsWith('5205')) tocar(m.terceroNit, m.terceroNombre).c5205 += m.debito - m.credito;
    if (m.cuenta.startsWith('236505')) tocar(m.terceroNit, m.terceroNombre).retencion += m.credito - m.debito;
  }
  const filas: FilaInforme[] = [...personas.values()]
    .map((p) => ({ ...p, c5105: pesos(p.c5105), c5205: pesos(p.c5205), retencion: pesos(p.retencion) }))
    .filter((p) => p.c5105 !== 0 || p.c5205 !== 0 || p.retencion !== 0)
    .map((p) => ({
      id: `220-${p.documento || p.nombre}`,
      concepto: p.nombre || 'Sin tercero en el asiento',
      documento: p.documento,
      actual: p.c5105,
      ventas: p.c5205,
      retencion: p.retencion,
      nivel: 1,
      esTotal: 0,
    }));
  if (entrada.nomina.length > 0 && filas.length === 0) {
    for (const n of entrada.nomina) {
      filas.push({
        id: `220-nom-${n.documento || n.nombre}`,
        concepto: n.nombre,
        documento: n.documento,
        actual: n.devengado,
        ventas: 0,
        retencion: n.retencion,
        nivel: 1,
        esTotal: 0,
      });
    }
  }
  return informe('certificado-220', [
    { key: 'concepto', titulo: 'Empleado', tipo: 'texto' },
    { key: 'documento', titulo: 'Documento', tipo: 'texto' },
    { key: 'actual', titulo: '5105', tipo: 'moneda' },
    { key: 'ventas', titulo: '5205', tipo: 'moneda' },
    { key: 'retencion', titulo: 'Retención de salarios', tipo: 'moneda' },
  ], filas, [
    'Solo empleados: sueldos 5105, gastos de personal de ventas 5205 y retención de salarios en el auxiliar 236505. Los proveedores van en el otro certificado.',
    'La nómina no guarda el número de documento. Si el asiento no trae el NIT del empleado, el certificado queda sin cédula.',
  ]);
}

function certificadoProveedores(med: Medicion, entrada: EntradaInforme): InformeResultado {
  const grupos = new Map<string, { nit: string; nombre: string; renta: number; iva: number; ica: number }>();
  for (const m of med.movs) {
    if (m.fecha < entrada.desde || m.fecha > entrada.hasta) continue;
    const renta = m.cuenta.startsWith('2365') && !m.cuenta.startsWith('236505') && !m.cuenta.startsWith('236570') && !m.cuenta.startsWith('236575');
    const iva = m.cuenta.startsWith('2367');
    const ica = m.cuenta.startsWith('2368');
    if (!renta && !iva && !ica) continue;
    const clave = m.terceroNit || m.terceroNombre || 'sin-tercero';
    const celda = grupos.get(clave) ?? { nit: m.terceroNit, nombre: m.terceroNombre, renta: 0, iva: 0, ica: 0 };
    const valor = m.credito - m.debito;
    if (renta) celda.renta += valor;
    if (iva) celda.iva += valor;
    if (ica) celda.ica += valor;
    if (!celda.nombre) celda.nombre = m.terceroNombre;
    grupos.set(clave, celda);
  }
  const filas: FilaInforme[] = [...grupos.values()].map((g) => ({
    id: `cr-${g.nit || g.nombre}`,
    concepto: g.nombre || g.nit,
    nit: g.nit,
    renta: pesos(g.renta),
    iva: pesos(g.iva),
    ica: pesos(g.ica),
    actual: pesos(g.renta + g.iva + g.ica),
    nivel: 1,
    esTotal: 0,
  }));
  return informe('certificado-retenciones', [
    { key: 'nit', titulo: 'NIT', tipo: 'texto' },
    { key: 'concepto', titulo: 'Proveedor', tipo: 'texto' },
    { key: 'renta', titulo: 'Renta', tipo: 'moneda' },
    { key: 'iva', titulo: 'IVA', tipo: 'moneda' },
    { key: 'ica', titulo: 'ICA', tipo: 'moneda' },
    { key: 'actual', titulo: 'Total', tipo: 'moneda' },
  ], filas, ['Retenciones practicadas a proveedores. No incluye salarios ni la autorretención.']);
}

function conciliacionFiscal(med: Medicion, entrada: EntradaInforme): InformeResultado {
  const neta = med.resultados(entrada.desde, entrada.hasta).neta;
  const prev = med.rangoAnterior();
  const netaAnt = med.resultados(prev.desde, prev.hasta).neta;
  const filas: FilaInforme[] = [comp('cf-contable', 'Utilidad contable', neta, netaAnt, 0, true)];
  for (const formulario of ['2516', '2517'] as const) {
    const propios = entrada.ajustesFiscales.filter((a) => a.formulario === formulario);
    let neto = neta;
    filas.push({ id: `cf-tit-${formulario}`, concepto: `Formulario ${formulario}`, actual: null, anterior: null, nivel: 0, esTotal: 1 });
    for (const ajuste of propios) {
      const signo = ajuste.tipo === 'adicion' ? 1 : -1;
      neto = pesos(neto + signo * ajuste.valor);
      filas.push({
        id: `cf-${ajuste.id}`,
        concepto: `${ajuste.tipo === 'adicion' ? 'Adición' : 'Deducción'}: ${ajuste.concepto}`,
        actual: pesos(signo * ajuste.valor),
        anterior: null,
        nivel: 1,
        esTotal: 0,
      });
    }
    filas.push(comp(`cf-fiscal-${formulario}`, `Renta líquida estimada ${formulario}`, neto, netaAnt, 0, true));
  }
  const lectura = ['El contador registra las adiciones y deducciones. Sin ellas, la renta líquida estimada es la utilidad contable.'];
  return informe('conciliacion-fiscal', COLS, filas, lectura);
}

function gestion(med: Medicion, entrada: EntradaInforme): InformeResultado {
  const res = med.resultados(entrada.desde, entrada.hasta);
  const sit = med.situacion(entrada.hasta);
  const prev = med.rangoAnterior();
  const resPrev = med.resultados(prev.desde, prev.hasta);
  const sitPrev = med.situacion(restarAnio(entrada.hasta));
  const filas: FilaInforme[] = [
    { id: 'ig-texto', concepto: 'Informe', detalle: entrada.perfil.informeGestion.trim() || 'El informe de gestión todavía no tiene texto. Se escribe en la configuración de los estados.', actual: null, anterior: null, nivel: 0, esTotal: 0 },
    comp('ig-ventas', 'Ventas netas', res.ventasNetas, resPrev.ventasNetas, 1),
    comp('ig-utilidad', 'Utilidad del ejercicio', res.neta, resPrev.neta, 1),
    comp('ig-activo', 'Activo', sit.activo, sitPrev.activo, 1),
    comp('ig-patrimonio', 'Patrimonio', sit.patrimonio, sitPrev.patrimonio, 1),
  ];
  return informe('informe-gestion', [
    { key: 'concepto', titulo: 'Concepto', tipo: 'texto' },
    { key: 'detalle', titulo: 'Texto', tipo: 'texto' },
    { key: 'actual', titulo: 'Periodo', tipo: 'moneda' },
    { key: 'anterior', titulo: 'Año anterior', tipo: 'moneda' },
  ], filas, ['Borrador del informe de gestión con las cifras de los estados.']);
}

function accionistas(entrada: EntradaInforme): InformeResultado {
  const filas: FilaInforme[] = entrada.accionistas.map((a) => ({
    id: `acc-${a.id}`,
    concepto: a.nombre,
    documento: a.documento,
    acciones: a.acciones,
    valor: pesos(a.valorNominal),
    porcentaje: a.porcentaje,
    fecha: a.fechaIngreso,
    nivel: 1,
    esTotal: 0,
  }));
  const porcentaje = pesos(entrada.accionistas.reduce((s, a) => s + a.porcentaje, 0) * 100) / 100;
  const lectura = [Math.abs(porcentaje - 100) < 0.01 || entrada.accionistas.length === 0
    ? 'La participación suma 100 %.'
    : `La participación suma ${porcentaje} %. Revise el registro antes de presentarlo.`];
  if (entrada.accionistas.length === 0) lectura[0] = 'No hay accionistas registrados para esta organización.';
  return informe('registro-accionistas', [
    { key: 'concepto', titulo: 'Accionista', tipo: 'texto' },
    { key: 'documento', titulo: 'Documento', tipo: 'texto' },
    { key: 'acciones', titulo: 'Acciones', tipo: 'numero' },
    { key: 'valor', titulo: 'Valor nominal', tipo: 'moneda' },
    { key: 'porcentaje', titulo: 'Participación %', tipo: 'numero' },
    { key: 'fecha', titulo: 'Ingreso', tipo: 'texto' },
  ], filas, lectura);
}

function pila(entrada: EntradaInforme): InformeResultado {
  const filas: FilaInforme[] = entrada.nomina.map((n, i) => ({
    id: `pila-${n.documento || i}`,
    concepto: n.nombre,
    documento: n.documento,
    salud: n.saludTrabajador,
    pension: n.pensionTrabajador,
    saludEmpleador: n.saludEmpleador,
    pensionEmpleador: n.pensionEmpleador,
    arl: n.arl,
    parafiscales: n.parafiscales,
    actual: pesos(n.saludTrabajador + n.pensionTrabajador + n.saludEmpleador + n.pensionEmpleador + n.arl + n.parafiscales),
    nivel: 1,
    esTotal: 0,
  }));
  return informe('pila', [
    { key: 'concepto', titulo: 'Empleado', tipo: 'texto' },
    { key: 'salud', titulo: 'Salud trabajador', tipo: 'moneda' },
    { key: 'pension', titulo: 'Pensión trabajador', tipo: 'moneda' },
    { key: 'saludEmpleador', titulo: 'Salud empleador', tipo: 'moneda' },
    { key: 'pensionEmpleador', titulo: 'Pensión empleador', tipo: 'moneda' },
    { key: 'arl', titulo: 'ARL', tipo: 'moneda' },
    { key: 'parafiscales', titulo: 'Parafiscales', tipo: 'moneda' },
    { key: 'actual', titulo: 'Total', tipo: 'moneda' },
  ], filas, filas.length ? ['Cifras tomadas de los comprobantes de nómina del periodo.'] : ['No hay nómina liquidada en el periodo.']);
}
