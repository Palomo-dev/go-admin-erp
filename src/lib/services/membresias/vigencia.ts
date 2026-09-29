/**
 * Vigencias de membresías: funciones puras para PREVISUALIZAR y MOSTRAR.
 *
 * La fuente de verdad es la base (fn_membresias_int_fin / fn_membresias_int_restar /
 * fn_membresias_vencer, migración 20260929001000): allí se crean, renuevan, recortan y vencen
 * las membresías. Aquí solo se replica la aritmética para que el diálogo «Renovar» enseñe el
 * vencimiento nuevo antes de cobrar, y para pintar el estado («En gracia 2 d», «Vence en 5 d»)
 * con la zona de la organización. Si cambia la regla en SQL, cambia aquí y en
 * `__tests__/vigencia.test.ts` (que corre con TZ=UTC y TZ=America/Bogota).
 *
 * Regla: N periodos que empiezan en el día D terminan el día (D + N·unidad − 1) a las 23:59:59
 * de la zona de la organización. 1 mes pagado el 28 sep vence el 27 oct 23:59:59.
 */
import { addPlainDays, plainDateToInstant, toPlainDate } from '@/lib/utils/dateCore';

export type UnidadDuracion = 'day' | 'week' | 'month' | 'year';

export type EstadoMembresia = 'pending' | 'active' | 'frozen' | 'past_due' | 'expired' | 'cancelled';

/** Estado tal como se muestra (badge). «pending» se parte en «por pagar» y «por activar». */
export type EstadoVisual =
  | 'pendiente_pago'
  | 'por_activar'
  | 'activa'
  | 'congelada'
  | 'en_gracia'
  | 'vencida'
  | 'cancelada';

function partes(plain: string): [number, number, number] {
  const [y, m, d] = plain.split('-').map(Number);
  return [y, m, d];
}

