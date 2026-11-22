/**
 * Lógica del paso «¿En qué sucursal trabajas hoy?» (Figma `08 Acceso y
 * organización` › 2728:69155 escritorio, 2728:69432 móvil y la nota de reglas
 * al lado, propuesta 2026-11-21). Módulo puro: lo usan la ruta
 * `GET/POST /api/me/sucursales` (servidor) y la pantalla
 * `/auth/select-organization/sucursal` (navegador), y las pruebas.
 *
 * - Abierta ahora / cuándo abre: con el horario de la sede (`opening_hours`,
 *   mismo formato que `horarioSede.ts`) en la zona de la sede. El horario por
 *   defecto del formulario no cuenta («sin revisar»): con él no se dice nada,
 *   igual que el sitio web no pinta «Abierto ahora».
 * - Orden: la última usada en este equipo (★), luego la principal, luego por
 *   nombre.
 * - El paso va DESPUÉS de elegir organización y solo para destinos de la app:
 *   la vuelta a una invitación o al alta (`/auth/...`) no pasa por aquí.
 */
import { DIAS_SEMANA, esHorarioPorDefecto, turnosDelDia, type DiaSemana } from '@/lib/organizacion/horarioSede';

/** Ruta del paso. Cuelga de `/auth/select-organization` a propósito: el middleware deja entrar ahí con sesión abierta. */
export const RUTA_PASO_SUCURSAL = '/auth/select-organization/sucursal';

/** Desde cuántas sucursales aparece el buscador (nota de reglas: «con más de 6»). */
export const MINIMO_BUSCADOR = 7;

/** Elección que viaja al servidor: una sucursal o la vista general. */
export const TODAS_LAS_SUCURSALES = 'todas' as const;
export type EleccionSucursal = number | typeof TODAS_LAS_SUCURSALES;

export type EstadoHorario =
  | { abierta: true }
  /** `dia` null = hoy; si no, el día de la semana en que vuelve a abrir. `hora` es 'HH:MM' de la sede. */
  | { abierta: false; abre: { dia: DiaSemana | null; hora: string } | null };

/** Lo que devuelve `GET /api/me/sucursales` por cada sucursal. */
export interface SucursalEntrada {
  id: number;
  nombre: string;
  ciudad: string | null;
  direccion: string | null;
  principal: boolean;
  /** null: la sede no tiene horario revisado; no se dice si está abierta. */
  horario: EstadoHorario | null;
  /** Caja que la persona tiene abierta en esta sucursal (`cash_sessions.id`). */
  cajaAbierta: number | null;
}

export interface RespuestaSucursalesEntrada {
  organizacion: { id: number; nombre: string };
  /** Rol de la persona en la organización (texto para mostrar; no decide permisos). */
  rol: string;
  /** «Todas las sucursales»: solo con alcance de toda la organización (`accesoTotal`). */
  verTodas: boolean;
  /** Cuántas organizaciones tiene la persona: con más de una se ofrece cambiar. */
  organizaciones: number;
  sucursales: SucursalEntrada[];
}

/** Día y minuto del día en la zona dada (Intl, sin cálculos de desfase a mano). */
export function momentoEnZona(fecha: Date, zona: string): { dia: DiaSemana; minutos: number } {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: zona,
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(fecha);
  const valor = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? '';
  const dia = valor('weekday').toLowerCase() as DiaSemana;
  const hora = Number(valor('hour')) % 24;
  const minuto = Number(valor('minute'));
  return { dia: DIAS_SEMANA.includes(dia) ? dia : 'monday', minutos: hora * 60 + minuto };
}

function aMinutos(hora: string): number {
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + m;
}

function esObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * ¿Abierta ahora? Si no, cuándo abre (hoy más tarde o el próximo día con
 * turnos). null si no hay horario o es el de por defecto sin revisar.
 * Un turno que cruza la medianoche (cierre < apertura) sigue abierto la
 * madrugada siguiente.
 */
