/**
 * Reglas de presentación de Nómina (fase 3, Figma 20.16–20.25). Sin React y sin
 * base: las prueba `__tests__/nominaLogica.test.ts`.
 *
 * Nada de aquí decide un permiso ni calcula la nómina: los permisos llegan del
 * servidor (`fn_hr_puede`) y el cálculo del motor (`src/lib/hrm/nomina`). Esto solo
 * dice qué botón se muestra, cuál va deshabilitado y por qué, y cómo se agrupa
 * lo que ya calculó el servidor.
 */
import { CATALOGO_BASE } from '@/lib/hrm/nomina/conceptos';
import type { TonoBadge } from '@/components/kit';

/* ── Estados del período ─────────────────────────────────────────────────── */

/** Estados de `payroll_periods.status` (CHECK de la base). */
export const ESTADOS_BD = ['open', 'calculating', 'calculated', 'reviewing', 'approved', 'paying', 'paid', 'closed', 'cancelled'] as const;
export type EstadoBd = (typeof ESTADOS_BD)[number];

/** Estados que ve la persona (ADR-003 §1: abierto, preliquidado, en revisión, cerrado, pagado, contabilizado). */
export type EstadoPeriodo = 'abierto' | 'calculando' | 'preliquidado' | 'en_revision' | 'cerrado' | 'pagando' | 'pagado' | 'contabilizado' | 'anulado';

export const ESTADO_VISIBLE: Record<EstadoBd, EstadoPeriodo> = {
  open: 'abierto',
  calculating: 'calculando',
  calculated: 'preliquidado',
  reviewing: 'en_revision',
  approved: 'cerrado',
  paying: 'pagando',
  paid: 'pagado',
  closed: 'contabilizado',
  cancelled: 'anulado',
};

/** Tonos de SISTEMA-BADGES.md (adenda «Estados del período de nómina»). */
export const TONO_ESTADO_PERIODO: Record<EstadoPeriodo, TonoBadge> = {
  abierto: 'neutro',
  calculando: 'informacion',
  preliquidado: 'informacion',
  en_revision: 'advertencia',
  cerrado: 'marca',
  pagando: 'advertencia',
  pagado: 'exito',
  contabilizado: 'exito',
  anulado: 'neutro',
};

export function estadoPeriodo(estado: string | null | undefined): EstadoPeriodo {
  return (ESTADOS_BD as readonly string[]).includes(estado ?? '') ? ESTADO_VISIBLE[estado as EstadoBd] : 'abierto';
}

/** Lo cerrado no se edita: se corrige con un ajuste con motivo (decisión 5). */
export function estaCerrado(e: EstadoPeriodo): boolean {
  return e === 'cerrado' || e === 'pagando' || e === 'pagado' || e === 'contabilizado';
}

/* ── Permisos y acciones ─────────────────────────────────────────────────── */

export interface PermisosNomina {
  ver: boolean;
  procesar: boolean;
  cerrar: boolean;
  pagar: boolean;
  salario: boolean;
}

export const SIN_PERMISOS: PermisosNomina = { ver: false, procesar: false, cerrar: false, pagar: false, salario: false };

export type AccionPeriodo =
  | 'preliquidar'
  | 'recalcular'
  | 'enviar_revision'
  | 'devolver'
  | 'cerrar'
  | 'archivo_banco'
  | 'pagar'
  | 'contabilizar'
  | 'ajustar'
  | 'colillas'
  | 'eliminar';

/** Por qué una acción visible va deshabilitada. Cada motivo tiene su texto en `hrmNomina.motivos`. */
export type MotivoAccion = 'solo_preliquidacion' | 'bloqueos' | 'revision_pendiente' | 'sin_calculo' | 'con_calculo';

export interface EstadoAccion {
  visible: boolean;
  habilitada: boolean;
  motivo: MotivoAccion | null;
}

