/**
 * Contador regresivo en el editor nuevo: lee y escribe LAS MISMAS columnas de `website_settings`
 * que el editor viejo (Sitio › Tienda › Ajustes globales · «Contador regresivo»), con los mismos
 * valores por defecto. Una sola configuración: lo que se cambie aquí lo ve el editor viejo y al revés.
 * Lógica pura (sin React) para poder probarla.
 */
import { partirFin } from './finContador';
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

/** Dónde se ve: columna de `website_settings` y su valor por defecto en el editor viejo. */
export const UBICACIONES_CONTADOR = [
  { columna: 'countdown_show_in_header', etiqueta: 'Encabezado', porDefecto: true },
  { columna: 'countdown_show_in_cart', etiqueta: 'Carrito', porDefecto: true },
  { columna: 'checkout_show_countdown', etiqueta: 'Pago (checkout)', porDefecto: false },
  { columna: 'countdown_show_in_product', etiqueta: 'Ficha de producto', porDefecto: true },
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
    zona: typeof s.countdown_timezone === 'string' && s.countdown_timezone ? s.countdown_timezone : DEFAULT_TIMEZONE,
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