function dosDigitos(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function diasDelMes(anio: number, mes: number): number {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate();
}

/**
 * Suma meses a un día calendario con la regla de Postgres (`date + interval 'N months'`):
 * si el día no existe en el mes destino, se queda en el último día (31 ene + 1 mes = 28/29 feb).
 */
export function sumarMesesPlano(plain: string, meses: number): string {
  const [y, m, d] = partes(plain);
  const total = y * 12 + (m - 1) + meses;
  const anio = Math.floor(total / 12);
  const mes = (total % 12) + 1;
  const dia = Math.min(d, diasDelMes(anio, mes));
  return `${anio}-${dosDigitos(mes)}-${dosDigitos(dia)}`;
}

/** Día calendario + N periodos de la unidad dada (misma regla que Postgres). */
export function sumarPeriodosPlano(plain: string, unidad: UnidadDuracion, cantidad: number): string {
  switch (unidad) {
    case 'week':
      return addPlainDays(plain, 7 * cantidad);
    case 'month':
      return sumarMesesPlano(plain, cantidad);
    case 'year':
      return sumarMesesPlano(plain, 12 * cantidad);
    default:
      return addPlainDays(plain, cantidad);
  }
}

function periodosValidos(n: number | null | undefined): number {
  const v = Math.floor(Number(n ?? 1));
  return Number.isFinite(v) && v >= 1 ? v : 1;
}

/** Instante de fin de un día calendario (23:59:59 de la zona). */
export function finDeDia(plain: string, tz: string): Date {
  return new Date(plainDateToInstant(plain, tz, '23:59:59'));
}

/** Espejo de fn_membresias_int_fin. */
export function calcularFin(
  inicio: Date,
  unidad: UnidadDuracion,
  valor: number,
  periodos: number,
  tz: string,
): Date {
  const dia = toPlainDate(inicio, tz);
  const n = periodosValidos(valor) * periodosValidos(periodos);
  const ultimo = addPlainDays(sumarPeriodosPlano(dia, unidad, n), -1);
  return finDeDia(ultimo, tz);
}

/** Espejo de fn_membresias_int_restar (recorte por devolución o nota crédito). */
export function restarPeriodos(
  fin: Date,
  unidad: UnidadDuracion,
  valor: number,
  periodos: number,
  tz: string,
): Date {
  const siguiente = addPlainDays(toPlainDate(fin, tz), 1);
  const n = periodosValidos(valor) * periodosValidos(periodos);
  const ultimo = addPlainDays(sumarPeriodosPlano(siguiente, unidad, -n), -1);
  return finDeDia(ultimo, tz);
}

/**
 * Vista previa de una renovación (P3: suma desde el vencimiento, no desde hoy). Si ya venció,
 * el periodo nuevo empieza hoy. Devuelve desde/hasta del periodo nuevo.
 */
export function previsualizarRenovacion(
  finActual: Date,
  ahora: Date,
  unidad: UnidadDuracion,
  valor: number,
  periodos: number,
  tz: string,
): { desde: Date; hasta: Date } {
  const siguiente = new Date(finActual.getTime() + 1000);
  const desde = siguiente.getTime() > ahora.getTime() ? siguiente : ahora;
  return { desde, hasta: calcularFin(desde, unidad, valor, periodos, tz) };
}

/** Días calendario (en la zona) entre hoy y un instante; negativo si ya pasó. */
export function diasHasta(instante: Date, ahora: Date, tz: string): number {
  const a = partes(toPlainDate(ahora, tz));
  const b = partes(toPlainDate(instante, tz));
  const ua = Date.UTC(a[0], a[1] - 1, a[2]);
  const ub = Date.UTC(b[0], b[1] - 1, b[2]);
  return Math.round((ub - ua) / 86_400_000);
}

export interface MembresiaParaEstado {
  status: EstadoMembresia | string;
  end_date: string | Date;
  start_date?: string | Date | null;
  grace_until?: string | Date | null;
  /** true si la venta o factura de la membresía ya está pagada (solo importa en «pending»). */
  pagada?: boolean | null;
}

export interface EstadoCalculado {
  estado: EstadoVisual;
  /** Días que faltan para vencer (activa) o de gracia que quedan (en gracia). */
  dias: number | null;
}

function aFecha(v: string | Date): Date {
  return v instanceof Date ? v : new Date(v);
}

/**
 * Estado para el badge. No cambia nada: si la tarea diaria todavía no pasó, una «active» con el
 * vencimiento ya cumplido se muestra como «en gracia» o «vencida» según corresponda.
 */
export function estadoVisual(m: MembresiaParaEstado, ahora: Date, tz: string): EstadoCalculado {
  const fin = aFecha(m.end_date);
  switch (m.status) {
    case 'cancelled':
      return { estado: 'cancelada', dias: null };
    case 'frozen':
      return { estado: 'congelada', dias: null };
    case 'pending':
      return { estado: m.pagada ? 'por_activar' : 'pendiente_pago', dias: null };
    case 'expired':
      return { estado: 'vencida', dias: null };
    case 'past_due': {
      const hasta = m.grace_until ? aFecha(m.grace_until) : fin;
      if (hasta.getTime() >= ahora.getTime()) {
        return { estado: 'en_gracia', dias: Math.max(diasHasta(hasta, ahora, tz), 0) };
      }
      return { estado: 'vencida', dias: null };
    }
    default: {
      if (fin.getTime() >= ahora.getTime()) {
        return { estado: 'activa', dias: Math.max(diasHasta(fin, ahora, tz), 0) };
      }
      if (m.grace_until && aFecha(m.grace_until).getTime() >= ahora.getTime()) {
        return { estado: 'en_gracia', dias: Math.max(diasHasta(aFecha(m.grace_until), ahora, tz), 0) };
      }
      return { estado: 'vencida', dias: null };
    }
  }
}

/** ¿Vence dentro de los próximos N días (incluido hoy)? Para «por vencer». */
export function vencePronto(m: MembresiaParaEstado, ahora: Date, tz: string, dias = 7): boolean {
  const e = estadoVisual(m, ahora, tz);
  return e.estado === 'activa' && e.dias !== null && e.dias <= dias;
}

/** Duración en días aproximada (solo para ordenar o comparar planes). */
export function duracionEnDias(unidad: UnidadDuracion, valor: number): number {
  const v = periodosValidos(valor);
  switch (unidad) {
    case 'week':
      return v * 7;
    case 'month':
      return v * 30;
    case 'year':
      return v * 365;
    default:
      return v;
  }
}
