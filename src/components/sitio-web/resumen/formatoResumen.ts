/**
 * Formatos del Resumen (Figma A/02a): «Hoy, 10:12 a. m.», «Ayer, 5:30 p. m.»,
 * «3 oct., 6:40 p. m.», «1.284», «2,9 %», «+12 %». Puro: la zona horaria y el
 * idioma llegan como argumentos (zona de la organización vía `useFormatDate`).
 */
import { formatDateInTz } from '@/lib/utils/dateDisplay';
import { addPlainDays, toPlainDate } from '@/lib/utils/dateCore';
import type { AreaCambio } from '@/lib/website/v2/diferenciasDocumento';

export type CuandoRelativo = { tipo: 'hoy' | 'ayer'; hora: string } | { tipo: 'fecha'; texto: string };

export function cuandoRelativo(valor: string, zona: string, locale: string, ahora: Date = new Date()): CuandoRelativo {
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return { tipo: 'fecha', texto: '' };
  const dia = toPlainDate(fecha, zona);
  const hoy = toPlainDate(ahora, zona);
  const hora = formatDateInTz(fecha, zona, { locale, hour: 'numeric', minute: '2-digit', hour12: true });
  if (dia === hoy) return { tipo: 'hoy', hora };
  if (dia === addPlainDays(hoy, -1)) return { tipo: 'ayer', hora };
  return {
    tipo: 'fecha',
    texto: formatDateInTz(fecha, zona, { locale, day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true }),
  };
}

export function formatoEntero(n: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(n);
}

/**
 * Fracción 0-1 → «2,9 %». El manual de marca escribe el porcentaje separado
 * por un espacio fino en español, francés y portugués; según la versión de
 * ICU, `Intl` lo pega («2,9%»), así que se normaliza aquí.
 */
export function formatoPorcentaje(fraccion: number, locale: string): string {
  const texto = new Intl.NumberFormat(locale, { style: 'percent', minimumFractionDigits: 0, maximumFractionDigits: 1 }).format(fraccion);
  if (/^en\b/i.test(locale)) return texto;
  return texto.replace(/\s*%/, '\u00A0%');
}

/** Variación en puntos porcentuales ya calculada (12.3) → { signo: '+', valor: '12' }. */
export function partesVariacion(variacion: number, locale: string): { signo: string; valor: string } {
  const redondeada = Math.round(variacion);
  return {
    signo: redondeada > 0 ? '+' : redondeada < 0 ? '−' : '',
    valor: new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Math.abs(redondeada)),
  };
}

/** Nombres de las áreas cambiadas para «3 · Inicio, Carta y estilo del sitio». */
export function nombresAreas(areas: readonly AreaCambio[], nombreGlobal: (tipo: Exclude<AreaCambio['tipo'], 'pagina'>) => string): string[] {
  return areas.map((a) => (a.tipo === 'pagina' ? a.titulo : nombreGlobal(a.tipo)));
}

/** «Inicio, Carta y estilo del sitio» (la conjunción la da el idioma). */
export function listaNatural(nombres: readonly string[], unir: (lista: string, ultimo: string) => string, maximo = 3): string {
  const visibles = nombres.slice(0, maximo);
  if (visibles.length === 0) return '';
  if (visibles.length === 1) return visibles[0];
  return unir(visibles.slice(0, -1).join(', '), visibles[visibles.length - 1]);
}
