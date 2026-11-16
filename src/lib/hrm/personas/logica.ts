/**
 * Lógica pura de la lista de empleados, la ficha y registrar un cambio
 * (fase 1 de RR. HH.). Sin React: la prueban `__tests__/personasLogica.test.ts`.
 */
import type { EstadoEmpleado } from './catalogo';

export interface AlertaEmpleado {
  tipo:
    | 'contrato_vence'
    | 'contrato_vencido'
    | 'prueba_termina'
    | 'documentos_faltan'
    | 'sin_salario'
    | 'certificacion_vencida'
    | 'certificacion_por_vencer'
    | 'documento_vencido'
    | 'documento_por_vencer';
  nivel: 'peligro' | 'advertencia' | 'informacion';
  fecha?: string;
  dias?: number;
  n?: number;
  nombre?: string;
  categoria?: string;
  categorias?: string[];
  id?: string;
}

/**
 * Acceso a la app de un empleado (revisión 2026-11-15): cada empleado es un
 * usuario. Mientras no acepta la invitación del alta está «pendiente» o
 * «vencida»; «desactivado» es un usuario desactivado en Organización › Equipo.
 */
export const ESTADOS_ACCESO = ['activo', 'invitacion_pendiente', 'invitacion_vencida', 'desactivado'] as const;
export type EstadoAcceso = (typeof ESTADOS_ACCESO)[number];

/** «Reenviar invitación» solo para quien todavía no entra y sigue en la organización. */
export function puedeReenviarInvitacion(e: { acceso: EstadoAcceso; estado: EstadoEmpleado }): boolean {
  return (e.acceso === 'invitacion_pendiente' || e.acceso === 'invitacion_vencida') && e.estado !== 'retirado';
}

export interface EmpleadoFila {
  persona_id: string;
  vinculo_id: string;
  nombre: string | null;
  doc_tipo: string | null;
  doc_numero: string | null;
  cargo_id: string | null;
  cargo: string | null;
  area_id: string | null;
  area: string | null;
  sede_id: number | null;
  sede: string | null;
  tipo_contrato: string | null;
  fin_contrato: string | null;
  ingreso: string | null;
  retiro: string | null;
  estado: EstadoEmpleado;
  acceso: EstadoAcceso;
  alertas: AlertaEmpleado[];
}

export interface FiltrosEmpleados {
  texto: string;
  estados: readonly EstadoEmpleado[];
  contratos: readonly string[];
  area: string | null;
  cargo: string | null;
}

export const FILTROS_INICIALES: FiltrosEmpleados = {
  texto: '',
  estados: ['activo', 'periodo_prueba', 'por_ingresar'],
  contratos: [],
  area: null,
  cargo: null,
};

/** Minúsculas y sin tildes, para buscar «Andres» y encontrar «Andrés». */
export function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

export function filtrarEmpleados(filas: readonly EmpleadoFila[], f: FiltrosEmpleados): EmpleadoFila[] {
  const q = normalizar(f.texto);
  const qDoc = f.texto.replace(/[.\s]/g, '');
  return filas.filter((e) => {
    if (f.estados.length > 0 && !f.estados.includes(e.estado)) return false;
    if (f.contratos.length > 0 && !f.contratos.includes(e.tipo_contrato ?? '')) return false;
    if (f.area && e.area_id !== f.area) return false;
    if (f.cargo && e.cargo_id !== f.cargo) return false;
    if (!q) return true;
    return (
      normalizar(e.nombre ?? '').includes(q) ||
      (qDoc.length >= 3 && (e.doc_numero ?? '').includes(qDoc)) ||
      normalizar(e.cargo ?? '').includes(q)
    );
  });
}

/** Cuántos filtros del panel hay activos (el estado por defecto no cuenta). */
export function conteoFiltros(f: FiltrosEmpleados): number {
  const estadosPorDefecto =
    f.estados.length === FILTROS_INICIALES.estados.length && f.estados.every((s) => FILTROS_INICIALES.estados.includes(s));
  return (estadosPorDefecto ? 0 : 1) + (f.contratos.length > 0 ? 1 : 0) + (f.area ? 1 : 0) + (f.cargo ? 1 : 0);
}

