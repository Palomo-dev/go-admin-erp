/**
 * Embargos, préstamos y descuentos autorizados, con sus límites y su orden
 * (ADR-003 §2.7; investigación §11.3).
 *
 * Orden de prelación:
 * 1. Deducciones de ley (salud, pensión, FSP y retención): ya vienen restadas.
 * 2. Embargos por alimentos, luego de cooperativas, luego ordinarios; dentro de
 *    cada clase, por orden de llegada.
 * 3. Préstamos de la empresa (cuota limitada por `max_deduction_pct`).
 * 4. Libranzas y otros descuentos autorizados.
 *
 * Límites:
 * - Base de embargo = salario devengado del período − deducciones de ley. El
 *   auxilio de transporte y los pagos no salariales quedan fuera.
 * - Todos los embargos juntos: hasta `embargo_alimentos_max` (50 %) de esa base
 *   (CST 156, alimentos y cooperativas).
 * - Un oficio de alimentos o de cooperativa puede ordenar que la base incluya
 *   también la prima, las cesantías y sus intereses (CST 344; Ley 1098, art. 130):
 *   `incluye_prestaciones`. Para ese oficio la base y el tope del 50 % se miden con
 *   las prestaciones del período (respuesta P20 del Contador, 2026-11-16).
 * - Embargos ordinarios: además, solo `embargo_fraccion_excedente` (1/5) de lo que
 *   el salario devengado excede al SMMLV del período (CST 154 y 155).
 * - Préstamos, libranzas y otros: el 50 % (`libranza_neto_minimo`) se mide sobre el
 *   salario neto después de las deducciones de ley, sin el auxilio de transporte; el
 *   trabajador conserva ese 50 % después de los embargos, y además recibe el
 *   auxilio completo: la libranza no se paga con el auxilio (Ley 1527, art. 3,
 *   modificado por la Ley 1902; respuesta P21 del Contador).
 * Lo que no cabe no se descuenta: queda como alerta y como saldo para el próximo período.
 */

export interface Embargo {
  id: string;
  tipo: 'alimentos' | 'cooperativa' | 'ordinario';
  /** Fecha de recibo del oficio: define el orden entre los de la misma clase. */
  recibido: string;
  modo: 'fijo' | 'porcentaje';
  /** Pesos (fijo) o fracción de la base de embargo (porcentaje: 0.3 = 30 %). */
  valor: number;
  /** Saldo pendiente del embargo; `null` = sin tope (alimentos periódicos). */
  saldo: number | null;
  /** Solo alimentos y cooperativas: el oficio ordena embargar también las prestaciones. */
  incluye_prestaciones?: boolean;
}

export interface CuotaPrestamo {
  cuota_id: string;
  prestamo_id: string;
  valor: number;
  /** `employee_loans.max_deduction_pct`, en porcentaje (30 = 30 %). */
  max_deduccion_pct: number | null;
}

export interface DescuentoAutorizado {
  id: string;
  concepto: string;
  valor: number;
}

export interface EntradaDeducciones {
  devengado: number;
  salarial: number;
  /** Prima, intereses de cesantías y cesantías pagadas al trabajador en el período. */
  prestaciones?: number;
  deducciones_ley: number;
  smmlv_periodo: number;
  fraccion_alimentos: number;
  fraccion_excedente: number;
  neto_minimo_libranza: number;
  embargos: readonly Embargo[];
  prestamos: readonly CuotaPrestamo[];
  otros: readonly DescuentoAutorizado[];
}

export interface DeduccionAplicada {
  concepto: string;
  valor: number;
  fuente: { tipo: string; id: string };
  detalle?: Record<string, unknown>;
}

export interface ResultadoDeducciones {
  aplicados: DeduccionAplicada[];
  alertas: Array<{ codigo: string; severidad: 'aviso' | 'bloqueo'; detalle?: Record<string, unknown> }>;
  base_embargo: number;
}

const ORDEN_EMBARGO: Record<Embargo['tipo'], number> = { alimentos: 0, cooperativa: 1, ordinario: 2 };
const CONCEPTO_EMBARGO: Record<Embargo['tipo'], string> = {
  alimentos: 'EMBARGO_ALIMENTOS',
  cooperativa: 'EMBARGO_COOPERATIVA',
  ordinario: 'EMBARGO_ORDINARIO',
};

function peso(x: number): number {
  return Math.max(0, Math.floor(x + 1e-9));
}

