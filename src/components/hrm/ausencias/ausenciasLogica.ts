/**
 * Lógica pura de Ausencias (Figma 20.13 Vacaciones y 20.14 Incapacidades y licencias).
 * Sin React ni red: la prueba `__tests__/ausenciasLogica.test.ts`.
 *
 * Todas las fechas son días calendario `YYYY-MM-DD` (columnas `date`): se comparan
 * como texto y se suman con `addPlainDays`, sin pasar por la zona horaria.
 */
import { addPlainDays } from '@/lib/utils/dateCore';
import { diaDeSemana } from '@/components/kit/calendarioLogica';

export type Seccion = 'vacaciones' | 'incapacidades' | 'permisos';
export const SECCIONES: readonly Seccion[] = ['vacaciones', 'incapacidades', 'permisos'];

/** Nivel de detalle de una fila (decisión 2): lo decide la base. */
export type NivelAusencia = 'completo' | 'tipo' | 'justificada';

export interface PasoAprobacion {
  orden: number;
  tipo: string;
  estado: string;
  respaldo: boolean;
  aprobadores: (string | null)[];
  soy_yo: boolean;
  decidio: string | null;
  decidido: string | null;
}

export interface AprobacionAusencia {
  id: string;
  estado: string;
  paso_actual: number;
  pasos: PasoAprobacion[];
  puede_decidir: boolean;
}

export interface TramoPago {
  desde: string;
  hasta: string;
  dias: number;
  paga: string | null;
  fraccion: number;
  piso?: string | null;
  dia_de_la_incapacidad?: number;
}

export interface CruceVacaciones {
  nombre: string | null;
  desde: string;
  hasta: string;
  estado: string;
}

export interface FilaAusencia {
  id: string;
  vinculo_id: string;
  persona_id: string | null;
  nombre: string | null;
  cargo: string | null;
  area_id: string | null;
  area: string | null;
  area_personas: number;
  sede: string | null;
  seccion: Seccion;
  nivel: NivelAusencia;
  propio: boolean;
  sensible: boolean;
  tipo: string | null;
  tipo_nombre: string | null;
  /** Clase legal; «justificada» cuando el jefe ve una incapacidad. */
  clase: string | null;
  desde: string;
  hasta: string;
  dias_calendario: number;
  dias_habiles: number | null;
  cuenta: 'habiles' | 'calendario';
  medio_dia_inicio: boolean;
  medio_dia_fin: boolean;
  jornada: string | null;
  horas: { inicio: string; fin: string } | null;
  se_repone: boolean;
  fecha_parto: string | null;
  motivo: string | null;
  remunerado: boolean | null;
  estado: string;
  creado: string;
  prorroga_de: string | null;
  soporte: 'recibido' | 'falta' | null;
  tramos: TramoPago[] | null;
  regresa: string;
  aprobacion: AprobacionAusencia | null;
  saldo_despues: number | null;
  cruces: CruceVacaciones[] | null;
}

export interface Festivo {
  fecha: string;
  nombre: string;
  propio: boolean;
  medio_dia: boolean;
}

export interface TipoAusencia {
  id: string;
  codigo: string;
  nombre: string;
  clase: string | null;
  seccion: Seccion;
  remunerado: boolean | null;
  cuenta: 'habiles' | 'calendario';
  sensible: boolean;
  requiere_soporte: boolean | null;
}

export interface ParametroDetalle {
  valor: number | null;
  status: string;
}

export interface SaldoVacaciones {
  fecha: string;
  causados: number;
  disfrutados: number;
  programados: number;
  pendientes_aprobacion: number;
  disponibles: number;
}

export interface ListaAusencias {
  hoy: string;
  permisos: { ver_todo: boolean; aprobar: boolean; salud: boolean; equipo: boolean; registrar: boolean };
  filas: FilaAusencia[];
  festivos: Festivo[];
  tipos: TipoAusencia[];
  duraciones: {
    maternidad: ParametroDetalle | null;
    paternidad: ParametroDetalle | null;
    luto: ParametroDetalle | null;
    pago: Record<string, { paga: string | null; fraccion: number }> | null;
  };
  mio: {
    vinculo_id: string;
    persona_id: string | null;
    nombre: string | null;
    cargo: string | null;
    area: string | null;
    saldo: SaldoVacaciones | null;
  } | null;
}