export interface ContextoAcciones {
  estado: EstadoPeriodo;
  permisos: PermisosNomina;
  /** `hr_payroll_enabled`: apagada = modo solo preliquidación (Figma 20.25). */
  habilitada: boolean;
  /** Bloqueos de cierre que devolvió la base (`fn_hr_nomina_bloqueos`) o el motor. */
  bloqueos: number;
  /** Hay una versión de cálculo vigente. */
  conCalculo: boolean;
  /** La aprobación del cierre (motor de aprobaciones) está aprobada, o no hay regla. */
  revisionAprobada: boolean;
}

const OCULTA: EstadoAccion = { visible: false, habilitada: false, motivo: null };
const LISTA: EstadoAccion = { visible: true, habilitada: true, motivo: null };
const con = (motivo: MotivoAccion): EstadoAccion => ({ visible: true, habilitada: false, motivo });

/**
 * Qué acción se ofrece en cada estado y para cada permiso (decisiones 4, 5 y 7 del
 * dueño). La base vuelve a validar todo: esto evita ofrecer lo que la base rechazaría.
 * - RR. HH. (`process`) preliquida, recalcula y envía a revisión.
 * - Gerencia (`close`) cierra; `pay` paga y genera el archivo del banco.
 * - Con la nómina apagada, cerrar, pagar, ajustar y contabilizar se ven deshabilitados.
 * - Recalcular solo antes de pagar; después de cerrar, solo ajustes con motivo.
 */
export function accionesPeriodo(c: ContextoAcciones): Record<AccionPeriodo, EstadoAccion> {
  const p = c.permisos;
  const e = c.estado;
  const apagada = !c.habilitada;
  const r: Record<AccionPeriodo, EstadoAccion> = {
    preliquidar: OCULTA,
    recalcular: OCULTA,
    enviar_revision: OCULTA,
    devolver: OCULTA,
    cerrar: OCULTA,
    archivo_banco: OCULTA,
    pagar: OCULTA,
    contabilizar: OCULTA,
    ajustar: OCULTA,
    colillas: OCULTA,
    eliminar: OCULTA,
  };
  if (p.procesar && e === 'abierto') {
    r.preliquidar = LISTA;
    r.eliminar = c.conCalculo ? con('con_calculo') : LISTA;
  }
  if (p.procesar && e === 'preliquidado') {
    r.recalcular = LISTA;
    r.enviar_revision = !c.conCalculo ? con('sin_calculo') : c.bloqueos > 0 ? con('bloqueos') : LISTA;
  }
  if (p.procesar && e === 'en_revision') r.devolver = LISTA;
  if (p.cerrar && e === 'en_revision') {
    r.cerrar = apagada ? con('solo_preliquidacion') : c.bloqueos > 0 ? con('bloqueos') : !c.revisionAprobada ? con('revision_pendiente') : LISTA;
  }
  if (p.pagar && (e === 'cerrado' || e === 'pagando')) {
    r.archivo_banco = apagada ? con('solo_preliquidacion') : LISTA;
    r.pagar = apagada ? con('solo_preliquidacion') : LISTA;
  }
  if ((p.cerrar || p.pagar) && e === 'pagado') r.contabilizar = apagada ? con('solo_preliquidacion') : LISTA;
  if (p.procesar && estaCerrado(e)) r.ajustar = apagada ? con('solo_preliquidacion') : LISTA;
  if (c.conCalculo && e !== 'abierto' && e !== 'anulado') r.colillas = LISTA;
  return r;
}

/* ── Alertas del motor ───────────────────────────────────────────────────── */

export interface AlertaNomina {
  codigo: string;
  severidad?: 'aviso' | 'bloqueo' | string;
  detalle?: Record<string, unknown> | null;
}

export function contarAlertas(alertas: readonly AlertaNomina[] | null | undefined): { bloqueos: number; avisos: number } {
  const l = alertas ?? [];
  return { bloqueos: l.filter((a) => a.severidad === 'bloqueo').length, avisos: l.filter((a) => a.severidad === 'aviso').length };
}

