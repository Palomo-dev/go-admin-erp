/**
 * 41 líneas de asientos automáticos. Cada línea es una regla configurable:
 * la cuenta se puede reemplazar por id sin cambiar el débito, el crédito
 * ni el cuadre. Los montos en cero se omiten. No se agregan líneas fuera
 * de las 41 (la devolución en compras no inventa el reverso de retenciones).
 */

import { cuentaAuxiliarDeTitulo } from '../cuentaAuxiliarDeTitulo';

export type EventoAsiento =
  | 'venta_contado'
  | 'compra_credito'
  | 'venta_retenciones'
  | 'propina_cobrada'
  | 'propina_repartida'
  | 'venta_pasarela'
  | 'liquidacion_pasarela'
  | 'devolucion_ventas'
  | 'devolucion_compras'
  | 'transferencia_bancos'
  | 'cierre_anual';

export type LadoAsiento = 'debito' | 'credito';

export type LadoRegla = LadoAsiento | 'segun_saldo';

export type RolValor =
  | 'total'
  | 'base'
  | 'iva'
  | 'costo'
  | 'retefuente'
  | 'reteiva'
  | 'reteica'
  | 'neto'
  | 'comision'
  | 'iva_comision'
  | 'retenciones_red'
  | 'propina'
  | 'valor'
  | 'saldos'
  | 'resultado';

export type TerceroRegla =
  | 'cliente'
  | 'cliente_retenedor'
  | 'proveedor'
  | 'pasarela'
  | 'banco'
  | 'banco_destino'
  | 'banco_origen'
  | 'empleados'
  | 'ninguno';

export type CondicionRegla = 'agente_retencion' | 'factura_comision' | null;

export interface ReglaAsiento {
  id: number;
  evento: EventoAsiento;
  linea: number;
  cuenta: string;
  alternativas: readonly string[];
  lado: LadoRegla;
  rol: RolValor;
  tercero: TerceroRegla;
  condicion: CondicionRegla;
  nota: string;
}

