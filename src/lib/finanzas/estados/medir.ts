/**
 * Única medición de los estados. El balance, el patrimonio, el flujo
 * indirecto y los indicadores leen estos mismos números.
 */

import { restarAnio } from './fechas';
import {
  apertura,
  asientosDeCierre,
  bajo,
  claseDe,
  cuentaDe,
  esContra,
  esCorriente,
  esCostoFijo,
  esCostoVariable,
  esEfectivo,
  esEquivalente,
  mapaCuentas,
  neto,
  normalizarMovimientos,
  patrimonioContable,
  pesos,
  porAsiento,
  resultadoNoCerrado,
  saldoAcreedor,
  saldoDeudor,
  sumaCreditos,
  sumaDebitos,
  utilidadPeriodo,
  variacion,
} from './saldos';
import type { Cuenta, EntradaInforme, Movimiento } from './tipos';

const COLUMNAS = ['31', '32', '33', '34', '35', '36', '37', '38'] as const;
export type ColumnaPatrimonio = (typeof COLUMNAS)[number];

export interface LineaGrupo {
  codigo: string;
  nombre: string;
  valor: number;
}

export interface CifrasSituacion {
  efectivo: number;
  inversionesCorto: number;
  deudores: number;
  inventarios: number;
  otrosCorrientes: number;
  activoCorriente: number;
  ppe: number;
  intangibles: number;
  inversionesLargo: number;
  otrosNoCorrientes: number;
  activoNoCorriente: number;
  activo: number;
  pasivosCorrientes: LineaGrupo[];
  pasivosNoCorrientes: LineaGrupo[];
  pasivoCorriente: number;
  pasivoNoCorriente: number;
  pasivo: number;
  patrimonioGrupos: LineaGrupo[];
  resultadoNoCerrado: number;
  patrimonio: number;
}

export interface LineaOri {
  cuenta: string;
  nombre: string;
  valor: number;
}

export interface CifrasResultados {
  ingresos: number;
  devoluciones: number;
  ventasNetas: number;
  costo: number;
  produccion: number;
  bruta: number;
  administracion: number;
  gastosVentas: number;
  operacional: number;
  otrosIngresos: number;
  noOperacionales: number;
  otrosGastos: number;
  antesImpuesto: number;
  impuesto: number;
  neta: number;
  ori: LineaOri[];
  oriTotal: number;
  integral: number;
}

export interface FilaPatrimonio {
  id: string;
  concepto: string;
  valores: Record<ColumnaPatrimonio, number>;
  total: number;
}

export interface CifrasPatrimonio {
  filas: FilaPatrimonio[];
  totalFinal: number;
  patrimonioBalance: number;
  diferencia: number;
}

export interface CifrasFlujo {
  utilidad: number;
  depreciacion: number;
  otrasProvisiones: number;
  utilidadVenta: number;
  perdidaVenta: number;
  variacionDeudores: number;
  variacionInventarios: number;
  variacionOtrosActivos: number;
  variacionPasivos: number;
  operacion: number;
  comprasActivos: number;
  ventaActivos: number;
  inversion: number;
  obligaciones: number;
  aportes: number;
  dividendosPagados: number;
  financiacion: number;
  efectivo: number;
  diferencia: number;
}

export interface CifrasIndicadores {
  activoCorriente: number;
  pasivoCorriente: number;
  razonCorriente: number | null;
  pruebaAcida: number | null;
  capitalTrabajo: number;
  endeudamiento: number | null;
  apalancamiento: number | null;
  ventasNetas: number;
  margenBruto: number | null;
  margenOperacional: number | null;
  margenNeto: number | null;
  roa: number | null;
  roe: number | null;
  ebitda: number;
  diasCartera: number | null;
  diasInventario: number | null;
  diasProveedores: number | null;
}

export interface CifrasEquilibrio {
  ventas: number;
  costosVariables: number;
  costosFijos: number;
  razon: number | null;
  puntoPesos: number | null;
  unidadesVendidas: number;
  puntoUnidades: number | null;
}