/** Códigos de alerta que tienen texto propio; los demás se muestran con el genérico. */
export const ALERTAS_CONOCIDAS = [
  'acumulado_faltante',
  'auxilio_transporte_supera_tope',
  'cotizacion_por_semanas_no_soportada',
  'fsp_reparto_pila_pendiente',
  'ibc_ajustado_al_minimo',
  'ibc_mes_anterior_sin_dato',
  'integral_bajo_minimo',
  'integral_con_horas',
  'integral_sin_prima_ni_cesantias',
  'licencia_no_remunerada',
  'neto_negativo',
  'novedad_sin_valor',
  'retencion_porcentaje_fijo_faltante',
  'sin_periodo_anterior',
  'variacion_contra_anterior',
  'vinculo_fuera_del_periodo',
  'embargo_limitado',
  'cuota_prestamo_limitada',
  'descuento_limitado',
  'novedades_nomina_pendientes',
  'novedades_asistencia_pendientes',
  'dias_no_listos',
  'parametro_no_configurado',
  'error_calculo',
] as const;
export type AlertaConocida = (typeof ALERTAS_CONOCIDAS)[number];

export function claveAlerta(codigo: string): AlertaConocida | 'otra' {
  return (ALERTAS_CONOCIDAS as readonly string[]).includes(codigo) ? (codigo as AlertaConocida) : 'otra';
}

/** Bloqueos de cierre de `fn_hr_nomina_bloqueos`, con texto propio. */
export const BLOQUEOS_CIERRE = [
  'sin_preliquidacion',
  'calculo_sin_motor',
  'novedades_nomina_pendientes',
  'novedades_despues_del_calculo',
  'novedades_asistencia_pendientes',
  'dias_no_listos',
  'revision_pendiente',
  'parametros_pendientes',
] as const;
export type BloqueoCierre = (typeof BLOQUEOS_CIERRE)[number];

export function claveBloqueo(codigo: string): BloqueoCierre | AlertaConocida | 'otra' {
  if ((BLOQUEOS_CIERRE as readonly string[]).includes(codigo)) return codigo as BloqueoCierre;
  return claveAlerta(codigo);
}

/**
 * Variación del neto contra el período anterior (Figma 17.1 «Frente al anterior»).
 * Sale del detalle de la alerta `variacion_contra_anterior` del motor; sin ella, 0.
 * `null` si la persona no tiene período anterior (ingresó en este).
 */
export function variacionNeto(alertas: readonly AlertaNomina[] | null | undefined): number | null {
  const l = alertas ?? [];
  if (l.some((a) => a.codigo === 'sin_periodo_anterior')) return null;
  const v = l.find((a) => a.codigo === 'variacion_contra_anterior')?.detalle;
  const antes = Number(v?.neto_anterior);
  const ahora = Number(v?.neto);
  if (!v || !(antes > 0) || !Number.isFinite(ahora)) return 0;
  return (ahora - antes) / antes;
}

/* ── Colilla: ítems agrupados ────────────────────────────────────────────── */

export type TipoItemBd = 'earning' | 'deduction' | 'employer_cost' | 'info' | string;

export interface ItemColilla {
  tipo: TipoItemBd;
  codigo: string;
  nombre: string;
  valor: number;
  cantidad?: number | null;
  tasa?: number | null;
  base?: number | null;
  detalle?: Record<string, unknown> | null;
}

export interface GruposColilla {
  devengados: ItemColilla[];
  deducciones: ItemColilla[];
  aportes: ItemColilla[];
  provisiones: ItemColilla[];
  informativos: ItemColilla[];
}

/**
 * Separa los ítems guardados de una colilla. El costo del empleador se reparte
 * entre aportes y provisiones con el tipo del concepto (catálogo de plataforma; un
 * concepto propio de la empresa que no esté ahí cuenta como aporte).
 */