export interface ResumenEmpleados {
  activos: number;
  prueba: number;
  porIngresar: number;
  retirados: number;
}

export function resumenEmpleados(filas: readonly EmpleadoFila[]): ResumenEmpleados {
  const r: ResumenEmpleados = { activos: 0, prueba: 0, porIngresar: 0, retirados: 0 };
  for (const e of filas) {
    if (e.estado === 'retirado') r.retirados += 1;
    else if (e.estado === 'por_ingresar') r.porIngresar += 1;
    else {
      r.activos += 1;
      if (e.estado === 'periodo_prueba') r.prueba += 1;
    }
  }
  return r;
}

const PESO_NIVEL: Record<AlertaEmpleado['nivel'], number> = { peligro: 0, advertencia: 1, informacion: 2 };

/** Alertas ordenadas: primero lo vencido, luego lo que vence antes. */
export function ordenarAlertas(alertas: readonly AlertaEmpleado[]): AlertaEmpleado[] {
  return [...alertas].sort((a, b) => {
    const n = PESO_NIVEL[a.nivel] - PESO_NIVEL[b.nivel];
    if (n !== 0) return n;
    return (a.fecha ?? '9999').localeCompare(b.fecha ?? '9999');
  });
}

/** La alerta que se ve en la fila (la más urgente). */
export function alertaPrincipal(alertas: readonly AlertaEmpleado[]): AlertaEmpleado | null {
  return ordenarAlertas(alertas)[0] ?? null;
}

/** Días entre dos fechas planas `YYYY-MM-DD` (b − a). */
export function diasEntre(a: string, b: string): number {
  const [ya, ma, da] = a.split('-').map(Number);
  const [yb, mb, db] = b.split('-').map(Number);
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86_400_000);
}

/** Antigüedad en años y meses cumplidos entre el ingreso y hoy (fechas planas). */
export function antiguedad(ingreso: string | null | undefined, hoy: string): { anios: number; meses: number } | null {
  if (!ingreso || !/^\d{4}-\d{2}-\d{2}$/.test(ingreso) || ingreso > hoy) return null;
  const [yi, mi, di] = ingreso.split('-').map(Number);
  const [yh, mh, dh] = hoy.split('-').map(Number);
  let meses = (yh - yi) * 12 + (mh - mi);
  if (dh < di) meses -= 1;
  return { anios: Math.floor(meses / 12), meses: meses % 12 };
}

/** Edad cumplida a hoy. */
export function edad(nacimiento: string | null | undefined, hoy: string): number | null {
  const a = antiguedad(nacimiento, hoy);
  return a ? a.anios : null;
}

/** Diferencia y porcentaje de un cambio de salario. */
export function diferenciaSalario(anterior: number | null, nuevo: number | null): { diferencia: number; pct: number | null } | null {
  if (nuevo == null || anterior == null) return null;
  const diferencia = nuevo - anterior;
  const pct = anterior > 0 ? Math.round((diferencia / anterior) * 1000) / 10 : null;
  return { diferencia, pct };
}

/** Iniciales para el avatar: «Andrés Felipe Morales» → «AM». */
export function iniciales(nombre: string | null | undefined): string {
  const partes = (nombre ?? '').trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  const primera = partes[0][0] ?? '';
  const ultima = partes.length > 2 ? partes[partes.length - 2][0] : partes.length > 1 ? partes[1][0] : '';
  return (primera + ultima).toUpperCase();
}

/** Primer día del mes siguiente a una fecha plana (sugerencia de «Fecha de efecto»). */
export function primerDiaMesSiguiente(hoy: string): string {
  const [y, m] = hoy.split('-').map(Number);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return `${ny}-${String(nm).padStart(2, '0')}-01`;
}