/** Respuesta de `POST /api/hrm/ausencias/simular`. */
export interface Simulacion {
  vinculo_id: string;
  nombre: string | null;
  cargo: string | null;
  area: string | null;
  desde: string;
  hasta: string;
  dias_calendario: number;
  dias_habiles: number;
  no_laborables: string[];
  festivos: { fecha: string; nombre: string; propio: boolean }[];
  regresa: string;
  estado: string | null;
  saldo: SaldoVacaciones | null;
  cruces: (CruceVacaciones & { employment_id?: string })[];
  tramos: TramoPago[] | null;
  pasos: PasoAprobacion[];
  error: string | null;
}

/** Detalle (`GET /api/hrm/ausencias/[id]`). */
export interface DetalleAusencia extends Omit<FilaAusencia, 'area_id' | 'area_personas' | 'soporte' | 'saldo_despues' | 'cruces' | 'creado' | 'medio_dia_inicio' | 'medio_dia_fin' | 'jornada' | 'se_repone'> {
  prorrogas: number;
  turnos_afectados: number;
  registro: { por: string | null; en: string; canal: string | null };
  soporte: {
    id?: string;
    restringido: boolean;
    nombre?: string;
    tipo?: string;
    tamano?: number;
    vence?: string | null;
    creado?: string;
    subio?: string | null;
  } | null;
  soporte_estado: 'recibido' | 'falta' | null;
  permisos: { salud: boolean; gestionar: boolean; cancelar: boolean };
}

/* ── Estado que se muestra ─────────────────────────────────────────────── */

export type EstadoVisible =
  | 'por_aprobar'
  | 'por_aprobar_rrhh'
  | 'aprobada'
  | 'en_curso'
  | 'terminada'
  | 'disfrutada'
  | 'rechazada'
  | 'cancelada';

export const TONO_ESTADO: Record<EstadoVisible, 'advertencia' | 'exito' | 'informacion' | 'neutro' | 'peligro'> = {
  por_aprobar: 'advertencia',
  por_aprobar_rrhh: 'advertencia',
  aprobada: 'exito',
  en_curso: 'informacion',
  terminada: 'neutro',
  disfrutada: 'neutro',
  rechazada: 'peligro',
  cancelada: 'neutro',
};

/** El paso que espera decisión es de RR. HH. (respaldo o paso propio de RR. HH.). */
export function esperaRrhh(a: AprobacionAusencia | null): boolean {
  if (!a || a.estado !== 'pendiente') return false;
  const paso = a.pasos.find((p) => p.orden === a.paso_actual);
  return !!paso && (paso.tipo === 'rrhh' || paso.respaldo);
}

/** `hoy` es el día de la organización. */
export function estadoVisible(f: Pick<FilaAusencia, 'estado' | 'desde' | 'hasta' | 'seccion' | 'aprobacion'>, hoy: string): EstadoVisible {
  if (f.estado === 'cancelled') return 'cancelada';
  if (f.estado === 'rejected') return 'rechazada';
  if (f.estado === 'requested' || f.estado === 'draft') return esperaRrhh(f.aprobacion) ? 'por_aprobar_rrhh' : 'por_aprobar';
  if (f.hasta < hoy) return f.seccion === 'vacaciones' ? 'disfrutada' : 'terminada';
  if (f.desde <= hoy) return 'en_curso';
  return 'aprobada';
}

export function activa(f: Pick<FilaAusencia, 'estado'>): boolean {
  return f.estado === 'requested' || f.estado === 'approved' || f.estado === 'taken';
}

/** Por encima de N días también aprueba RR. HH. (decisión 10): hay un paso de RR. HH. después del jefe. */
export function requiereRrhh(a: Pick<AprobacionAusencia, 'pasos'> | null | undefined): boolean {
  return !!a && a.pasos.some((p) => p.orden > 1 && (p.tipo === 'rrhh' || p.respaldo));
}

/* ── Pagos ─────────────────────────────────────────────────────────────── */

export const PAGADORES = ['empleador', 'eps', 'arl', 'fondo_pensiones'] as const;
export type Pagador = (typeof PAGADORES)[number];