export function agruparItems(items: readonly ItemColilla[] | null | undefined, tipos: Readonly<Record<string, string>> = TIPO_CONCEPTO_BASE): GruposColilla {
  const g: GruposColilla = { devengados: [], deducciones: [], aportes: [], provisiones: [], informativos: [] };
  for (const i of items ?? []) {
    const it = { ...i, valor: Number(i.valor) || 0 };
    if (i.tipo === 'earning') g.devengados.push(it);
    else if (i.tipo === 'deduction') g.deducciones.push(it);
    else if (i.tipo === 'employer_cost') (tipos[i.codigo] === 'provision' ? g.provisiones : g.aportes).push(it);
    else g.informativos.push(it);
  }
  return g;
}

export const TIPO_CONCEPTO_BASE: Readonly<Record<string, string>> = Object.fromEntries(Object.values(CATALOGO_BASE).map((c) => [c.codigo, c.tipo]));

export function suma(items: readonly { valor: number }[]): number {
  return items.reduce((s, i) => s + (Number(i.valor) || 0), 0);
}

/** Conceptos salariales del catálogo de plataforma (para «Salarial / No salarial» bajo el concepto). */
export function esSalarial(codigo: string): boolean | null {
  const c = CATALOGO_BASE[codigo];
  return c ? c.salarial : null;
}

/** Aportes de seguridad social del trabajador y del empleador (18.2). */
export const CODIGOS_SEGURIDAD_SOCIAL = new Set([
  'SALUD_EMPLEADO',
  'PENSION_EMPLEADO',
  'FONDO_SOLIDARIDAD',
  'SALUD_EMPLEADOR',
  'PENSION_EMPLEADOR',
  'ARL',
  'CAJA_COMPENSACION',
  'ICBF',
  'SENA',
]);

/* ── Períodos: nombre, filtros y orden ───────────────────────────────────── */

export type TipoPeriodo = 'ordinaria' | 'prima' | 'cesantias';
export type Frecuencia = 'weekly' | 'biweekly' | 'monthly';

export interface FilaPeriodo {
  id: string;
  nombre: string | null;
  tipo: TipoPeriodo;
  frecuencia: string;
  desde: string;
  hasta: string;
  fecha_pago: string | null;
  estado: string;
  empleados: number | null;
  devengado: number | null;
  deducciones: number | null;
  neto: number | null;
  costo_empleador: number | null;
  version: number | null;
  calculado_en: string | null;
  bloqueos: number;
  avisos: number;
  ajustes: number;
}

/** Cómo nombrar un período cuando no tiene nombre: «1.ª quincena de noviembre de 2026». */
export type ClaveNombre =
  | { clave: 'quincena'; numero: 1 | 2; mes: string; anio: number }
  | { clave: 'mes'; mes: string; anio: number }
  | { clave: 'prima'; semestre: 1 | 2; anio: number }
  | { clave: 'cesantias'; anio: number }
  | { clave: 'rango'; desde: string; hasta: string };

function partes(d: string): [number, number, number] {
  const [a, m, dd] = d.split('-').map(Number);
  return [a, m, dd];
}

function ultimoDiaMes(anio: number, mes: number): number {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate();
}

export function claveNombrePeriodo(p: { tipo: TipoPeriodo | string; desde: string; hasta: string }): ClaveNombre {
  const [a1, m1, d1] = partes(p.desde);
  const [a2, m2, d2] = partes(p.hasta);
  const mes = `${a1}-${String(m1).padStart(2, '0')}`;
  if (p.tipo === 'prima') return { clave: 'prima', semestre: m2 <= 6 ? 1 : 2, anio: a2 };
  if (p.tipo === 'cesantias') return { clave: 'cesantias', anio: a2 };
  if (a1 === a2 && m1 === m2) {
    if (d1 === 1 && d2 === 15) return { clave: 'quincena', numero: 1, mes, anio: a1 };
    if (d1 === 16 && d2 === ultimoDiaMes(a1, m1)) return { clave: 'quincena', numero: 2, mes, anio: a1 };
    if (d1 === 1 && d2 === ultimoDiaMes(a1, m1)) return { clave: 'mes', mes, anio: a1 };
  }
  return { clave: 'rango', desde: p.desde, hasta: p.hasta };
}

