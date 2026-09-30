// ============================================================
// Reportes Contables
// Llama a las RPCs: fn_reporte_estado_resultados, fn_reporte_resultados_desglose,
// fn_reporte_balance_general, fn_reporte_presupuesto_vs_real, fn_reporte_balance_prueba,
// fn_reporte_libro_diario_origen, fn_reporte_gastos_naturaleza, fn_reporte_periodo_fiscal
// ============================================================

import { supabase as browserSupabase } from '@/lib/supabase/config';
import type { ReportesClient } from '../types';
// F0-SEC r3 (tester r2, fallo 3): `fetch` acepta el cliente de Supabase por
// parámetro. En el navegador (app/reportes) cae al cliente browser con la sesión
// del usuario; en el servidor (asistente de reportes) el route handler pasa el
// cliente de sesión de `getServerOrgContext()`, así que las RPC `fn_reporte_*`
// corren como `authenticated` miembro y nunca como `anon`.
import type { DefinicionModulo, LecturaReporte, ReportData, PeriodoCierre, VistaReporte } from '../types';
import { rangoDelPeriodo } from '../rangoPeriodo';

function buildReportData(
  id: string, titulo: string, modulo: string, periodo: PeriodoCierre,
  kpis: ReportData['kpis'], columnas: ReportData['columnas'],
  filas: Record<string, unknown>[], totales?: Record<string, unknown>,
): ReportData {
  return { id, titulo, modulo, kpis, columnas, filas, totales, generadoEn: new Date().toISOString(), periodo };
}

const num = (v: unknown): number => Number(v ?? 0) || 0;
const lista = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

// ------------------------------------------------------------
// Estado de resultados
// ------------------------------------------------------------

export interface CuentaResultado {
  cuenta: string;
  nombre: string;
  tipo: string;
  rubro?: 'ingreso' | 'costo' | 'gasto';
  monto: number;
}

export interface LineaResumida {
  concepto: string;
  monto: number;
  porcentaje: number;
  nivel: 'linea' | 'subtotal';
}

/**
 * Estado de resultados resumido por grupo del PUC, a partir del detalle por
 * cuenta de `fn_reporte_estado_resultados`: ingresos operacionales (41) y no
 * operacionales (42), costo de ventas (6 y 7), gastos de administración (51),
 * de ventas (52), no operacionales (53) e impuesto de renta (54). El
 * porcentaje es sobre los ingresos totales.
 */
export function resumirEstadoResultados(detalle: CuentaResultado[]): LineaResumida[] {
  const suma = (filtro: (c: CuentaResultado) => boolean) =>
    detalle.filter(filtro).reduce((s, c) => s + num(c.monto), 0);
  const grupo = (c: CuentaResultado) => c.cuenta.slice(0, 2);
  const esIngreso = (c: CuentaResultado) => (c.rubro ? c.rubro === 'ingreso' : c.tipo === 'income');
  const esCosto = (c: CuentaResultado) => (c.rubro ? c.rubro === 'costo' : ['6', '7'].includes(c.cuenta[0]));
  const esGasto = (c: CuentaResultado) => !esIngreso(c) && !esCosto(c);

  const ingOperacionales = suma((c) => esIngreso(c) && grupo(c) === '41');
  const ingNoOperacionales = suma((c) => esIngreso(c) && grupo(c) !== '41');
  const ingresos = ingOperacionales + ingNoOperacionales;
  const costos = suma(esCosto);
  const administracion = suma((c) => esGasto(c) && grupo(c) === '51');
  const ventas = suma((c) => esGasto(c) && grupo(c) === '52');
  const noOperacionales = suma((c) => esGasto(c) && grupo(c) === '53');
  const renta = suma((c) => esGasto(c) && grupo(c) === '54');
  const otrosGastos = suma((c) => esGasto(c) && !['51', '52', '53', '54'].includes(grupo(c)));

  const bruta = ingOperacionales - costos;
  const operacional = bruta - administracion - ventas;
  const antesImpuestos = operacional + ingNoOperacionales - noOperacionales - otrosGastos;
  const neta = antesImpuestos - renta;

  const pct = (m: number) => (ingresos !== 0 ? Math.round((m / ingresos) * 10000) / 100 : 0);
  const linea = (concepto: string, monto: number, nivel: LineaResumida['nivel'] = 'linea'): LineaResumida =>
    ({ concepto, monto, porcentaje: pct(monto), nivel });

  return [
    linea('Ingresos operacionales', ingOperacionales),
    linea('Costo de ventas', -costos),
    linea('Utilidad bruta', bruta, 'subtotal'),
    linea('Gastos de administración', -administracion),
    linea('Gastos de ventas', -ventas),
    linea('Utilidad operacional', operacional, 'subtotal'),
    linea('Ingresos no operacionales', ingNoOperacionales),
    linea('Gastos no operacionales', -noOperacionales),
    ...(otrosGastos !== 0 ? [linea('Otros gastos', -otrosGastos)] : []),
    linea('Utilidad antes de impuestos', antesImpuestos, 'subtotal'),
    linea('Impuesto de renta', -renta),
    linea('Utilidad neta', neta, 'subtotal'),
  ];
}