function vacio(): Record<ColumnaPatrimonio, number> {
  return { '31': 0, '32': 0, '33': 0, '34': 0, '35': 0, '36': 0, '37': 0, '38': 0 };
}

function totalCols(valores: Record<ColumnaPatrimonio, number>): number {
  return pesos(COLUMNAS.reduce((s, c) => s + valores[c], 0));
}

function sumarCols(a: Record<ColumnaPatrimonio, number>, b: Record<ColumnaPatrimonio, number>): Record<ColumnaPatrimonio, number> {
  const r = vacio();
  for (const c of COLUMNAS) r[c] = pesos(a[c] + b[c]);
  return r;
}

export class Medicion {
  readonly movs: Movimiento[];
  readonly mapa: Map<string, Cuenta>;
  readonly cierre: Set<number>;
  readonly asientos: Map<number, Movimiento[]>;
  readonly entrada: EntradaInforme;

  constructor(entrada: EntradaInforme) {
    this.entrada = entrada;
    this.movs = normalizarMovimientos(entrada.movimientos);
    this.mapa = mapaCuentas(entrada.cuentas);
    this.cierre = asientosDeCierre(this.movs);
    this.asientos = porAsiento(this.movs);
  }

  private codes(acepta: (codigo: string) => boolean): string[] {
    const set = new Set<string>();
    for (const c of this.mapa.values()) {
      if (acepta(c.codigo)) set.add(c.codigo);
    }
    for (const m of this.movs) {
      if (acepta(m.cuenta)) set.add(m.cuenta);
    }
    return [...set];
  }

  private saldoCuenta(codigo: string, hasta: string, acreedor: boolean): number {
    const acepta = (m: Movimiento) => m.cuenta === codigo;
    return acreedor
      ? saldoAcreedor(this.movs, hasta, this.cierre, acepta)
      : saldoDeudor(this.movs, hasta, new Set(), acepta);
  }