export const REGLAS_ASIENTO: readonly ReglaAsiento[] = [
  regla(1, 'venta_contado', 1, '1105', 'debito', 'total', 'cliente'),
  regla(2, 'venta_contado', 2, '4135', 'credito', 'base', 'cliente'),
  regla(3, 'venta_contado', 3, '2408', 'credito', 'iva', 'cliente'),
  regla(4, 'venta_contado', 4, '61350501', 'debito', 'costo', 'ninguno'),
  regla(5, 'venta_contado', 5, '1435', 'credito', 'costo', 'ninguno'),

  regla(6, 'compra_credito', 1, '1435', 'debito', 'base', 'proveedor'),
  regla(7, 'compra_credito', 2, '2408', 'debito', 'iva', 'proveedor'),
  regla(8, 'compra_credito', 3, '2365', 'credito', 'retefuente', 'proveedor', 'agente_retencion', 'Solo si la empresa es agente de retención.'),
  regla(9, 'compra_credito', 4, '2367', 'credito', 'reteiva', 'proveedor', 'agente_retencion', 'Solo si la empresa es agente de retención.'),
  regla(10, 'compra_credito', 5, '2368', 'credito', 'reteica', 'proveedor', 'agente_retencion', 'Solo si la empresa es agente de retención.'),
  regla(11, 'compra_credito', 6, '2205', 'credito', 'neto', 'proveedor'),

  regla(12, 'venta_retenciones', 1, '1110', 'debito', 'neto', 'cliente', null, 'Soporta autorretención. Alternativa 1305.', ['1305']),
  regla(13, 'venta_retenciones', 2, '135515', 'debito', 'retefuente', 'cliente_retenedor'),
  regla(14, 'venta_retenciones', 3, '135517', 'debito', 'reteiva', 'cliente_retenedor'),
  regla(15, 'venta_retenciones', 4, '135518', 'debito', 'reteica', 'cliente_retenedor'),
  regla(16, 'venta_retenciones', 5, '1305', 'credito', 'total', 'cliente'),

  regla(17, 'propina_cobrada', 1, '1105', 'debito', 'propina', 'ninguno', null, '', ['1110']),
  regla(18, 'propina_cobrada', 2, '2815', 'credito', 'propina', 'empleados', null, 'Ley 1935 de 2018: voluntaria, de los trabajadores, fuera de la base de impuesto al consumo y de IVA, separada en la factura.'),

  regla(19, 'propina_repartida', 1, '2815', 'debito', 'propina', 'empleados'),
  regla(20, 'propina_repartida', 2, '1105', 'credito', 'propina', 'ninguno'),

  regla(21, 'venta_pasarela', 1, '1305', 'debito', 'total', 'pasarela'),
  regla(22, 'venta_pasarela', 2, '4135', 'credito', 'base', 'ninguno'),
  regla(23, 'venta_pasarela', 3, '2408', 'credito', 'iva', 'ninguno'),

  regla(24, 'liquidacion_pasarela', 1, '1110', 'debito', 'neto', 'banco', null, 'Conciliar con el extracto de cada pasarela.'),
  regla(25, 'liquidacion_pasarela', 2, '53051501', 'debito', 'comision', 'pasarela'),
  regla(26, 'liquidacion_pasarela', 3, '2408', 'debito', 'iva_comision', 'pasarela', 'factura_comision', 'Solo si la facturan.'),
  regla(27, 'liquidacion_pasarela', 4, '1355', 'debito', 'retenciones_red', 'pasarela'),
  regla(28, 'liquidacion_pasarela', 5, '1305', 'credito', 'total', 'pasarela'),

  regla(29, 'devolucion_ventas', 1, '4175', 'debito', 'base', 'cliente'),
  regla(30, 'devolucion_ventas', 2, '2408', 'debito', 'iva', 'cliente'),
  regla(31, 'devolucion_ventas', 3, '1305', 'credito', 'total', 'cliente', null, '', ['1105']),
  regla(32, 'devolucion_ventas', 4, '1435', 'debito', 'costo', 'ninguno'),
  regla(33, 'devolucion_ventas', 5, '61350501', 'credito', 'costo', 'ninguno'),

  regla(34, 'devolucion_compras', 1, '2205', 'debito', 'total', 'proveedor'),
  regla(35, 'devolucion_compras', 2, '1435', 'credito', 'base', 'proveedor'),
  regla(36, 'devolucion_compras', 3, '2408', 'credito', 'iva', 'proveedor', null, 'Reversar también las retenciones practicadas. Esa nota no agrega líneas: el catálogo se queda en 41.'),

  regla(37, 'transferencia_bancos', 1, '1110', 'debito', 'valor', 'banco_destino', null, 'Cada banco es un auxiliar de 1110 o 1120.', ['1120']),
  regla(38, 'transferencia_bancos', 2, '1110', 'credito', 'valor', 'banco_origen', null, 'Cada banco es un auxiliar de 1110 o 1120.', ['1120']),

  regla(39, 'cierre_anual', 1, '456', 'segun_saldo', 'saldos', 'ninguno', null, 'Cancelar las clases 4, 5 y 6 contra 5905. La clase 7 no entra.'),
  regla(40, 'cierre_anual', 2, '5905', 'segun_saldo', 'saldos', 'ninguno', null, 'Puente de ganancias y pérdidas.'),
  regla(41, 'cierre_anual', 3, '3605', 'segun_saldo', 'resultado', 'ninguno', null, 'Utilidad al crédito de 3605. Pérdida al débito de 3610.', ['3610']),
];

