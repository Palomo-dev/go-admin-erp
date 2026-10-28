/**
 * Contador regresivo en el editor nuevo: lee y escribe LAS MISMAS columnas de `website_settings`
 * que el editor viejo (Sitio › Tienda › Ajustes globales · «Contador regresivo»), con los mismos
 * valores. Una sola configuración: lo que se cambie aquí lo ve el editor viejo y al revés.
 * Lógica pura (sin React) para poder probarla.
 */
import { partirFin, unirFin } from './finContador';
import { DEFAULT_TIMEZONE } from '@/lib/utils/dateCore';

export const ZONAS_CONTADOR = [
  [DEFAULT_TIMEZONE, 'Colombia (GMT-5)'],
  ['America/Mexico_City', 'México (GMT-6)'],
  ['America/Argentina/Buenos_Aires', 'Argentina (GMT-3)'],
  ['America/Santiago', 'Chile (GMT-4)'],
  ['America/Lima', 'Perú (GMT-5)'],
  ['Europe/Madrid', 'España (GMT+1)'],
  ['America/New_York', 'EE. UU. este (GMT-5)'],
  ['America/Los_Angeles', 'EE. UU. oeste (GMT-8)'],
] as const;

/**
 * Dónde se ve: columna de `website_settings`. Una ubicación en NULL se lee como apagada, igual que
 * la tienda (que exige `=== true`/verdadero); así el editor nunca marca algo que la tienda no pinta.
 */
export const UBICACIONES_CONTADOR = [
  { columna: 'countdown_show_in_header', etiqueta: 'Encabezado', porDefecto: false },
  { columna: 'countdown_show_in_cart', etiqueta: 'Carrito', porDefecto: false },
  { columna: 'checkout_show_countdown', etiqueta: 'Pago (checkout)', porDefecto: false },
  { columna: 'countdown_show_in_product', etiqueta: 'Ficha de producto', porDefecto: false },
  { columna: 'countdown_show_in_hero', etiqueta: 'Portada (hero)', porDefecto: false },
] as const;

export type ColumnaUbicacion = (typeof UBICACIONES_CONTADOR)[number]['columna'];

export interface ContadorLegacy {
  activo: boolean;
  titulo: string;
  modo: 'daily_reset' | 'custom';
  fin: string;
  zona: string;
  horaReinicio: number;
  ubicaciones: Record<ColumnaUbicacion, boolean>;
}

export const TITULO_POR_DEFECTO = '¡Oferta por tiempo limitado!';

export function leerContador(settings: Record<string, unknown> | null | undefined): ContadorLegacy {
  const s = settings ?? {};
  const hora = Number(s.countdown_reset_hour ?? 0);
  const ubicaciones = {} as Record<ColumnaUbicacion, boolean>;
  for (const u of UBICACIONES_CONTADOR) {
    const v = s[u.columna];
    ubicaciones[u.columna] = typeof v === 'boolean' ? v : u.porDefecto;
  }
  return {
    activo: s.countdown_enabled === true,
    titulo: typeof s.countdown_title === 'string' ? s.countdown_title : '',
    modo: s.countdown_mode === 'custom' ? 'custom' : 'daily_reset',
    fin: typeof s.countdown_end_date === 'string' ? s.countdown_end_date : '',
    zona: typeof s.countdown_timezone === 'string' && s.countdown_timezone ? zonaValida(s.countdown_timezone) : DEFAULT_TIMEZONE,
    horaReinicio: Number.isInteger(hora) && hora >= 0 && hora <= 23 ? hora : 0,
    ubicaciones,
  };
}

/**
 * Fecha fin en la forma del editor viejo (`<input type="datetime-local">`): «AAAA-MM-DDTHH:mm», sin
 * desfase. La tienda la lee en la zona elegida. Un valor viejo con Z o desfase se muestra en la zona.
 */
export function finLocal(dia: string, hora: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return '';
  return `${dia}T${/^\d{2}:\d{2}$/.test(hora) ? hora : '23:59'}`;
}

export function partesFin(fin: string, zona: string): { dia: string; hora: string } {
  const { dia, hora } = partirFin(fin, zona);
  return { dia, hora };
}

/** Hora del reinicio diario como «HH:00» para el campo de hora del kit, y de vuelta a 0–23. */
export function horaATexto(h: number): string {
  return `${String(h).padStart(2, '0')}:00`;
}
export function textoAHora(t: string): number {
  const n = Number(/^(\d{1,2})/.exec(t)?.[1] ?? NaN);
  return Number.isInteger(n) && n >= 0 && n <= 23 ? n : 0;
}

/** Zona válida para Intl o la zona por defecto (como la tienda: nunca la del visitante). */
export function zonaValida(zona: string): string {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zona });
    return zona;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

function diaEnZona(instante: Date, zona: string, desplazo: number): string {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: zona, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(instante);
  const v = (t: string) => Number(p.find((x) => x.type === t)?.value ?? 0);
  // Aritmética de calendario pura (el día ya viene en la zona); UTC solo como calendario neutro.
  const f = new Date(Date.UTC(v('year'), v('month') - 1, v('day') + desplazo));
  return `${f.getUTCFullYear()}-${String(f.getUTCMonth() + 1).padStart(2, '0')}-${String(f.getUTCDate()).padStart(2, '0')}`;
}

/**
 * Instante en que termina la cuenta según la configuración, con la misma regla que la tienda
 * (`CountdownBanner` de goadmin-websites): diario → próximo reinicio estrictamente después de
 * `ahora`; fecha → el fin leído en la zona. `null` si no hay fin.
 */
export function objetivoContador(c: ContadorLegacy, ahora: Date): Date | null {
  const zona = zonaValida(c.zona);
  if (c.modo === 'custom') {
    const { dia, hora } = partesFin(c.fin, zona);
    if (!dia) return null;
    const d = new Date(unirFin(dia, hora || '23:59', zona));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const hh = horaATexto(c.horaReinicio);
  for (const desplazo of [0, 1]) {
    const d = new Date(unirFin(diaEnZona(ahora, zona, desplazo), hh, zona));
    if (d.getTime() > ahora.getTime()) return d;
  }
  return null;
}

/** «HH:MM:SS» que faltan (horas totales, como la tienda) o `null` si ya terminó / no hay fin. */
export function tiempoRestante(c: ContadorLegacy, ahora: Date): string | null {
  const fin = objetivoContador(c, ahora);
  const diff = fin ? fin.getTime() - ahora.getTime() : 0;
  if (diff <= 0) return null;
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  const s = Math.floor((diff % 60_000) / 1000);
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}