  situacion(hasta: string): CifrasSituacion {
    const buckets = {
      efectivo: 0,
      inversionesCorto: 0,
      deudores: 0,
      inventarios: 0,
      otrosCorrientes: 0,
      ppe: 0,
      intangibles: 0,
      inversionesLargo: 0,
      otrosNoCorrientes: 0,
    };
    for (const codigo of this.codes((c) => claseDe(c) === '1')) {
      const cuenta = cuentaDe(codigo, this.mapa);
      const saldo = this.saldoCuenta(codigo, hasta, false);
      if (esEfectivo(codigo, this.mapa)) buckets.efectivo += saldo;
      else if (codigo.startsWith('12') && esCorriente(cuenta)) buckets.inversionesCorto += saldo;
      else if (codigo.startsWith('13') && esCorriente(cuenta)) buckets.deudores += saldo;
      else if (codigo.startsWith('14') && esCorriente(cuenta)) buckets.inventarios += saldo;
      else if (codigo.startsWith('15')) buckets.ppe += saldo;
      else if (codigo.startsWith('16')) buckets.intangibles += saldo;
      else if (codigo.startsWith('12')) buckets.inversionesLargo += saldo;
      else if (esCorriente(cuenta)) buckets.otrosCorrientes += saldo;
      else buckets.otrosNoCorrientes += saldo;
    }
    for (const clave of Object.keys(buckets) as (keyof typeof buckets)[]) {
      buckets[clave] = pesos(buckets[clave]);
    }
    const activoCorriente = pesos(
      buckets.efectivo + buckets.inversionesCorto + buckets.deudores + buckets.inventarios + buckets.otrosCorrientes,
    );
    const activoNoCorriente = pesos(buckets.ppe + buckets.intangibles + buckets.inversionesLargo + buckets.otrosNoCorrientes);
    const pasivoMapa = new Map<string, { corriente: number; noCorriente: number }>();
    for (const codigo of this.codes((c) => claseDe(c) === '2')) {
      const cuenta = cuentaDe(codigo, this.mapa);
      const grupo = codigo.slice(0, 2);
      const saldo = this.saldoCuenta(codigo, hasta, true);
      const celda = pasivoMapa.get(grupo) ?? { corriente: 0, noCorriente: 0 };
      const corriente = bajo(codigo, ['21', '22', '23', '24', '25', '26', '27', '28']) && esCorriente(cuenta);
      if (corriente) celda.corriente += saldo;
      else celda.noCorriente += saldo;
      pasivoMapa.set(grupo, celda);
    }
    const pasivosCorrientes: LineaGrupo[] = [];
    const pasivosNoCorrientes: LineaGrupo[] = [];
    for (const [codigo, celda] of [...pasivoMapa.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      const nombre = cuentaDe(codigo, this.mapa).nombre;
      if (celda.corriente !== 0) pasivosCorrientes.push({ codigo, nombre: nombre === codigo ? `Pasivo ${codigo}` : nombre, valor: pesos(celda.corriente) });
      if (celda.noCorriente !== 0) pasivosNoCorrientes.push({ codigo, nombre: nombre === codigo ? `Pasivo ${codigo}` : nombre, valor: pesos(celda.noCorriente) });
    }
    const patrimonioMapa = new Map<string, number>();
    for (const codigo of this.codes((c) => claseDe(c) === '3')) {
      const grupo = COLUMNAS.find((c) => codigo.startsWith(c)) ?? 'otros';
      patrimonioMapa.set(grupo, (patrimonioMapa.get(grupo) ?? 0) + this.saldoCuenta(codigo, hasta, true));
    }
    const patrimonioGrupos: LineaGrupo[] = COLUMNAS
      .filter((c) => (patrimonioMapa.get(c) ?? 0) !== 0)
      .map((c) => ({ codigo: c, nombre: cuentaDe(c, this.mapa).nombre, valor: pesos(patrimonioMapa.get(c) ?? 0) }));
    const otrosPatrimonio = pesos(patrimonioMapa.get('otros') ?? 0);
    if (otrosPatrimonio !== 0) patrimonioGrupos.push({ codigo: 'otros', nombre: 'Otras cuentas de patrimonio', valor: otrosPatrimonio });
    const resultado = resultadoNoCerrado(this.movs, hasta);
    const pasivoCorriente = pesos(pasivosCorrientes.reduce((s, l) => s + l.valor, 0));
    const pasivoNoCorriente = pesos(pasivosNoCorrientes.reduce((s, l) => s + l.valor, 0));
    return {
      ...buckets,
      activoCorriente,
      activoNoCorriente,
      activo: pesos(activoCorriente + activoNoCorriente),
      pasivosCorrientes,
      pasivosNoCorrientes,
      pasivoCorriente,
      pasivoNoCorriente,
      pasivo: pesos(pasivoCorriente + pasivoNoCorriente),
      patrimonioGrupos,
      resultadoNoCerrado: resultado,
      patrimonio: pesos(patrimonioGrupos.reduce((s, l) => s + l.valor, 0) + resultado),
    };
  }

  resultados(desde: string, hasta: string): CifrasResultados {
    const corte = { desde, hasta, excluirCierre: true as const };
    const acreedor = (acepta: (m: Movimiento) => boolean) => neto(this.movs, corte, this.cierre, acepta, true);
    const deudor = (acepta: (m: Movimiento) => boolean) => neto(this.movs, corte, this.cierre, acepta, false);
    const ingresos = acreedor((m) => m.cuenta.startsWith('41') && !m.cuenta.startsWith('4175'));
    const devoluciones = deudor((m) => m.cuenta.startsWith('4175'));
    const ventasNetas = pesos(ingresos - devoluciones);
    const costo = deudor((m) => claseDe(m.cuenta) === '6');
    const produccion = deudor((m) => claseDe(m.cuenta) === '7');
    const bruta = pesos(ventasNetas - costo - produccion);
    const administracion = deudor((m) => m.cuenta.startsWith('51'));
    const gastosVentas = deudor((m) => m.cuenta.startsWith('52'));
    const operacional = pesos(bruta - administracion - gastosVentas);
    const otrosIngresos = acreedor((m) => claseDe(m.cuenta) === '4' && !m.cuenta.startsWith('41'));
    const otrosGastos = deudor((m) => claseDe(m.cuenta) === '5' && !bajo(m.cuenta, ['51', '52', '53', '54']));
    const noOperacionales = deudor((m) => m.cuenta.startsWith('53'));
    const antesImpuesto = pesos(operacional + otrosIngresos - noOperacionales - otrosGastos);
    const impuesto = deudor((m) => m.cuenta.startsWith('54'));
    const neta = utilidadPeriodo(this.movs, desde, hasta, this.cierre);
    const oriMapa = new Map<string, number>();
    if (this.entrada.perfil.grupo !== 3) {
      for (const m of this.movs) {
        if (m.fecha < desde || m.fecha > hasta || this.cierre.has(m.asientoId)) continue;
        if (!m.cuenta.startsWith('38') || !cuentaDe(m.cuenta, this.mapa).esOri) continue;
        oriMapa.set(m.cuenta, (oriMapa.get(m.cuenta) ?? 0) + m.credito - m.debito);
      }
    }
    const ori = [...oriMapa.entries()]
      .map(([cuenta, valor]) => ({ cuenta, nombre: cuentaDe(cuenta, this.mapa).nombre, valor: pesos(valor) }))
      .filter((l) => l.valor !== 0)
      .sort((a, b) => a.cuenta.localeCompare(b.cuenta));
    const oriTotal = pesos(ori.reduce((s, l) => s + l.valor, 0));
    return {
      ingresos,
      devoluciones,
      ventasNetas,
      costo,
      produccion,
      bruta,
      administracion,
      gastosVentas,
      operacional,
      otrosIngresos: pesos(otrosIngresos),
      noOperacionales,
      otrosGastos,
      antesImpuesto,
      impuesto,
      neta,
      ori,
      oriTotal,
      integral: pesos(neta + oriTotal),
    };
  }

  private columnasAl(hasta: string): Record<ColumnaPatrimonio, number> {
    const valores = vacio();
    for (const c of COLUMNAS) {
      valores[c] = saldoAcreedor(this.movs, hasta, new Set(), (m) => m.cuenta.startsWith(c));
    }
    valores['36'] = pesos(valores['36'] + resultadoNoCerrado(this.movs, hasta));
    return valores;
  }

  patrimonio(desde: string, hasta: string): CifrasPatrimonio {
    const grupo = this.entrada.perfil.grupo;
    const filasMov = {
      aportes: vacio(),
      dividendosEfectivo: vacio(),
      dividendosAcciones: vacio(),
      reservas: vacio(),
      traslado: vacio(),
      correccion: vacio(),
      ori: vacio(),
      otros: vacio(),
    };
    for (const lineas of this.asientos.values()) {
      const fecha = lineas[0]?.fecha;
      if (!fecha || fecha < desde || fecha > hasta) continue;
      if (this.cierre.has(lineas[0].asientoId)) continue;
      const todo = vacio();
      for (const m of lineas) {
        const col = COLUMNAS.find((c) => m.cuenta.startsWith(c));
        if (!col) continue;
        todo[col] = pesos(todo[col] + m.credito - m.debito);
      }
      const suma = (pred: (m: Movimiento) => boolean, campo: 'debito' | 'credito') =>
        lineas.reduce((s, m) => s + (pred(m) ? m[campo] : 0), 0);
      const deb37 = suma((m) => m.cuenta.startsWith('37'), 'debito');
      const cr2360 = suma((m) => m.cuenta.startsWith('2360'), 'credito');
      const cr11 = suma((m) => m.cuenta.startsWith('11'), 'credito');
      const cr35 = suma((m) => m.cuenta.startsWith('35'), 'credito');
      const deb36 = suma((m) => m.cuenta.startsWith('36'), 'debito');
      const cr37 = suma((m) => m.cuenta.startsWith('37'), 'credito');
      const cr33 = suma((m) => m.cuenta.startsWith('33'), 'credito');
      const cr34 = suma((m) => m.cuenta.startsWith('34'), 'credito');
      const correccion = lineas.some((m) => m.source === 'correccion_error' || m.source === 'error_periodo_anterior');
      const tomar = (destino: Record<ColumnaPatrimonio, number>, cols: readonly ColumnaPatrimonio[]) => {
        for (const c of cols) {
          destino[c] = pesos(destino[c] + todo[c]);
          todo[c] = 0;
        }
      };
      if (correccion) {
        filasMov.correccion = sumarCols(filasMov.correccion, todo);
        continue;
      }
      if (deb37 > 0 && cr35 > 0 && cr2360 === 0) tomar(filasMov.dividendosAcciones, ['35', '37']);
      else if (deb37 > 0 && (cr2360 > 0 || cr11 > 0)) tomar(filasMov.dividendosEfectivo, ['37']);
      else if ((deb36 > 0 || deb37 > 0) && (cr33 > 0 || cr34 > 0)) tomar(filasMov.reservas, ['33', '34', '36', '37']);
      else if (deb36 > 0 && cr37 > 0) tomar(filasMov.traslado, ['36', '37']);
      else {
        tomar(filasMov.aportes, ['31', '32']);
        if (grupo !== 3) {
          let ori = 0;
          let resto = 0;
          for (const m of lineas) {
            if (!m.cuenta.startsWith('38')) continue;
            const delta = m.credito - m.debito;
            if (cuentaDe(m.cuenta, this.mapa).esOri) ori += delta;
            else resto += delta;
          }
          filasMov.ori['38'] = pesos(filasMov.ori['38'] + ori);
          todo['38'] = pesos(resto);
        }
      }
      filasMov.otros = sumarCols(filasMov.otros, todo);
    }
    const utilidad = vacio();
    utilidad['36'] = utilidadPeriodo(this.movs, desde, hasta, this.cierre);
    const inicial = this.columnasAl(apertura(desde));
    const esperado = this.columnasAl(hasta);
    let acumulado = inicial;
    for (const fila of Object.values(filasMov)) acumulado = sumarCols(acumulado, fila);
    acumulado = sumarCols(acumulado, utilidad);
    for (const c of COLUMNAS) {
      const residuo = pesos(esperado[c] - acumulado[c]);
      if (residuo !== 0) filasMov.otros[c] = pesos(filasMov.otros[c] + residuo);
    }
    const definicion: { id: string; concepto: string; valores: Record<ColumnaPatrimonio, number>; siempre: boolean }[] = [
      { id: 'pat-inicial', concepto: 'Saldo inicial', valores: inicial, siempre: true },
      { id: 'pat-aportes', concepto: 'Aportes', valores: filasMov.aportes, siempre: true },
      { id: 'pat-dividendos-efectivo', concepto: 'Dividendos decretados en efectivo', valores: filasMov.dividendosEfectivo, siempre: true },
      { id: 'pat-dividendos-acciones', concepto: 'Dividendos en acciones', valores: filasMov.dividendosAcciones, siempre: true },
      { id: 'pat-reservas', concepto: 'Constitución de reservas', valores: filasMov.reservas, siempre: true },
      { id: 'pat-traslado', concepto: 'Traslado de resultados a utilidades acumuladas', valores: filasMov.traslado, siempre: true },
      { id: 'pat-correccion', concepto: 'Corrección de errores de periodos anteriores', valores: filasMov.correccion, siempre: true },
    ];
    if (grupo !== 3) {
      definicion.push({ id: 'pat-ori', concepto: 'ORI del periodo', valores: filasMov.ori, siempre: true });
    }
    definicion.push({ id: 'pat-utilidad', concepto: 'Utilidad del periodo', valores: utilidad, siempre: true });
    if (COLUMNAS.some((c) => filasMov.otros[c] !== 0)) {
      definicion.push({ id: 'pat-otros', concepto: 'Otros movimientos', valores: filasMov.otros, siempre: false });
    }
    const filas: FilaPatrimonio[] = definicion.map((f) => ({
      id: f.id,
      concepto: f.concepto,
      valores: f.valores,
      total: totalCols(f.valores),
    }));
    const saldo = COLUMNAS.reduce((acc, c) => {
      acc[c] = pesos(definicion.reduce((s, f) => s + f.valores[c], 0));
      return acc;
    }, vacio());
    filas.push({ id: 'pat-final', concepto: 'Saldo final', valores: saldo, total: totalCols(saldo) });
    const totalFinal = totalCols(saldo);
    const patrimonioBalance = patrimonioContable(this.movs, hasta);
    return { filas, totalFinal, patrimonioBalance, diferencia: pesos(patrimonioBalance - totalFinal) };
  }

  flujo(desde: string, hasta: string): CifrasFlujo {
    const corte = { desde, hasta };
    const ninguno = new Set<number>();
    const utilidad = utilidadPeriodo(this.movs, desde, hasta, this.cierre);
    const depreciacion = sumaCreditos(this.movs, corte, ninguno, (m) => bajo(m.cuenta, ['1592', '1598', '1399', '1499']));
    const otrasProvisiones = this.otrasProvisiones(desde, hasta);
    const utilidadVenta = neto(this.movs, corte, ninguno, (m) => m.cuenta.startsWith('4245'), true);
    const perdidaVenta = neto(this.movs, corte, ninguno, (m) => m.cuenta.startsWith('5310'), false);
    const variacionDeudores = neto(this.movs, corte, ninguno, (m) => bajo(m.cuenta, ['13'], ['1399']), false);
    const variacionInventarios = neto(this.movs, corte, ninguno, (m) => bajo(m.cuenta, ['14'], ['1499']), false);
    const variacionOtrosActivos = neto(this.movs, corte, ninguno, (m) => m.cuenta.startsWith('17'), false);
    const variacionPasivos = pesos(
      neto(this.movs, corte, ninguno, (m) => m.cuenta.startsWith('22'), true)
      + neto(this.movs, corte, ninguno, (m) => bajo(m.cuenta, ['23'], ['2360']), true)
      + neto(this.movs, corte, ninguno, (m) => bajo(m.cuenta, ['24', '25', '26', '27', '28']), true),
    );
    const operacion = pesos(
      utilidad + depreciacion + otrasProvisiones - utilidadVenta + perdidaVenta
      - variacionDeudores - variacionInventarios - variacionOtrosActivos + variacionPasivos,
    );
    const comprasActivos = sumaDebitos(this.movs, corte, ninguno, (m) => this.esBruto(m.cuenta));
    let ventaActivos = 0;
    let declarados = 0;
    for (const lineas of this.asientos.values()) {
      const fecha = lineas[0]?.fecha;
      if (!fecha || fecha < desde || fecha > hasta) continue;
      const vende = lineas.some((m) => (this.esBruto(m.cuenta) && m.credito > 0) || (m.cuenta.startsWith('4245') && m.credito > 0));
      if (vende) {
        ventaActivos += lineas.reduce((s, m) => s + (esEfectivo(m.cuenta, this.mapa) ? m.debito : 0), 0);
      }
      const deb37 = lineas.reduce((s, m) => s + (m.cuenta.startsWith('37') ? m.debito : 0), 0);
      const cr2360 = lineas.reduce((s, m) => s + (m.cuenta.startsWith('2360') ? m.credito : 0), 0);
      const cr11 = lineas.reduce((s, m) => s + (m.cuenta.startsWith('11') ? m.credito : 0), 0);
      if (deb37 > 0 && cr2360 > 0) declarados += Math.min(deb37, cr2360);
      else if (deb37 > 0 && cr11 > 0 && cr2360 === 0) declarados += Math.min(deb37, cr11);
    }
    const inversion = pesos(-comprasActivos + ventaActivos);
    const obligaciones = neto(this.movs, corte, ninguno, (m) => m.cuenta.startsWith('21'), true);
    const aportes = neto(this.movs, corte, ninguno, (m) => bajo(m.cuenta, ['31', '32']), true);
    const aumentoDividendos = neto(this.movs, corte, ninguno, (m) => m.cuenta.startsWith('2360'), true);
    const dividendosPagados = pesos(declarados - aumentoDividendos);
    const financiacion = pesos(obligaciones + aportes - dividendosPagados);
    const efectivo = neto(this.movs, corte, ninguno, (m) => esEfectivo(m.cuenta, this.mapa), false);
    const diferencia = pesos(efectivo - (operacion + inversion + financiacion));
    return {
      utilidad,
      depreciacion,
      otrasProvisiones,
      utilidadVenta,
      perdidaVenta,
      variacionDeudores,
      variacionInventarios,
      variacionOtrosActivos,
      variacionPasivos,
      operacion,
      comprasActivos,
      ventaActivos: pesos(ventaActivos),
      inversion,
      obligaciones,
      aportes,
      dividendosPagados,
      financiacion,
      efectivo,
      diferencia,
    };
  }

  private esBruto(cuenta: string): boolean {
    if (!bajo(cuenta, ['12', '15', '16', '18'])) return false;
    if (esContra(cuenta)) return false;
    const meta = cuentaDe(cuenta, this.mapa);
    if (esEquivalente(meta)) return false;
    if (meta.naturaleza === 'credito') return false;
    return true;
  }

  private otrasProvisiones(desde: string, hasta: string): number {
    let total = 0;
    for (const lineas of this.asientos.values()) {
      const fecha = lineas[0]?.fecha;
      if (!fecha || fecha < desde || fecha > hasta) continue;
      const gasto = lineas.reduce((s, m) => s + (['5', '6', '7'].includes(claseDe(m.cuenta)) ? m.debito : 0), 0);
      const otroDebito = lineas.reduce((s, m) => s + (!['5', '6', '7'].includes(claseDe(m.cuenta)) ? m.debito : 0), 0);
      if (gasto <= 0 || otroDebito > 0) continue;
      for (const m of lineas) {
        if (m.credito <= 0 || this.creditoExplicado(m.cuenta)) continue;
        total += m.credito;
      }
    }
    return pesos(total);
  }

  private creditoExplicado(cuenta: string): boolean {
    if (esEfectivo(cuenta, this.mapa) || esContra(cuenta)) return true;
    if (bajo(cuenta, ['12', '13', '14', '15', '16', '17', '18', '21', '22', '23', '24', '25', '26', '27', '28', '31', '32', '33', '34', '35', '36', '37', '38'])) return true;
    return ['4', '5', '6', '7'].includes(claseDe(cuenta));
  }

  indicadores(desde: string, hasta: string): CifrasIndicadores {
    const sit = this.situacion(hasta);
    const res = this.resultados(desde, hasta);
    const inicio = apertura(desde);
    const sitInicio = this.situacion(inicio);
    const veces = (num: number, den: number): number | null => (den === 0 ? null : Math.round((num / den) * 100) / 100);
    const porcentaje = (num: number, den: number): number | null => (den === 0 ? null : Math.round((num / den) * 10000) / 100);
    const ventasCredito = this.ventasCredito(desde, hasta);
    const promedio = (a: number, b: number) => pesos((a + b) / 2);
    const prom1305 = promedio(this.saldoPrefijo('1305', inicio, false), this.saldoPrefijo('1305', hasta, false));
    const prom14 = promedio(sitInicio.inventarios, sit.inventarios);
    const prom2205 = promedio(this.saldoPrefijo('2205', inicio, true), this.saldoPrefijo('2205', hasta, true));
    const compras = sumaCreditos(this.movs, { desde, hasta }, new Set(), (m) => m.cuenta.startsWith('2205'));
    const activoProm = promedio(sitInicio.activo, sit.activo);
    const patrimonioProm = promedio(sitInicio.patrimonio, sit.patrimonio);
    const dias = (prom: number, base: number) => (base === 0 ? null : Math.round((prom / base) * 365));
    return {
      activoCorriente: sit.activoCorriente,
      pasivoCorriente: sit.pasivoCorriente,
      razonCorriente: veces(sit.activoCorriente, sit.pasivoCorriente),
      pruebaAcida: veces(pesos(sit.activoCorriente - sit.inventarios), sit.pasivoCorriente),
      capitalTrabajo: pesos(sit.activoCorriente - sit.pasivoCorriente),
      endeudamiento: porcentaje(sit.pasivo, sit.activo),
      apalancamiento: porcentaje(sit.pasivo, sit.patrimonio),
      ventasNetas: res.ventasNetas,
      margenBruto: porcentaje(pesos(res.ventasNetas - res.costo), res.ventasNetas),
      margenOperacional: porcentaje(res.operacional, res.ventasNetas),
      margenNeto: porcentaje(res.neta, res.ventasNetas),
      roa: porcentaje(res.neta, activoProm),
      roe: porcentaje(res.neta, patrimonioProm),
      ebitda: pesos(res.operacional + this.flujo(desde, hasta).depreciacion),
      diasCartera: dias(prom1305, ventasCredito),
      diasInventario: dias(prom14, res.costo),
      diasProveedores: dias(prom2205, compras),
    };
  }

  private saldoPrefijo(prefijo: string, hasta: string, acreedor: boolean): number {
    return acreedor
      ? saldoAcreedor(this.movs, hasta, new Set(), (m) => m.cuenta.startsWith(prefijo))
      : saldoDeudor(this.movs, hasta, new Set(), (m) => m.cuenta.startsWith(prefijo));
  }

  private ventasCredito(desde: string, hasta: string): number {
    let total = 0;
    for (const lineas of this.asientos.values()) {
      const fecha = lineas[0]?.fecha;
      if (!fecha || fecha < desde || fecha > hasta || this.cierre.has(lineas[0].asientoId)) continue;
      const llevaCartera = lineas.some((m) => m.cuenta.startsWith('13') && !m.cuenta.startsWith('1399') && m.debito > 0);
      if (!llevaCartera) continue;
      for (const m of lineas) {
        if (m.cuenta.startsWith('41') && !m.cuenta.startsWith('4175')) total += m.credito - m.debito;
      }
    }
    return pesos(total);
  }

  equilibrio(desde: string, hasta: string): CifrasEquilibrio {
    const res = this.resultados(desde, hasta);
    let variables = 0;
    let fijos = 0;
    const corte = { desde, hasta, excluirCierre: true as const };
    for (const codigo of this.codes((c) => claseDe(c) === '5' || claseDe(c) === '6')) {
      const cuenta = cuentaDe(codigo, this.mapa);
      const saldo = neto(this.movs, corte, this.cierre, (m) => m.cuenta === codigo, false);
      if (esCostoVariable(cuenta)) variables += saldo;
      else if (esCostoFijo(cuenta)) fijos += saldo;
    }
    variables = pesos(variables);
    fijos = pesos(fijos);
    const ventas = res.ventasNetas;
    const unidades = this.entrada.contribucion.reduce((s, l) => s + (Number.isFinite(l.unidades) ? l.unidades : 0), 0);
    if (ventas <= 0 || variables >= ventas) {
      return { ventas, costosVariables: variables, costosFijos: fijos, razon: null, puntoPesos: null, unidadesVendidas: unidades, puntoUnidades: null };
    }
    const razon = Math.round((variables / ventas) * 10000) / 10000;
    const puntoPesos = pesos(fijos / (1 - variables / ventas));
    const puntoUnidades = unidades > 0 ? Math.round((puntoPesos / (ventas / unidades)) * 100) / 100 : null;
    return { ventas, costosVariables: variables, costosFijos: fijos, razon, puntoPesos, unidadesVendidas: unidades, puntoUnidades };
  }

  rangoAnterior(): { desde: string; hasta: string } {
    return { desde: restarAnio(this.entrada.desde), hasta: restarAnio(this.entrada.hasta) };
  }

  variacionDe(actual: number, anterior: number): { variacion: number; porcentaje: number | null } {
    return variacion(actual, anterior);
  }
}