export interface ConfigAsientos {
  /** Reemplaza la cuenta de una línea. La 39 no se reemplaza: son los saldos. */
  cuentas: Partial<Record<number, string>>;
  agenteRetenedor: boolean;
  facturanIvaComision: boolean;
  autorretencion: boolean;
  auxiliarDestino: string | null;
  auxiliarOrigen: string | null;
  cuentaUtilidad: string;
  cuentaPerdida: string;
  cuentaPuente: string;
  /**
   * Mapeo por clave o sede (código de grupo → auxiliar), mismo criterio que
   * fn_cuenta_auxiliar_de_titulo. Sin mapeo: 61350501 (costo) y 53051501 (comisión).
   */
  mapeoSede?: Readonly<Partial<Record<string, string>>>;
}

export const CONFIG_ASIENTOS_INICIAL: ConfigAsientos = {
  cuentas: {},
  agenteRetenedor: false,
  facturanIvaComision: false,
  autorretencion: false,
  auxiliarDestino: null,
  auxiliarOrigen: null,
  cuentaUtilidad: '3605',
  cuentaPerdida: '3610',
  cuentaPuente: '5905',
};

export interface MontosAsiento {
  total?: number;
  base?: number;
  iva?: number;
  costo?: number;
  retefuente?: number;
  reteiva?: number;
  reteica?: number;
  neto?: number;
  comision?: number;
  ivaComision?: number;
  retencionesRed?: number;
  propina?: number;
  valor?: number;
}

export interface LineaGenerada {
  id: number;
  evento: EventoAsiento;
  cuenta: string;
  lado: LadoAsiento;
  centavos: number;
  tercero: TerceroRegla;
  autorretencion: boolean;
}

export interface AsientoArmado {
  evento: EventoAsiento;
  lineas: LineaGenerada[];
  debitosCentavos: number;
  creditosCentavos: number;
  cuadra: boolean;
}

export interface SaldoCierre {
  cuenta: string;
  /** Positivo = saldo débito. Negativo = saldo crédito. */
  saldoDebito: number;
}

export interface CierreArmado extends AsientoArmado {
  omitidas: string[];
}

export function configurarRegla(config: ConfigAsientos, id: number, cuenta: string): ConfigAsientos {
  if (id < 1 || id > 41 || id === 39) throw new Error('Esa línea no admite una cuenta de reemplazo');
  return { ...config, cuentas: { ...config.cuentas, [id]: cuentaPuc(cuenta) } };
}

export function armarAsiento(
  evento: Exclude<EventoAsiento, 'cierre_anual'>,
  montos: MontosAsiento,
  config: ConfigAsientos = CONFIG_ASIENTOS_INICIAL,
): AsientoArmado {
  const reglas = REGLAS_ASIENTO.filter((item) => item.evento === evento);
  const preparados = prepararMontos(evento, montos, config);
  const lineas: LineaGenerada[] = [];
  for (const item of reglas) {
    if (item.condicion === 'agente_retencion' && !config.agenteRetenedor) continue;
    if (item.condicion === 'factura_comision' && !config.facturanIvaComision) continue;
    const centavos = centavosDeRol(item.rol, preparados);
    if (centavos === 0) continue;
    lineas.push({
      id: item.id,
      evento,
      cuenta: cuentaDeRegla(item, config),
      lado: item.lado === 'segun_saldo' ? 'debito' : item.lado,
      centavos,
      tercero: item.tercero,
      autorretencion: evento === 'venta_retenciones' && config.autorretencion,
    });
  }
  return cerrar(evento, lineas);
}

export function exigirCuadre(asiento: AsientoArmado): AsientoArmado {
  if (!asiento.cuadra || asiento.lineas.length === 0) {
    throw new Error('El asiento no cuadra');
  }
  return asiento;
}

/**
 * Cierra las clases 4, 5 y 6 contra 5905 y lleva el resultado a 3605 o 3610.
 * La clase 7 se omite. 3610 queda al débito cuando hay pérdida.
 */