/** Fechas sugeridas del siguiente período de la misma frecuencia (16.2). */
export function siguientePeriodo(ultimo: { hasta: string } | null, frecuencia: Frecuencia, hoy: string): { desde: string; hasta: string } {
  const sumarDias = (d: string, n: number) => {
    const [a, m, dd] = partes(d);
    const f = new Date(Date.UTC(a, m - 1, dd + n));
    return `${f.getUTCFullYear()}-${String(f.getUTCMonth() + 1).padStart(2, '0')}-${String(f.getUTCDate()).padStart(2, '0')}`;
  };
  const desde = ultimo ? sumarDias(ultimo.hasta, 1) : (() => {
    const [a, m, d] = partes(hoy);
    if (frecuencia === 'biweekly') return `${a}-${String(m).padStart(2, '0')}-${d <= 15 ? '01' : '16'}`;
    if (frecuencia === 'monthly') return `${a}-${String(m).padStart(2, '0')}-01`;
    return hoy;
  })();
  const [a, m, d] = partes(desde);
  if (frecuencia === 'weekly') return { desde, hasta: sumarDias(desde, 6) };
  const mm = String(m).padStart(2, '0');
  if (frecuencia === 'monthly') return { desde, hasta: `${a}-${mm}-${String(ultimoDiaMes(a, m)).padStart(2, '0')}` };
  return d <= 15 ? { desde, hasta: `${a}-${mm}-15` } : { desde, hasta: `${a}-${mm}-${String(ultimoDiaMes(a, m)).padStart(2, '0')}` };
}

export interface FiltrosPeriodos {
  texto: string;
  estados: EstadoPeriodo[];
  tipos: TipoPeriodo[];
}

export const FILTROS_PERIODOS_VACIOS: FiltrosPeriodos = { texto: '', estados: [], tipos: [] };

export function conteoFiltrosPeriodos(f: FiltrosPeriodos): number {
  return (f.estados.length ? 1 : 0) + (f.tipos.length ? 1 : 0);
}

export function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/** Filtra por texto (nombre visible o fecha de pago ya formateada), estado y tipo. */
export function filtrarPeriodos<T extends FilaPeriodo>(filas: readonly T[], f: FiltrosPeriodos, textoDe: (p: T) => string): T[] {
  const q = normalizar(f.texto);
  return filas.filter(
    (p) =>
      (!q || normalizar(textoDe(p)).includes(q)) &&
      (f.estados.length === 0 || f.estados.includes(estadoPeriodo(p.estado))) &&
      (f.tipos.length === 0 || f.tipos.includes(p.tipo))
  );
}

/** Próximo pago: el período abierto o en curso más cercano con fecha de pago. */
export function proximoPago(filas: readonly FilaPeriodo[], hoy: string): string | null {
  const fechas = filas
    .filter((p) => !estaCerrado(estadoPeriodo(p.estado)) && p.fecha_pago && p.fecha_pago >= hoy)
    .map((p) => p.fecha_pago as string)
    .sort();
  return fechas[0] ?? null;
}

/* ── Préstamos y embargos ────────────────────────────────────────────────── */

export type ClaseDeduccion = 'prestamo' | 'anticipo' | 'embargo_alimentos' | 'embargo_cooperativa' | 'embargo_ordinario';
export type EstadoDeduccion = 'al_dia' | 'programado' | 'por_aprobar' | 'activo' | 'suspendido' | 'pagado' | 'terminado' | 'anulado' | 'en_mora';

export const TONO_DEDUCCION: Record<EstadoDeduccion, TonoBadge> = {
  al_dia: 'exito',
  activo: 'exito',
  programado: 'informacion',
  por_aprobar: 'advertencia',
  suspendido: 'advertencia',
  en_mora: 'peligro',
  pagado: 'neutro',
  terminado: 'neutro',
  anulado: 'neutro',
};