interface FilaDesglose { ingresos: number; costos: number; gastos: number; utilidad: number }

const COLUMNAS_DESGLOSE: VistaReporte['columnas'] = [
  { key: 'ingresos', titulo: 'Ingresos', tipo: 'moneda', alinear: 'right' },
  { key: 'costos', titulo: 'Costos', tipo: 'moneda', alinear: 'right' },
  { key: 'gastos', titulo: 'Gastos', tipo: 'moneda', alinear: 'right' },
  { key: 'utilidad', titulo: 'Utilidad', tipo: 'moneda', alinear: 'right' },
  { key: 'margen', titulo: 'Margen', tipo: 'porcentaje', alinear: 'right' },
];

function filaDesglose<T extends FilaDesglose>(f: T): Record<string, unknown> {
  const ingresos = num(f.ingresos);
  const utilidad = num(f.utilidad);
  return {
    ingresos,
    costos: num(f.costos),
    gastos: num(f.gastos),
    utilidad,
    margen: ingresos !== 0 ? Math.round((utilidad / ingresos) * 10000) / 100 : 0,
  };
}

// ------------------------------------------------------------
// Libro diario por origen
// ------------------------------------------------------------

/** journal_entries.source → nombre del documento que generó el asiento. */
const ORIGENES_ASIENTO: Record<string, string> = {
  sales: 'Ventas POS',
  sale: 'Ventas POS',
  invoice_sales: 'Facturas de venta',
  invoice_purchase: 'Facturas de compra',
  purchase_orders: 'Órdenes de compra',
  payments: 'Pagos y recaudos',
  accounts_receivable: 'Cuentas por cobrar',
  accounts_payable: 'Cuentas por pagar',
  stock_movements: 'Costo de inventario',
  inventory_adjustment: 'Ajustes de inventario',
  cash_movements: 'Movimientos de caja',
  cash_sessions: 'Cierres de caja',
  bank_transactions: 'Movimientos bancarios',
  commissions: 'Comisiones',
  tips: 'Propinas',
  reversal: 'Reversiones',
  credit_note: 'Notas crédito',
  customer_credit: 'Saldos a favor de clientes',
  folio_items: 'Consumos de huéspedes',
  folio_payment: 'Pagos de folio',
  reservation: 'Reservas',
  parking_passes: 'Pases de parqueadero',
  trip_tickets: 'Tiquetes de transporte',
  manual: 'Asientos manuales',
};

