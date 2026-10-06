/**
 * Textos de la carta que se arman con datos (horario, sedes, conteos) y los
 * iconos por tipo de carta (Figma B/13-01: taza, cubiertos, libro, copa).
 * Funciones puras: el traductor llega por parámetro y se prueban sin React.
 */
import { BookOpen, CakeSlice, Coffee, Moon, UtensilsCrossed, Wine, type LucideIcon } from 'lucide-react';
import { DIAS_ISO, agruparHorario, esTodoElDia, horaCorta, type FranjaHorario, type HorarioCarta, type IconoCarta, type SedeCarta } from '@/lib/website/carta';

type T = (clave: string, valores?: Record<string, string | number>) => string;

export const ICONO_CARTA: Record<IconoCarta, LucideIcon> = {
  desayuno: Coffee,
  almuerzo: UtensilsCrossed,
  cena: Moon,
  principal: BookOpen,
  bar: Wine,
  postres: CakeSlice,
  general: UtensilsCrossed,
};

export function iconoCarta(icono: IconoCarta | null): LucideIcon {
  return icono ? ICONO_CARTA[icono] : UtensilsCrossed;
}

/** «7» o «15:30» (móvil, B/13-04). */
export function horaCompacta(hhmm: string): string {
  const [h, m] = hhmm.split(':');
  return m === '00' ? String(Number(h)) : `${Number(h)}:${m}`;
}

function franjas(t: T, lista: readonly FranjaHorario[], compacto: boolean): string {
  return lista
    .map((f) => (esTodoElDia(f) ? t('carta.todoElDia') : compacto ? `${horaCompacta(f.from)}–${horaCompacta(f.to)}` : `${horaCorta(f.from)} – ${horaCorta(f.to)}`))
    .join(', ');
}

/** «Lun–Vie 7:00 a. m. – 11:00 a. m. · Sáb–Dom 8:00 a. m. – 12:00 p. m.» (o compacto: «Lun–Vie 7–11»). */
export function resumenHorario(t: T, horario: HorarioCarta, compacto = false): string {
  const grupos = agruparHorario(horario);
  if (grupos.length === 0) return t('carta.sinHorario');
  if (grupos.length === 1 && grupos[0].desde === DIAS_ISO[0] && grupos[0].hasta === DIAS_ISO[6]) {
    return `${t('carta.todosLosDias')} ${franjas(t, grupos[0].franjas, compacto)}`;
  }
  return grupos
    .map((g) => {
      const dias = g.desde === g.hasta ? t(`carta.dias.${g.desde}`) : `${t(`carta.dias.${g.desde}`)}–${t(`carta.dias.${g.hasta}`)}`;
      return `${dias} ${franjas(t, g.franjas, compacto)}`;
    })
    .join(' · ');
}

/** «Todas las sedes», «Sede Centro» o «3 sedes». */
export function resumenSedes(t: T, sedes: number[] | null, todas: readonly SedeCarta[], compacto = false): string {
  if (sedes === null) return compacto ? t('carta.movil.todas') : t('carta.todasLasSedes');
  const nombres = sedes.map((id) => todas.find((s) => s.id === id)?.nombre).filter((n): n is string => !!n);
  if (nombres.length <= 2) return nombres.join(', ');
  return t('carta.sedesN', { n: nombres.length });
}

export function conteoCategorias(t: T, n: number): string {
  return n === 1 ? t('carta.unaCategoria') : t('carta.categorias', { n });
}

export function conteoProductos(t: T, n: number): string {
  return n === 1 ? t('carta.unProducto') : t('carta.productos', { n });
}

/** «vie 12:40 p. m.» para el banner «Ahora (…) tus clientes ven…». */
export function momentoLocal(t: T, ahora: { dia: number; hora: string }): string {
  const dia = t(`carta.dias.${ahora.dia}`).toLowerCase();
  return `${dia} ${horaCorta(ahora.hora)}`;
}