export interface PrestamoFuente {
  id: string;
  employment_id: string;
  loan_number: string | null;
  loan_type: string | null;
  status: string | null;
  principal: number;
  balance: number;
  installment_amount: number;
  installments_total: number;
  installments_paid: number | null;
  first_payment_date: string | null;
  employee_name?: string | null;
}

export interface EmbargoFuente {
  id: string;
  vinculo_id: string;
  tipo: 'alimentos' | 'cooperativa' | 'ordinario';
  modo: 'fijo' | 'porcentaje';
  valor: number;
  total: number | null;
  aplicado: number;
  recibido: string;
  desde: string;
  hasta: string | null;
  oficio: string | null;
  beneficiario: string | null;
  estado: 'activo' | 'suspendido' | 'terminado';
}

export interface FilaDeduccion {
  id: string;
  origen: 'prestamo' | 'embargo';
  clase: ClaseDeduccion;
  vinculo_id: string;
  nombre: string | null;
  numero: string | null;
  acreedor: string | null;
  /** Monto del préstamo o total ordenado; `null` en un embargo sin tope. */
  monto: number | null;
  /** Porcentaje del embargo (fracción), si es por porcentaje. */
  porcentaje: number | null;
  cuota: number | null;
  cuotas: number | null;
  saldo: number | null;
  estado: EstadoDeduccion;
  desde: string | null;
}

export function estadoPrestamo(status: string | null | undefined, primerPago: string | null, hoy: string): EstadoDeduccion {
  switch (status) {
    case 'requested':
      return 'por_aprobar';
    case 'approved':
      return 'programado';
    case 'active':
      return primerPago && primerPago > hoy ? 'programado' : 'al_dia';
    case 'paid':
      return 'pagado';
    case 'defaulted':
      return 'en_mora';
    case 'cancelled':
    case 'written_off':
      return 'anulado';
    default:
      return 'programado';
  }
}

export function filaDePrestamo(l: PrestamoFuente, hoy: string, nombre: string | null): FilaDeduccion {
  return {
    id: l.id,
    origen: 'prestamo',
    clase: l.loan_type === 'advance' ? 'anticipo' : 'prestamo',
    vinculo_id: l.employment_id,
    nombre: nombre ?? l.employee_name ?? null,
    numero: l.loan_number,
    acreedor: null,
    monto: Number(l.principal) || 0,
    porcentaje: null,
    cuota: Number(l.installment_amount) || 0,
    cuotas: l.installments_total,
    saldo: Number(l.balance) || 0,
    estado: estadoPrestamo(l.status, l.first_payment_date, hoy),
    desde: l.first_payment_date,
  };
}

export function filaDeEmbargo(e: EmbargoFuente, nombre: string | null): FilaDeduccion {
  return {
    id: e.id,
    origen: 'embargo',
    clase: e.tipo === 'alimentos' ? 'embargo_alimentos' : e.tipo === 'cooperativa' ? 'embargo_cooperativa' : 'embargo_ordinario',
    vinculo_id: e.vinculo_id,
    nombre,
    numero: e.oficio,
    acreedor: e.beneficiario,
    monto: e.modo === 'fijo' ? (e.total ?? null) : null,
    porcentaje: e.modo === 'porcentaje' ? e.valor : null,
    cuota: e.modo === 'fijo' ? e.valor : null,
    cuotas: null,
    saldo: e.total === null ? null : Math.max(0, e.total - e.aplicado),
    estado: e.estado,
    desde: e.desde,
  };
}

export interface FiltrosDeducciones {
  texto: string;
  clases: ClaseDeduccion[];
  estados: EstadoDeduccion[];
}

export const FILTROS_DEDUCCIONES_VACIOS: FiltrosDeducciones = { texto: '', clases: [], estados: [] };