export const contabilidadReports: DefinicionModulo[] = [
  {
    id: 'estado-resultados',
    modulo: 'finance',
    titulo: 'Estado de resultados',
    descripcion: 'Ingresos, costos y gastos del periodo, por cuenta, sucursal y centro de costo',
    categoria: 'contable',
    alcance: 'organizacion',
    periodosSugeridos: ['mensual', 'trimestral', 'anual'],
    async fetch(orgId: number, periodo: PeriodoCierre, _sucursal?: number | null, client?: ReportesClient): Promise<ReportData> {
      const db = client ?? browserSupabase;
      const { start, end } = await rangoDelPeriodo(orgId, periodo, db);
      const [resultado, desglose] = await Promise.all([
        db.rpc('fn_reporte_estado_resultados', {
          p_organization_id: orgId,
          p_from: start,
          p_to: end,
        }),
        db.rpc('fn_reporte_resultados_desglose', {
          p_organization_id: orgId,
          p_from: start,
          p_to: end,
        }),
      ]);
      if (resultado.error) throw resultado.error;
      if (desglose.error) throw desglose.error;

      const d = (resultado.data ?? {}) as Record<string, unknown>;
      const g = (desglose.data ?? {}) as Record<string, unknown>;
      const detalle = lista<CuentaResultado>(d.detalle).map((c) => ({ ...c, monto: num(c.monto) }));
      const resumido = resumirEstadoResultados(detalle);
      const ingresos = num(d.ingresos);
      const utilidadNeta = num(d.utilidad_neta);

      const lectura: LecturaReporte[] = [];
      if (detalle.length === 0) {
        lectura.push({ tono: 'info', texto: 'No hay asientos publicados de ingresos, costos ni gastos en el periodo.' });
      } else if (utilidadNeta < 0) {
        lectura.push({ tono: 'alerta', texto: 'El periodo cierra con pérdida: los costos y gastos superan los ingresos.' });
      }
      const sinCentro = lista<{ centro_id: string | null; gastos: number; costos: number }>(g.por_centro_costo)
        .find((c) => c.centro_id == null);
      const totalCostoGasto = num(d.costos) + num(d.gastos);
      if (sinCentro && totalCostoGasto > 0 && num(sinCentro.gastos) + num(sinCentro.costos) === totalCostoGasto) {
        lectura.push({ tono: 'info', texto: 'Ningún gasto del periodo tiene centro de costo asignado.' });
      }

      return {
        ...buildReportData(
          'estado-resultados', 'Estado de resultados', 'finance', periodo,
          [
            { titulo: 'Ingresos', valor: ingresos, formato: 'moneda' },
            { titulo: 'Costos', valor: num(d.costos), formato: 'moneda' },
            { titulo: 'Utilidad bruta', valor: num(d.utilidad_bruta), formato: 'moneda' },
            { titulo: 'Gastos', valor: num(d.gastos), formato: 'moneda' },
            { titulo: 'Utilidad neta', valor: utilidadNeta, formato: 'moneda' },
            { titulo: 'Margen neto', valor: ingresos !== 0 ? Math.round((utilidadNeta / ingresos) * 10000) / 100 : 0, formato: 'porcentaje' },
          ],
          [
            { key: 'concepto', titulo: 'Concepto', tipo: 'texto' },
            { key: 'monto', titulo: 'Monto', tipo: 'moneda', alinear: 'right' },
            { key: 'porcentaje', titulo: '% de ingresos', tipo: 'porcentaje', alinear: 'right' },
          ],
          resumido.map((l) => ({ ...l })),
        ),
        vistaPrincipal: 'Resumido',
        vistas: [
          {
            id: 'por-cuenta',
            titulo: 'Por cuenta',
            columnas: [
              { key: 'cuenta', titulo: 'Cuenta', tipo: 'texto' },
              { key: 'nombre', titulo: 'Nombre', tipo: 'texto' },
              { key: 'rubro', titulo: 'Rubro', tipo: 'texto' },
              { key: 'monto', titulo: 'Monto', tipo: 'moneda', alinear: 'right' },
            ],
            filas: detalle.map((c) => ({
              cuenta: c.cuenta,
              nombre: c.nombre,
              rubro: c.rubro === 'ingreso' ? 'Ingreso' : c.rubro === 'costo' ? 'Costo' : 'Gasto',
              monto: c.monto,
            })),
          },
          {
            id: 'por-sucursal',
            titulo: 'Por sucursal',
            columnas: [{ key: 'sucursal', titulo: 'Sucursal', tipo: 'texto' }, ...COLUMNAS_DESGLOSE],
            filas: lista<FilaDesglose & { sucursal: string }>(g.por_sucursal)
              .map((f) => ({ sucursal: f.sucursal, ...filaDesglose(f) })),
          },
          {
            id: 'por-centro-costo',
            titulo: 'Por centro de costo',
            columnas: [
              { key: 'codigo', titulo: 'Código', tipo: 'texto' },
              { key: 'centro', titulo: 'Centro de costo', tipo: 'texto' },
              ...COLUMNAS_DESGLOSE,
            ],
            filas: lista<FilaDesglose & { codigo: string | null; centro: string }>(g.por_centro_costo)
              .map((f) => ({ codigo: f.codigo ?? '', centro: f.centro, ...filaDesglose(f) })),
          },
          {
            id: 'tendencia',
            titulo: 'Tendencia 12 meses',
            columnas: [{ key: 'mes', titulo: 'Mes', tipo: 'texto' }, ...COLUMNAS_DESGLOSE],
            filas: lista<FilaDesglose & { mes: string }>(g.tendencia)
              .map((f) => ({ mes: f.mes, ...filaDesglose(f) })),
          },
        ],
        lectura,
      };
    },
  },
  {
    id: 'balance-general',
    modulo: 'finance',
    titulo: 'Balance general',
    descripcion: 'Activo, pasivo y patrimonio a la fecha de corte · Fuente: libro mayor',
    categoria: 'contable',
    alcance: 'organizacion',
    periodosSugeridos: ['mensual', 'trimestral', 'anual'],
    async fetch(orgId: number, periodo: PeriodoCierre, _sucursal?: number | null, client?: ReportesClient): Promise<ReportData> {
      const db = client ?? browserSupabase;
      const { data, error } = await db.rpc('fn_reporte_balance_general', {
        p_organization_id: orgId,
        p_as_of: periodo.fechaFin,
      });
      if (error) throw error;

      const d = (data ?? {}) as Record<string, unknown>;
      const activos = num(d.activos);
      const totalPasivoPatrimonio = num(d.total_pasivo_patrimonio);
      const diferencia = Math.round((activos - totalPasivoPatrimonio) * 100) / 100;

      return {
        ...buildReportData(
          'balance-general', 'Balance general', 'finance', periodo,
          [
            { titulo: 'Total activos', valor: activos, formato: 'moneda' },
            { titulo: 'Total pasivos', valor: num(d.pasivos), formato: 'moneda' },
            { titulo: 'Patrimonio', valor: num(d.patrimonio), formato: 'moneda' },
            { titulo: 'Resultado del ejercicio', valor: num(d.resultado_ejercicio), formato: 'moneda' },
            { titulo: 'Pasivo + patrimonio', valor: totalPasivoPatrimonio, formato: 'moneda' },
          ],
          [
            { key: 'cuenta', titulo: 'Cuenta', tipo: 'texto' },
            { key: 'nombre', titulo: 'Nombre', tipo: 'texto' },
            { key: 'tipo', titulo: 'Tipo', tipo: 'texto' },
            { key: 'saldo', titulo: 'Saldo', tipo: 'moneda', alinear: 'right' },
          ],
          lista<Record<string, unknown>>(d.detalle),
        ),
        lectura: diferencia !== 0
          ? [{ tono: 'alerta', texto: 'El activo no cuadra con el pasivo más el patrimonio: revisa los asientos descuadrados.', href: '/app/finanzas/contabilidad/asientos', etiquetaAccion: 'Ver asientos' }]
          : [],
      };
    },
  },
  {
    id: 'presupuesto-vs-real',
    modulo: 'finance',
    titulo: 'Presupuesto vs. real',
    descripcion: 'Ejecución del presupuesto por cuenta',
    categoria: 'contable',
    alcance: 'organizacion',
    periodosSugeridos: ['mensual', 'trimestral'],
    async fetch(orgId: number, periodo: PeriodoCierre, _sucursal?: number | null, client?: ReportesClient): Promise<ReportData> {
      const db = client ?? browserSupabase;
      const { start, end } = await rangoDelPeriodo(orgId, periodo, db);
      const { data, error } = await db.rpc('fn_reporte_presupuesto_vs_real', {
        p_organization_id: orgId,
        p_from: start,
        p_to: end,
      });
      if (error) throw error;

      const d = (data ?? {}) as Record<string, unknown>;

      return {
        ...buildReportData(
          'presupuesto-vs-real', 'Presupuesto vs. real', 'finance', periodo,
          [
            { titulo: 'Tiene presupuesto', valor: d.tiene_presupuesto ? 'Sí' : 'No' },
          ],
          [
            { key: 'cuenta', titulo: 'Cuenta', tipo: 'texto' },
            { key: 'nombre', titulo: 'Nombre', tipo: 'texto' },
            { key: 'presupuesto', titulo: 'Presupuesto', tipo: 'moneda', alinear: 'right' },
            { key: 'real', titulo: 'Real', tipo: 'moneda', alinear: 'right' },
            { key: 'diferencia', titulo: 'Diferencia', tipo: 'moneda', alinear: 'right' },
            { key: 'variacion', titulo: 'Variación %', tipo: 'porcentaje', alinear: 'right' },
          ],
          lista<Record<string, unknown>>(d.detalle),
        ),
        lectura: d.tiene_presupuesto
          ? []
          : [{ tono: 'info', texto: 'La organización no tiene presupuesto cargado: solo se muestran los valores reales.' }],
      };
    },
  },
  {
    id: 'balance-prueba',
    modulo: 'finance',
    titulo: 'Balance de prueba',
    descripcion: 'Saldo inicial, débitos, créditos y saldo final de cada cuenta en el periodo',
    categoria: 'contable',
    alcance: 'organizacion',
    periodosSugeridos: ['mensual', 'trimestral', 'anual'],
    async fetch(orgId: number, periodo: PeriodoCierre, _sucursal?: number | null, client?: ReportesClient): Promise<ReportData> {
      const db = client ?? browserSupabase;
      const { start, end } = await rangoDelPeriodo(orgId, periodo, db);
      const { data, error } = await db.rpc('fn_reporte_balance_prueba', {
        p_organization_id: orgId,
        p_from: start,
        p_to: end,
      });
      if (error) throw error;

      const d = (data ?? {}) as Record<string, unknown>;
      const t = (d.totales ?? {}) as Record<string, unknown>;
      const cuentas = lista<Record<string, unknown>>(d.cuentas).map((c) => ({
        cuenta: c.cuenta,
        nombre: c.nombre,
        saldo_inicial: num(c.saldo_inicial),
        debitos: num(c.debitos),
        creditos: num(c.creditos),
        saldo_final: num(c.saldo_final),
      }));
      const diferencia = num(t.diferencia);

      return {
        ...buildReportData(
          'balance-prueba', 'Balance de prueba', 'finance', periodo,
          [
            { titulo: 'Débitos', valor: num(t.debitos), formato: 'moneda' },
            { titulo: 'Créditos', valor: num(t.creditos), formato: 'moneda' },
            { titulo: 'Diferencia', valor: diferencia, formato: 'moneda' },
            { titulo: 'Cuentas con movimiento', valor: num(t.cuentas), formato: 'numero' },
          ],
          [
            { key: 'cuenta', titulo: 'Cuenta', tipo: 'texto' },
            { key: 'nombre', titulo: 'Nombre', tipo: 'texto' },
            { key: 'saldo_inicial', titulo: 'Saldo inicial', tipo: 'moneda', alinear: 'right' },
            { key: 'debitos', titulo: 'Débitos', tipo: 'moneda', alinear: 'right' },
            { key: 'creditos', titulo: 'Créditos', tipo: 'moneda', alinear: 'right' },
            { key: 'saldo_final', titulo: 'Saldo final', tipo: 'moneda', alinear: 'right' },
          ],
          cuentas,
          { debitos: num(t.debitos), creditos: num(t.creditos) },
        ),
        lectura: diferencia !== 0
          ? [{ tono: 'alerta', texto: 'Los débitos y los créditos del periodo no son iguales: hay asientos descuadrados.', href: '/app/finanzas/contabilidad/asientos', etiquetaAccion: 'Ver asientos' }]
          : cuentas.length > 0
            ? [{ tono: 'bien', texto: 'Débitos y créditos cuadran.' }]
            : [],
      };
    },
  },
  {
    id: 'libro-diario-origen',
    modulo: 'finance',
    titulo: 'Libro diario por origen',
    descripcion: 'Asientos del periodo agrupados por el documento que los generó',
    categoria: 'contable',
    alcance: 'organizacion',
    periodosSugeridos: ['diario', 'semanal', 'mensual'],
    async fetch(orgId: number, periodo: PeriodoCierre, _sucursal?: number | null, client?: ReportesClient): Promise<ReportData> {
      const db = client ?? browserSupabase;
      const { start, end } = await rangoDelPeriodo(orgId, periodo, db);
      const { data, error } = await db.rpc('fn_reporte_libro_diario_origen', {
        p_organization_id: orgId,
        p_from: start,
        p_to: end,
      });
      if (error) throw error;

      const d = (data ?? {}) as Record<string, unknown>;
      const t = (d.totales ?? {}) as Record<string, unknown>;
      const sinPublicar = num(t.sin_publicar);
      const descuadrados = num(t.descuadrados);
      const lectura: LecturaReporte[] = [];
      if (descuadrados > 0) {
        lectura.push({ tono: 'alerta', texto: `${descuadrados} asientos tienen débitos y créditos distintos.`, href: '/app/finanzas/contabilidad/asientos', etiquetaAccion: 'Ver asientos' });
      }
      if (sinPublicar > 0) {
        lectura.push({ tono: 'aviso', texto: `${sinPublicar} asientos siguen sin publicar y no afectan los saldos.`, href: '/app/finanzas/contabilidad/asientos', etiquetaAccion: 'Revisar' });
      }

      return {
        ...buildReportData(
          'libro-diario-origen', 'Libro diario por origen', 'finance', periodo,
          [
            { titulo: 'Asientos', valor: num(t.asientos), formato: 'numero' },
            { titulo: 'Débitos', valor: num(t.debitos), formato: 'moneda' },
            { titulo: 'Sin publicar', valor: sinPublicar, formato: 'numero' },
            { titulo: 'Descuadrados', valor: descuadrados, formato: 'numero' },
          ],
          [
            { key: 'origen', titulo: 'Origen', tipo: 'texto' },
            { key: 'asientos', titulo: 'Asientos', tipo: 'numero', alinear: 'right' },
            { key: 'sin_publicar', titulo: 'Sin publicar', tipo: 'numero', alinear: 'right' },
            { key: 'descuadrados', titulo: 'Descuadrados', tipo: 'numero', alinear: 'right' },
            { key: 'debitos', titulo: 'Débitos', tipo: 'moneda', alinear: 'right' },
            { key: 'creditos', titulo: 'Créditos', tipo: 'moneda', alinear: 'right' },
          ],
          lista<Record<string, unknown>>(d.origenes).map((o) => ({
            origen: ORIGENES_ASIENTO[String(o.origen)] ?? String(o.origen),
            asientos: num(o.asientos),
            sin_publicar: num(o.sin_publicar),
            descuadrados: num(o.descuadrados),
            debitos: num(o.debitos),
            creditos: num(o.creditos),
          })),
          { asientos: num(t.asientos), debitos: num(t.debitos), creditos: num(t.creditos) },
        ),
        lectura,
      };
    },
  },
  {
    id: 'gastos-naturaleza',
    modulo: 'finance',
    titulo: 'Gastos por naturaleza',
    descripcion: 'Gastos y costos del periodo por grupo del PUC: administración, ventas, no operacionales y costos',
    categoria: 'contable',
    alcance: 'organizacion',
    periodosSugeridos: ['mensual', 'trimestral', 'anual'],
    async fetch(orgId: number, periodo: PeriodoCierre, _sucursal?: number | null, client?: ReportesClient): Promise<ReportData> {
      const db = client ?? browserSupabase;
      const { start, end } = await rangoDelPeriodo(orgId, periodo, db);
      const { data, error } = await db.rpc('fn_reporte_gastos_naturaleza', {
        p_organization_id: orgId,
        p_from: start,
        p_to: end,
      });
      if (error) throw error;

      const d = (data ?? {}) as Record<string, unknown>;
      const grupos = lista<Record<string, unknown>>(d.grupos);
      const porNaturaleza = (n: string) => grupos.filter((g) => g.naturaleza === n).reduce((s, g) => s + num(g.monto), 0);
      const total = num(d.total);

      return {
        ...buildReportData(
          'gastos-naturaleza', 'Gastos por naturaleza', 'finance', periodo,
          [
            { titulo: 'Total', valor: total, formato: 'moneda' },
            { titulo: 'Operacionales', valor: porNaturaleza('operacional'), formato: 'moneda' },
            { titulo: 'No operacionales', valor: porNaturaleza('no_operacional'), formato: 'moneda' },
            { titulo: 'Costos', valor: porNaturaleza('costo'), formato: 'moneda' },
          ],
          [
            { key: 'grupo', titulo: 'Grupo', tipo: 'texto' },
            { key: 'nombre', titulo: 'Nombre', tipo: 'texto' },
            { key: 'cuentas', titulo: 'Cuentas', tipo: 'numero', alinear: 'right' },
            { key: 'monto', titulo: 'Monto', tipo: 'moneda', alinear: 'right' },
            { key: 'porcentaje', titulo: '% del total', tipo: 'porcentaje', alinear: 'right' },
          ],
          grupos.map((g) => ({
            grupo: g.grupo,
            nombre: g.nombre,
            cuentas: num(g.cuentas),
            monto: num(g.monto),
            porcentaje: num(g.porcentaje),
          })),
          { monto: total },
        ),
        vistaPrincipal: 'Por grupo',
        vistas: [{
          id: 'por-cuenta',
          titulo: 'Por cuenta',
          columnas: [
            { key: 'cuenta', titulo: 'Cuenta', tipo: 'texto' },
            { key: 'nombre', titulo: 'Nombre', tipo: 'texto' },
            { key: 'grupo', titulo: 'Grupo', tipo: 'texto' },
            { key: 'monto', titulo: 'Monto', tipo: 'moneda', alinear: 'right' },
          ],
          filas: lista<Record<string, unknown>>(d.cuentas).map((c) => ({
            cuenta: c.cuenta, nombre: c.nombre, grupo: c.grupo, monto: num(c.monto),
          })),
          totales: { monto: total },
        }],
        lectura: d.truncado
          ? [{ tono: 'aviso', texto: 'La vista por cuenta muestra las 2.000 de mayor valor; los totales cubren todas.' }]
          : [],
      };
    },
  },
  {
    id: 'periodo-fiscal',
    modulo: 'finance',
    titulo: 'Estado del periodo fiscal',
    descripcion: 'Lo que falta para cerrar el periodo: asientos, cajas, compras y conciliaciones pendientes',
    categoria: 'contable',
    alcance: 'organizacion',
    periodosSugeridos: ['mensual', 'anual'],
    async fetch(orgId: number, periodo: PeriodoCierre, _sucursal?: number | null, client?: ReportesClient): Promise<ReportData> {
      const db = client ?? browserSupabase;
      const { start, end } = await rangoDelPeriodo(orgId, periodo, db);
      const { data, error } = await db.rpc('fn_reporte_periodo_fiscal', {
        p_organization_id: orgId,
        p_from: start,
        p_to: end,
      });
      if (error) throw error;

      const d = (data ?? {}) as Record<string, unknown>;
      const periodos = lista<Record<string, unknown>>(d.periodos);
      const abiertos = periodos.filter((p) => p.estado !== 'closed').length;
      const cuentasBancarias = num(d.cuentas_bancarias);
      const conciliadas = num(d.cuentas_conciliadas);

      const verificaciones: Array<{ verificacion: string; pendientes: number; detalle: string; href: string }> = [
        { verificacion: 'Asientos sin publicar', pendientes: num(d.asientos_sin_publicar), detalle: 'No afectan los saldos hasta publicarlos', href: '/app/finanzas/contabilidad/asientos' },
        { verificacion: 'Asientos descuadrados', pendientes: num(d.asientos_descuadrados), detalle: 'Débitos distintos de créditos', href: '/app/finanzas/contabilidad/asientos' },
        { verificacion: 'Cajas abiertas', pendientes: num(d.cajas_abiertas), detalle: 'Sesiones de caja sin cerrar al final del periodo', href: '/app/pos/cajas' },
        { verificacion: 'Compras en borrador', pendientes: num(d.compras_en_borrador), detalle: 'Facturas de compra del periodo sin confirmar', href: '/app/finanzas/facturas-compra' },
        { verificacion: 'Cuentas bancarias sin conciliar', pendientes: Math.max(cuentasBancarias - conciliadas, 0), detalle: `${conciliadas} de ${cuentasBancarias} conciliadas hasta el fin del periodo`, href: '/app/finanzas/conciliacion-bancaria' },
      ];
      const pendientes = verificaciones.filter((v) => v.pendientes > 0);

      return {
        ...buildReportData(
          'periodo-fiscal', 'Estado del periodo fiscal', 'finance', periodo,
          [
            { titulo: 'Verificaciones pendientes', valor: pendientes.length, formato: 'numero' },
            { titulo: 'Periodos abiertos', valor: abiertos, formato: 'numero' },
            { titulo: 'Cuentas conciliadas', valor: `${conciliadas} de ${cuentasBancarias}` },
          ],
          [
            { key: 'verificacion', titulo: 'Verificación', tipo: 'texto' },
            { key: 'estado', titulo: 'Estado', tipo: 'texto' },
            { key: 'pendientes', titulo: 'Pendientes', tipo: 'numero', alinear: 'right' },
            { key: 'detalle', titulo: 'Detalle', tipo: 'texto' },
          ],
          verificaciones.map((v) => ({
            verificacion: v.verificacion,
            estado: v.pendientes > 0 ? 'Pendiente' : 'Listo',
            pendientes: v.pendientes,
            detalle: v.detalle,
          })),
        ),
        vistaPrincipal: 'Verificaciones',
        vistas: [{
          id: 'periodos',
          titulo: 'Periodos contables',
          columnas: [
            { key: 'periodo', titulo: 'Periodo', tipo: 'texto' },
            { key: 'inicio', titulo: 'Inicio', tipo: 'fecha' },
            { key: 'fin', titulo: 'Fin', tipo: 'fecha' },
            { key: 'estado', titulo: 'Estado', tipo: 'texto' },
          ],
          filas: periodos.map((p) => ({
            periodo: p.tipo === 'yearly' ? `Año ${p.anio}` : `${String(p.mes).padStart(2, '0')}/${p.anio}`,
            inicio: p.inicio,
            fin: p.fin,
            estado: p.estado === 'closed' ? 'Cerrado' : 'Abierto',
          })),
        }],
        lectura: pendientes.length === 0
          ? [{ tono: 'bien', texto: 'No hay pendientes: el periodo está listo para cerrarse.' }]
          : pendientes.map((v) => ({ tono: 'aviso' as const, texto: `${v.verificacion}: ${v.pendientes}.`, href: v.href, etiquetaAccion: 'Resolver' })),
      };
    },
  },
];