export function armarCierreAnual(
  saldos: readonly SaldoCierre[],
  config: ConfigAsientos = CONFIG_ASIENTOS_INICIAL,
): CierreArmado {
  const lineas: LineaGenerada[] = [];
  const omitidas: string[] = [];
  let debitoPuente = 0;
  let creditoPuente = 0;
  for (const saldo of saldos) {
    const cuenta = cuentaPuc(saldo.cuenta);
    const centavos = Math.round(saldo.saldoDebito * 100);
    if (!Number.isFinite(centavos)) throw new Error('Saldo de cierre inválido');
    if (centavos === 0) continue;
    const clase = cuenta[0];
    if (clase === '7') {
      omitidas.push(cuenta);
      continue;
    }
    if (clase !== '4' && clase !== '5' && clase !== '6') {
      throw new Error('El cierre solo cancela las clases 4, 5 y 6');
    }
    if (centavos > 0) {
      lineas.push(lineaCierre(39, cuenta, 'credito', centavos));
      debitoPuente += centavos;
    } else {
      lineas.push(lineaCierre(39, cuenta, 'debito', -centavos));
      creditoPuente += -centavos;
    }
  }
  const puente = cuentaPuc(config.cuentaPuente || '5905');
  if (creditoPuente > 0) lineas.push(lineaCierre(40, puente, 'credito', creditoPuente));
  if (debitoPuente > 0) lineas.push(lineaCierre(40, puente, 'debito', debitoPuente));
  const neto = debitoPuente - creditoPuente;
  if (neto < 0) {
    const valor = -neto;
    lineas.push(lineaCierre(40, puente, 'debito', valor));
    lineas.push(lineaCierre(41, cuentaPuc(config.cuentaUtilidad || '3605'), 'credito', valor));
  } else if (neto > 0) {
    const valor = neto;
    lineas.push(lineaCierre(41, cuentaPuc(config.cuentaPerdida || '3610'), 'debito', valor));
    lineas.push(lineaCierre(40, puente, 'credito', valor));
  }
  return { ...cerrar('cierre_anual', lineas), omitidas };
}

function prepararMontos(evento: EventoAsiento, montos: MontosAsiento, config: ConfigAsientos): MontosAsiento {
  const base = positivo(montos.base);
  const iva = positivo(montos.iva);
  const costo = positivo(montos.costo);
  const retefuente = positivo(montos.retefuente);
  const reteiva = positivo(montos.reteiva);
  const reteica = positivo(montos.reteica);
  const comision = positivo(montos.comision);
  const ivaComision = positivo(montos.ivaComision);
  const retencionesRed = positivo(montos.retencionesRed);
  const propina = positivo(montos.propina);
  const valor = positivo(montos.valor);
  const retenciones = retefuente + reteiva + reteica;
  let neto = montos.neto === undefined ? undefined : positivo(montos.neto);
  let total = montos.total === undefined ? undefined : positivo(montos.total);

  if (evento === 'compra_credito' && neto === undefined) {
    const practicar = config.agenteRetenedor ? retenciones : 0;
    neto = base + iva - practicar;
  }
  if (evento === 'venta_retenciones' && total === undefined && neto !== undefined) {
    total = neto + retenciones;
  }
  if (evento === 'venta_contado' && total === undefined) total = base + iva;
  if (evento === 'venta_pasarela' && total === undefined) total = base + iva;
  if (evento === 'devolucion_ventas' && total === undefined) total = base + iva;
  if (evento === 'devolucion_compras' && total === undefined) total = base + iva;
  if (evento === 'liquidacion_pasarela' && total === undefined && neto !== undefined) {
    const ivaIncluido = config.facturanIvaComision ? ivaComision : 0;
    total = neto + comision + ivaIncluido + retencionesRed;
  }
  return {
    total, base, iva, costo, retefuente, reteiva, reteica, neto, comision, ivaComision, retencionesRed, propina, valor,
  };
}