export function estadoHorario(horario: unknown, ahora: { dia: DiaSemana; minutos: number }): EstadoHorario | null {
  if (!esObjeto(horario) || esHorarioPorDefecto(horario)) return null;
  const tieneAlgunTurno = DIAS_SEMANA.some((d) => turnosDelDia(horario[d]).length > 0);
  if (!tieneAlgunTurno) return null;

  const indiceHoy = DIAS_SEMANA.indexOf(ahora.dia);
  const hoy = turnosDelDia(horario[ahora.dia]);
  const ayer = turnosDelDia(horario[DIAS_SEMANA[(indiceHoy + 6) % 7]]);

  const abiertaHoy = hoy.some((t) => {
    const ini = aMinutos(t.open);
    const fin = aMinutos(t.close);
    return fin > ini ? ahora.minutos >= ini && ahora.minutos < fin : ahora.minutos >= ini;
  });
  const sigueDeAyer = ayer.some((t) => aMinutos(t.close) < aMinutos(t.open) && ahora.minutos < aMinutos(t.close));
  if (abiertaHoy || sigueDeAyer) return { abierta: true };

  const masTarde = hoy
    .map((t) => t.open)
    .filter((h) => aMinutos(h) > ahora.minutos)
    .sort((a, b) => aMinutos(a) - aMinutos(b))[0];
  if (masTarde) return { abierta: false, abre: { dia: null, hora: masTarde } };

  for (let i = 1; i <= 7; i++) {
    const dia = DIAS_SEMANA[(indiceHoy + i) % 7];
    const primero = turnosDelDia(horario[dia]).sort((a, b) => aMinutos(a.open) - aMinutos(b.open))[0];
    if (primero) return { abierta: false, abre: { dia, hora: primero.open } };
  }
  return { abierta: false, abre: null };
}

function sinTildes(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * Orden de la nota de reglas: la última usada en este equipo primero, luego la
 * principal, luego por nombre. Con `texto`, solo las que lo contienen en el
 * nombre, la ciudad o la dirección (sin distinguir mayúsculas ni tildes).
 */
export function ordenarSucursalesEntrada<T extends Pick<SucursalEntrada, 'id' | 'nombre' | 'ciudad' | 'direccion' | 'principal'>>(
  sucursales: readonly T[],
  opciones: { ultimaId?: number | null; texto?: string } = {},
): T[] {
  const q = sinTildes(opciones.texto?.trim() ?? '');
  const peso = (s: T) => (s.id === opciones.ultimaId ? 0 : s.principal ? 1 : 2);
  return sucursales
    .filter((s) => !q || [s.nombre, s.ciudad, s.direccion].some((v) => v && sinTildes(v).includes(q)))
    .slice()
    .sort((a, b) => peso(a) - peso(b) || a.nombre.localeCompare(b.nombre, 'es'));
}

/**
 * Adónde mandar tras elegir la organización: al paso de sucursal con el
 * destino ya validado. Los destinos `/auth/...` (invitación, alta) van directo.
 */
export function rutaPasoSucursal(destino: string): string {
  if (destino.startsWith('/auth/')) return destino;
  return `${RUTA_PASO_SUCURSAL}?dest=${encodeURIComponent(destino)}`;
}

/** Elección que manda el navegador: un id positivo o «todas». Cualquier otra cosa, null. */
export function leerEleccion(valor: unknown): EleccionSucursal | null {
  if (valor === TODAS_LAS_SUCURSALES) return TODAS_LAS_SUCURSALES;
  const n = typeof valor === 'number' ? valor : typeof valor === 'string' && /^\d+$/.test(valor) ? Number(valor) : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * Salida del paso (reemplaza la entrada del historial: «atrás» no vuelve aquí).
 * Es el único efecto del módulo y está aparte para poder doblarlo en pruebas:
 * jsdom no deja sustituir `window.location.replace`.
 */
export function salirDelPaso(url: string): void {
  window.location.replace(url);
}

/** Tecla 1–9 → índice 0–8; cualquier otra, null. */
export function indiceDeAtajo(tecla: string): number | null {
  return /^[1-9]$/.test(tecla) ? Number(tecla) - 1 : null;
}