export function filtrarDeducciones(filas: readonly FilaDeduccion[], f: FiltrosDeducciones): FilaDeduccion[] {
  const q = normalizar(f.texto);
  return filas.filter(
    (x) =>
      (!q || normalizar([x.nombre, x.acreedor, x.numero].filter(Boolean).join(' ')).includes(q)) &&
      (f.clases.length === 0 || f.clases.includes(x.clase)) &&
      (f.estados.length === 0 || f.estados.includes(x.estado))
  );
}

/** Totales de las tarjetas de 21.1: préstamos y anticipos, y embargos activos. */
export function totalesDeducciones(filas: readonly FilaDeduccion[]): { prestamos: { saldo: number; n: number; cuotas: number }; embargos: { saldo: number; activos: number } } {
  const vivos = (x: FilaDeduccion) => x.estado === 'al_dia' || x.estado === 'programado' || x.estado === 'en_mora' || x.estado === 'activo';
  const pr = filas.filter((x) => x.origen === 'prestamo' && vivos(x));
  const em = filas.filter((x) => x.origen === 'embargo' && x.estado === 'activo');
  return {
    prestamos: { saldo: suma(pr.map((x) => ({ valor: x.saldo ?? 0 }))), n: pr.length, cuotas: suma(pr.filter((x) => x.estado === 'al_dia').map((x) => ({ valor: x.cuota ?? 0 }))) },
    embargos: { saldo: suma(em.map((x) => ({ valor: x.saldo ?? 0 }))), activos: em.length },
  };
}

/* ── Archivo del banco y errores ─────────────────────────────────────────── */

/** Códigos de error de las rutas de nómina con texto propio (`hrmNomina.errores`). */
export const ERRORES_CONOCIDOS = [
  'sin_permiso',
  'nomina_no_habilitada',
  'estado_invalido',
  'periodo_no_existe',
  'no_existe',
  'parametro_no_configurado',
  'nada_por_pagar',
  'cuenta_bancaria_ajena',
  'cuenta_bancaria_invalida',
  'fecha_invalida',
  'periodo_invalido',
  'periodo_con_calculo',
  'motivo_obligatorio',
  'novedades_invalidas',
  'ajuste_sin_diferencia',
  'archivo_banco_invalido',
  'formato_banco_no_soportado',
  'duplicado',
  'periodo_cruzado',
] as const;
export type ErrorConocido = (typeof ERRORES_CONOCIDOS)[number];

export function claveError(codigo: string | null | undefined): ErrorConocido | 'generico' {
  return (ERRORES_CONOCIDOS as readonly string[]).includes(codigo ?? '') ? (codigo as ErrorConocido) : 'generico';
}

/* ── Ajuste de un período cerrado ─────────────────────────────────────────── */

/**
 * Conceptos que se pueden corregir con un ajuste (ADR-003 §4: bonos, auxilios,
 * retroactivos, vacaciones compensadas, libranzas y otros descuentos). Los que
 * calcula el motor (salario, horas, aportes…) no son novedades: la base los rechaza.
 */
export const CONCEPTOS_AJUSTE = [
  'BONIFICACION_SALARIAL',
  'BONIFICACION_NO_SALARIAL',
  'AUXILIO_NO_SALARIAL',
  'RETROACTIVO',
  'VACACIONES_COMPENSADAS',
  'LIBRANZA',
  'APORTE_COOPERATIVA',
  'FONDO_EMPLEADOS',
  'CUOTA_SINDICAL',
  'OTRO_DESCUENTO',
] as const;
export type ConceptoAjuste = (typeof CONCEPTOS_AJUSTE)[number];

/** Las vacaciones compensadas se piden en días; lo demás, en valor. */
export function ajusteEnDias(c: ConceptoAjuste): boolean {
  return c === 'VACACIONES_COMPENSADAS';
}

export interface ErrorAjuste {
  campo: 'vinculo' | 'concepto' | 'valor' | 'motivo';
}