function centavosDeRol(rol: RolValor, montos: MontosAsiento): number {
  const mapa: Record<RolValor, number | undefined> = {
    total: montos.total,
    base: montos.base,
    iva: montos.iva,
    costo: montos.costo,
    retefuente: montos.retefuente,
    reteiva: montos.reteiva,
    reteica: montos.reteica,
    neto: montos.neto,
    comision: montos.comision,
    iva_comision: montos.ivaComision,
    retenciones_red: montos.retencionesRed,
    propina: montos.propina,
    valor: montos.valor,
    saldos: undefined,
    resultado: undefined,
  };
  const pesos = mapa[rol];
  if (pesos === undefined) return 0;
  return Math.round(pesos * 100);
}

function cuentaDeRegla(item: ReglaAsiento, config: ConfigAsientos): string {
  const reemplazo = config.cuentas[item.id];
  if (item.id === 37 || item.id === 38) {
    const auxiliar = reemplazo || (item.id === 37 ? config.auxiliarDestino : config.auxiliarOrigen);
    if (!auxiliar) throw new Error('La transferencia exige el auxiliar de cada banco');
    return auxiliarBanco(auxiliar);
  }
  if (item.id === 4 || item.id === 33) {
    return cuentaPuc(cuentaAuxiliarDeTitulo(reemplazo || '6135', { mapeoSede: config.mapeoSede }));
  }
  if (item.id === 25) {
    return cuentaPuc(cuentaAuxiliarDeTitulo(reemplazo || '530515', { mapeoSede: config.mapeoSede }));
  }
  if (reemplazo) return cuentaPuc(reemplazo);
  return cuentaPuc(item.cuenta);
}

function auxiliarBanco(codigo: string): string {
  const c = cuentaPuc(codigo);
  const grupo = c.startsWith('1110') || c.startsWith('1120');
  if (!grupo || c.length < 6) {
    throw new Error('Cada cuenta bancaria es un auxiliar de 1110 o 1120');
  }
  return c;
}

function lineaCierre(id: number, cuenta: string, lado: LadoAsiento, centavos: number): LineaGenerada {
  return {
    id,
    evento: 'cierre_anual',
    cuenta,
    lado,
    centavos,
    tercero: 'ninguno',
    autorretencion: false,
  };
}

function cerrar(evento: EventoAsiento, lineas: LineaGenerada[]): AsientoArmado {
  if (evento === 'transferencia_bancos') {
    const destino = lineas.find((linea) => linea.id === 37);
    const origen = lineas.find((linea) => linea.id === 38);
    if (destino && origen && destino.cuenta === origen.cuenta) {
      throw new Error('El auxiliar de destino y el de origen son distintos');
    }
  }
  let debitosCentavos = 0;
  let creditosCentavos = 0;
  for (const linea of lineas) {
    if (linea.lado === 'debito') debitosCentavos += linea.centavos;
    else creditosCentavos += linea.centavos;
  }
  return {
    evento,
    lineas,
    debitosCentavos,
    creditosCentavos,
    cuadra: debitosCentavos === creditosCentavos,
  };
}

function positivo(valor: number | undefined): number {
  if (valor === undefined) return 0;
  if (!Number.isFinite(valor) || valor < 0) throw new Error('El monto va en cero o positivo');
  return valor;
}

function cuentaPuc(valor: string): string {
  const codigo = valor.trim();
  if (!/^\d+$/.test(codigo)) throw new Error('La cuenta configurable es numérica');
  const longitud = codigo.length;
  const parValido = longitud === 1 || longitud === 2 || longitud === 4 || longitud === 6 || longitud === 8 || (longitud >= 10 && longitud % 2 === 0);
  if (!parValido) throw new Error('La longitud del código PUC no corresponde a un nivel');
  return codigo;
}

function regla(
  id: number,
  evento: EventoAsiento,
  linea: number,
  cuenta: string,
  lado: LadoRegla,
  rol: RolValor,
  tercero: TerceroRegla,
  condicion: CondicionRegla = null,
  nota = '',
  alternativas: readonly string[] = [],
): ReglaAsiento {
  return { id, evento, linea, cuenta, alternativas, lado, rol, tercero, condicion, nota };
}