export function aplicarDeducciones(e: EntradaDeducciones): ResultadoDeducciones {
  const aplicados: DeduccionAplicada[] = [];
  const alertas: ResultadoDeducciones['alertas'] = [];
  const base = Math.max(0, e.salarial - e.deducciones_ley);
  const prestaciones = Math.max(0, e.prestaciones ?? 0);
  // Lo que le queda al trabajador después de las deducciones de ley (incluye lo no salarial).
  let disponible = Math.max(0, e.devengado - e.deducciones_ley);

  // 2. Embargos. Un solo tope del 50 % para todos; el oficio que incluye prestaciones
  // lo mide sobre la base más las prestaciones.
  const tope = peso(base * e.fraccion_alimentos);
  const topeConPrestaciones = peso((base + prestaciones) * e.fraccion_alimentos);
  let usado = 0;
  let embargado = 0;
  let cupoOrdinario = peso(Math.max(0, e.salarial - e.smmlv_periodo) * e.fraccion_excedente);
  const embargos = [...e.embargos].sort((a, b) => ORDEN_EMBARGO[a.tipo] - ORDEN_EMBARGO[b.tipo] || a.recibido.localeCompare(b.recibido) || a.id.localeCompare(b.id));
  for (const em of embargos) {
    const conPrest = Boolean(em.incluye_prestaciones) && em.tipo !== 'ordinario';
    const baseEm = conPrest ? base + prestaciones : base;
    let pedido = em.modo === 'porcentaje' ? baseEm * em.valor : em.valor;
    if (em.saldo !== null) pedido = Math.min(pedido, em.saldo);
    pedido = peso(pedido);
    let cabe = Math.max(0, Math.min(pedido, (conPrest ? topeConPrestaciones : tope) - usado, disponible));
    if (em.tipo === 'ordinario') cabe = Math.min(cabe, cupoOrdinario);
    if (cabe > 0) {
      aplicados.push({
        concepto: CONCEPTO_EMBARGO[em.tipo],
        valor: cabe,
        fuente: { tipo: 'hr_garnishments', id: em.id },
        detalle: { pedido, base_embargo: peso(baseEm), incluye_prestaciones: conPrest },
      });
      usado += cabe;
      disponible -= cabe;
      embargado += cabe;
      if (em.tipo === 'ordinario') cupoOrdinario -= cabe;
    }
    if (cabe < pedido) alertas.push({ codigo: 'embargo_limitado', severidad: 'aviso', detalle: { embargo: em.id, pedido, aplicado: cabe } });
  }

  // 3 y 4. Préstamos y descuentos autorizados: salen del salario neto (sin auxilio ni
  // pagos no salariales) que queda después de los embargos, y el trabajador conserva
  // el 50 % del salario neto de ley.
  const piso = peso(base * e.neto_minimo_libranza);
  let libre = Math.max(0, Math.min(disponible, base - embargado - piso));
  for (const pr of e.prestamos) {
    const pct = pr.max_deduccion_pct === null || pr.max_deduccion_pct === undefined ? null : pr.max_deduccion_pct / 100;
    const topePct = pct === null ? Infinity : peso(base * pct);
    const cabe = Math.max(0, Math.min(peso(pr.valor), topePct, libre));
    if (cabe > 0) {
      aplicados.push({ concepto: 'PRESTAMO', valor: cabe, fuente: { tipo: 'loan_installments', id: pr.cuota_id }, detalle: { prestamo_id: pr.prestamo_id, cuota: peso(pr.valor), tope_pct: pr.max_deduccion_pct, piso_libranza: piso } });
      libre -= cabe;
      disponible -= cabe;
    }
    if (cabe < peso(pr.valor)) alertas.push({ codigo: 'cuota_prestamo_limitada', severidad: 'aviso', detalle: { cuota: pr.cuota_id, cuota_valor: peso(pr.valor), aplicado: cabe } });
  }
  for (const o of e.otros) {
    const cabe = Math.max(0, Math.min(peso(o.valor), libre));
    if (cabe > 0) {
      aplicados.push({ concepto: o.concepto, valor: cabe, fuente: { tipo: 'hr_payroll_novelties', id: o.id } });
      libre -= cabe;
      disponible -= cabe;
    }
    if (cabe < peso(o.valor)) alertas.push({ codigo: 'descuento_limitado', severidad: 'aviso', detalle: { novedad: o.id, pedido: peso(o.valor), aplicado: cabe } });
  }
  return { aplicados, alertas, base_embargo: peso(base) };
}