/** Validación del formulario de ajuste antes de llamar al servidor (que vuelve a validar). */
export function validarAjuste(d: { vinculo: string; concepto: string; valor: number | null; motivo: string }): ErrorAjuste[] {
  const e: ErrorAjuste[] = [];
  if (!d.vinculo) e.push({ campo: 'vinculo' });
  if (!(CONCEPTOS_AJUSTE as readonly string[]).includes(d.concepto)) e.push({ campo: 'concepto' });
  if (d.valor === null || !(d.valor > 0)) e.push({ campo: 'valor' });
  if (!d.motivo.trim()) e.push({ campo: 'motivo' });
  return e;
}

/* ── Revisión y colilla ───────────────────────────────────────────────── */

export type EstadoPunto = 'listo' | 'pendiente' | 'bloquea';

/** Puntos de «Antes de cerrar» a partir de los bloqueos de la base (pura, la prueban). */
export function puntosRevision(
  bloqueos: ReadonlyArray<{ codigo: string; cantidad?: number; estado?: string }>,
  tipo: string,
  aprobacion: { estado: string; [k: string]: unknown } | null
): Array<{ clave: 'calculo' | 'novedades' | 'asistencia' | 'jornada' | 'parametros' | 'aprobacion'; estado: EstadoPunto; codigos: string[] }> {
  const hay = (...c: string[]) => bloqueos.filter((b) => c.includes(b.codigo)).map((b) => b.codigo);
  const motor = bloqueos.filter((b) => !['novedades_nomina_pendientes', 'novedades_despues_del_calculo', 'novedades_asistencia_pendientes', 'dias_no_listos', 'parametros_pendientes', 'revision_pendiente'].includes(b.codigo)).map((b) => b.codigo);
  const out: ReturnType<typeof puntosRevision> = [
    { clave: 'calculo', estado: motor.length ? 'bloquea' : 'listo', codigos: motor },
    { clave: 'novedades', estado: hay('novedades_nomina_pendientes', 'novedades_despues_del_calculo').length ? 'bloquea' : 'listo', codigos: hay('novedades_nomina_pendientes', 'novedades_despues_del_calculo') },
  ];
  if (tipo === 'ordinaria') {
    out.push({ clave: 'asistencia', estado: hay('novedades_asistencia_pendientes').length ? 'bloquea' : 'listo', codigos: hay('novedades_asistencia_pendientes') });
    out.push({ clave: 'jornada', estado: hay('dias_no_listos').length ? 'bloquea' : 'listo', codigos: hay('dias_no_listos') });
  }
  out.push({ clave: 'parametros', estado: hay('parametros_pendientes').length ? 'bloquea' : 'listo', codigos: hay('parametros_pendientes') });
  out.push({
    clave: 'aprobacion',
    estado: aprobacion ? (aprobacion.estado === 'aprobada' ? 'listo' : aprobacion.estado === 'pendiente' ? 'pendiente' : 'bloquea') : hay('revision_pendiente').length ? 'pendiente' : 'listo',
    codigos: hay('revision_pendiente'),
  });
  return out;
}

/** Línea de la colilla: «Salario básico · 15 días», «Salud · 4 %». */
export function textoLinea(i: ItemColilla, unidades: { dias: (n: number) => string; horas: (n: number) => string }): string {
  const extra: string[] = [];
  if (i.tasa && i.tipo === 'deduction') extra.push(`${Math.round(Number(i.tasa) * 10000) / 100} %`);
  else if (i.cantidad && /^(SALARIO|AUXILIO_TRANSPORTE|VACACIONES|INCAPACIDAD|LICENCIA|PRIMA|INTERESES)/.test(i.codigo)) extra.push(unidades.dias(Number(i.cantidad)));
  else if (i.cantidad && /^(HORA_EXTRA|RECARGO)/.test(i.codigo)) extra.push(unidades.horas(Number(i.cantidad)));
  return [i.nombre, ...extra].join(' · ');
}