export function esPagador(v: unknown): v is Pagador {
  return typeof v === 'string' && (PAGADORES as readonly string[]).includes(v);
}

/** «Empresa 2 d · EPS 8 d»: días por pagador, en el orden de los tramos. */
export function diasPorPagador(tramos: readonly TramoPago[] | null | undefined): { paga: string | null; dias: number }[] {
  const out: { paga: string | null; dias: number }[] = [];
  for (const t of tramos ?? []) {
    const previo = out.find((x) => x.paga === t.paga);
    if (previo) previo.dias += Number(t.dias) || 0;
    else out.push({ paga: t.paga, dias: Number(t.dias) || 0 });
  }
  return out;
}

/** Rango de días de un tramo dentro de la incapacidad («1 y 2», «3 a 10»): sigue la cadena de prórrogas. */
export function diasDelTramo(t: TramoPago): { desde: number; hasta: number } | null {
  if (typeof t.dia_de_la_incapacidad !== 'number') return null;
  return { desde: t.dia_de_la_incapacidad, hasta: t.dia_de_la_incapacidad + (Number(t.dias) || 1) - 1 };
}

/** Fracción 0,6667 → «66,67 %». */
export function porcentaje(fraccion: number, locale: string): string {
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2, minimumFractionDigits: fraccion === 1 || fraccion === 0 ? 0 : 2 }).format(fraccion * 100)} %`;
}

/* ── Nombres ───────────────────────────────────────────────────────────── */

/**
 * «Andrés Felipe Morales Rincón» → «A. Morales»; «Carolina Ruiz Peña» → «C. Ruiz».
 * Con cuatro palabras o más, el primer apellido es la tercera; si no, la segunda.
 */
export function nombreCorto(nombre: string | null | undefined): string {
  const partes = (nombre ?? '').trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '—';
  if (partes.length === 1) return partes[0];
  const apellido = partes.length >= 4 ? partes[2] : partes[1];
  return `${partes[0].charAt(0).toUpperCase()}. ${apellido}`;
}

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/* ── Filtros ───────────────────────────────────────────────────────────── */

export interface FiltrosAusencias {
  texto: string;
  estados: EstadoVisible[];
  areas: string[];
  clases: string[];
  soloSinSoporte: boolean;
}

export const FILTROS_VACIOS: FiltrosAusencias = { texto: '', estados: [], areas: [], clases: [], soloSinSoporte: false };

export function conteoFiltros(f: FiltrosAusencias): number {
  return (f.estados.length > 0 ? 1 : 0) + (f.areas.length > 0 ? 1 : 0) + (f.clases.length > 0 ? 1 : 0) + (f.soloSinSoporte ? 1 : 0);
}

export function filtrarAusencias(
  filas: readonly FilaAusencia[],
  f: FiltrosAusencias,
  hoy: string,
  etiquetaTipo: (fila: FilaAusencia) => string
): FilaAusencia[] {
  const q = sinTildes(f.texto.trim());
  return filas.filter((x) => {
    if (f.estados.length > 0 && !f.estados.includes(estadoVisible(x, hoy))) return false;
    if (f.areas.length > 0 && !f.areas.includes(x.area_id ?? '')) return false;
    if (f.clases.length > 0 && !f.clases.includes(x.clase ?? '')) return false;
    if (f.soloSinSoporte && x.soporte !== 'falta') return false;
    if (!q) return true;
    return [x.nombre, x.cargo, x.area, etiquetaTipo(x), x.motivo]
      .filter((s): s is string => !!s)
      .some((s) => sinTildes(s).includes(q));
  });
}

/* ── Calendario de vacaciones ──────────────────────────────────────────── */

/** Días `desde..hasta` (incluidos), acotados a `[min, max]`. */
export function diasEntre(desde: string, hasta: string, min?: string, max?: string): string[] {
  const ini = min && desde < min ? min : desde;
  const fin = max && hasta > max ? max : hasta;
  const out: string[] = [];
  for (let d = ini, n = 0; d <= fin && n < 800; d = addPlainDays(d, 1), n++) out.push(d);
  return out;
}

/** Quién sale cada día: solo solicitudes vivas (por aprobar, aprobadas o disfrutadas). */
export function ausentesPorDia(filas: readonly FilaAusencia[], min: string, max: string): Map<string, FilaAusencia[]> {
  const mapa = new Map<string, FilaAusencia[]>();
  for (const f of filas) {
    if (!activa(f)) continue;
    for (const d of diasEntre(f.desde, f.hasta, min, max)) {
      const lista = mapa.get(d);
      if (lista) lista.push(f);
      else mapa.set(d, [f]);
    }
  }
  return mapa;
}

export interface CruceDia {
  area_id: string;
  area: string | null;
  ausentes: number;
  total: number;
}

/** Un cruce es un área con dos o más personas fuera el mismo día. */
export function crucesDelDia(ausentes: readonly FilaAusencia[]): CruceDia[] {
  const porArea = new Map<string, CruceDia>();
  for (const f of ausentes) {
    if (!f.area_id) continue;
    const c = porArea.get(f.area_id) ?? { area_id: f.area_id, area: f.area, ausentes: 0, total: f.area_personas };
    c.ausentes += 1;
    porArea.set(f.area_id, c);
  }
  return Array.from(porArea.values()).filter((c) => c.ausentes >= 2);
}

export interface TramoCruce {
  area_id: string;
  area: string | null;
  desde: string;
  hasta: string;
  personas: string[];
  /** Personas del área que siguen trabajando en el peor día del tramo. */
  quedan: number;
  total: number;
}

/** Tramos de días seguidos con cruce en la misma área, para el aviso de arriba del calendario. */
export function tramosDeCruce(mapa: Map<string, FilaAusencia[]>): TramoCruce[] {
  const dias = Array.from(mapa.keys()).sort();
  const abiertos = new Map<string, TramoCruce & { ultimo: string }>();
  const out: TramoCruce[] = [];
  const cerrar = (id: string) => {
    const t = abiertos.get(id);
    if (t) {
      const { ultimo: _u, ...resto } = t;
      void _u;
      out.push(resto);
      abiertos.delete(id);
    }
  };
  for (const d of dias) {
    const ausentes = mapa.get(d) ?? [];
    const hoyCruces = crucesDelDia(ausentes);
    const ids = new Set(hoyCruces.map((c) => c.area_id));
    for (const id of Array.from(abiertos.keys())) {
      const t = abiertos.get(id);
      if (!ids.has(id) || (t && addPlainDays(t.ultimo, 1) !== d)) cerrar(id);
    }
    for (const c of hoyCruces) {
      const nombres = ausentes.filter((f) => f.area_id === c.area_id).map((f) => f.nombre ?? '—');
      const t = abiertos.get(c.area_id);
      if (t) {
        t.hasta = d;
        t.ultimo = d;
        t.quedan = Math.min(t.quedan, Math.max(c.total - c.ausentes, 0));
        for (const n of nombres) if (!t.personas.includes(n)) t.personas.push(n);
      } else {
        abiertos.set(c.area_id, {
          area_id: c.area_id,
          area: c.area,
          desde: d,
          hasta: d,
          ultimo: d,
          personas: nombres,
          quedan: Math.max(c.total - c.ausentes, 0),
          total: c.total,
        });
      }
    }
  }
  for (const id of Array.from(abiertos.keys())) cerrar(id);
  return out.sort((a, b) => a.desde.localeCompare(b.desde));
}

/** Cruce de una fila para la columna «Cruces»: área y días que se pisan con otra persona. */
export function cruceDeFila(f: Pick<FilaAusencia, 'cruces'>): { desde: string; hasta: string; aprobado: boolean } | null {
  const c = f.cruces ?? [];
  if (c.length === 0) return null;
  return {
    desde: c.reduce((m, x) => (x.desde < m ? x.desde : m), c[0].desde),
    hasta: c.reduce((m, x) => (x.hasta > m ? x.hasta : m), c[0].hasta),
    aprobado: c.some((x) => x.estado === 'approved' || x.estado === 'taken'),
  };
}

/** Lunes de la semana de un día (para agrupar la lista móvil «Semana del 21 al 27 de dic.»). */
export function lunesDe(dia: string): string {
  return addPlainDays(dia, -((diaDeSemana(dia) + 6) % 7));
}

export function agruparPorSemana(filas: readonly FilaAusencia[], min: string): { lunes: string; filas: FilaAusencia[] }[] {
  const grupos = new Map<string, FilaAusencia[]>();
  for (const f of filas) {
    const clave = lunesDe(f.desde < min ? min : f.desde);
    const g = grupos.get(clave);
    if (g) g.push(f);
    else grupos.set(clave, [f]);
  }
  return Array.from(grupos.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([lunes, lista]) => ({ lunes, filas: lista }));
}

/* ── Meses ─────────────────────────────────────────────────────────────── */

export function esMes(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
}

export function mesDeDia(dia: string): string {
  return dia.slice(0, 7);
}

export function sumarMes(mes: string, n: number): string {
  const [a, m] = mes.split('-').map(Number);
  const total = a * 12 + (m - 1) + n;
  const anio = Math.floor(total / 12);
  const mm = (total % 12) + 1;
  return `${anio}-${mm < 10 ? `0${mm}` : mm}`;
}

export function primerDia(mes: string): string {
  return `${mes}-01`;
}

export function ultimoDia(mes: string): string {
  return addPlainDays(primerDia(sumarMes(mes, 1)), -1);
}

/* ── Licencias ─────────────────────────────────────────────────────────── */

/** Licencia de maternidad: fin del período (días calendario) y semanas antes del parto. */
export function licenciaMaternidad(empieza: string, semanas: number, fechaParto: string | null): { termina: string; dias: number; semanasAntes: number | null } {
  const dias = Math.round(semanas * 7);
  const termina = addPlainDays(empieza, dias - 1);
  if (!fechaParto) return { termina, dias, semanasAntes: null };
  const [a1, m1, d1] = empieza.split('-').map(Number);
  const [a2, m2, d2] = fechaParto.split('-').map(Number);
  const diff = Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86_400_000);
  return { termina, dias, semanasAntes: Math.max(0, Math.round(diff / 7)) };
}

/** Horas de un permiso por horas («8:00 – 10:00» → 2). */
export function horasEntre(inicio: string, fin: string): number {
  const [h1, m1] = inicio.split(':').map(Number);
  const [h2, m2] = fin.split(':').map(Number);
  return Math.max(0, Math.round(((h2 * 60 + m2 - (h1 * 60 + m1)) / 60) * 100) / 100);
}

/** Saldo con dos decimales sin ceros de sobra (15 → «15», 23,38 → «23,38»). */
export function numeroDias(n: number | null | undefined, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(Number(n ?? 0));
}

/* ── Formularios ───────────────────────────────────────────────────────── */

const CIE10 = /^([A-Za-z][0-9]{2}(?:\.?[0-9A-Za-z]{1,4})?)\s*(?:[·\-–:]\s*)?(.*)$/;

/** «J11 · Influenza» → código y descripción; un texto sin código va como descripción. */
export function partirDiagnostico(v: string): { diagnostico_codigo?: string; diagnostico?: string } {
  const s = v.trim();
  if (!s) return {};
  const m = CIE10.exec(s);
  if (m) return { diagnostico_codigo: m[1].toUpperCase(), diagnostico: m[2]?.trim() || undefined };
  return { diagnostico: s };
}

/** Código de error de la simulación («saldo_insuficiente: tienes…» → «saldo_insuficiente»). */
export function codigoError(mensaje: string | null | undefined): string | null {
  if (!mensaje) return null;
  return mensaje.split(':')[0]?.trim() || null;
}

/** Errores de la base que tienen texto propio; el resto cae en «generico». */
export const ERRORES_AUSENCIA = [
  'saldo_insuficiente',
  'ausencia_cruzada',
  'preaviso_insuficiente',
  'supera_duracion_legal',
  'supera_maximo_del_tipo',
  'sin_dias_habiles',
  'fechas_invalidas',
  'prorroga_invalida',
  'documento_invalido',
  'horas_invalidas',
  'sin_permiso',
  'sin_vinculo_activo',
  'tipo_invalido',
  'diagnostico_invalido',
  'aprobacion_sin_aprobador',
] as const;

export function claveError(codigo: string | null | undefined): (typeof ERRORES_AUSENCIA)[number] | 'generico' {
  const c = codigoError(codigo);
  return (ERRORES_AUSENCIA as readonly string[]).includes(c ?? '') ? (c as (typeof ERRORES_AUSENCIA)[number]) : 'generico';
}
