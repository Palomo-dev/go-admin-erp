/**
 * Escala de botones del kit (Figma `Button` 9:343 y `KbdButton` de «POS v2»):
 * una sola tabla de clases para `KbdButton`, `BotonImporte`, `ResultadoOperacion`
 * y los pies de diálogo. Solo tokens semánticos: nada de `dark:` ni hex.
 *
 * `ui/button` (shadcn) sigue para lo que ya lo usa; lo nuevo del kit dibuja con esto.
 */
import { cn } from '@/utils/Utils';

/** primary · outline · ghost · destructive de Figma, más el tinte de marca (secundaria suave). */
export type VarianteBoton = 'primario' | 'secundario' | 'fantasma' | 'destructivo' | 'tinte';
/** sm 32 · md 40 · lg 48 px. */
export type TamanoBoton = 'sm' | 'md' | 'lg';
/** Escalas verificadas en Figma; compatibilidad conserva los consumidores anteriores. */
export type PatronBoton = 'compatibilidad' | 'button' | 'kbd';
export type TemaKbd = 'claro' | 'oscuro' | 'marca';

const BASE =
  'inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-lg font-medium transition-colors ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 ' +
  'disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50';

const VARIANTE: Record<VarianteBoton, string> = {
  primario: 'bg-brand-action text-fg-on-brand hover:bg-brand-action-hover',
  secundario: 'border border-line-strong bg-surface text-fg hover:bg-hover',
  fantasma: 'text-fg-secondary hover:bg-hover hover:text-fg',
  destructivo: 'bg-danger text-fg-on-brand hover:bg-danger-hover',
  tinte: 'bg-brand-tint text-brand-deep hover:bg-brand-tint-hover',
};

const TAMANO: Record<TamanoBoton, string> = {
  sm: 'h-8 gap-1.5 px-3 text-[13px]',
  md: 'h-10 gap-2 px-4 text-sm',
  lg: 'h-12 gap-2 px-5 text-base',
};

const TAMANO_BUTTON: Record<TamanoBoton, string> = {
  sm: 'h-8 gap-2 px-3 text-xs leading-4',
  md: 'h-10 gap-2 px-4 text-sm leading-5',
  lg: 'h-12 gap-2 px-5 text-sm leading-5',
};

const TAMANO_KBD: Record<TamanoBoton, string> = {
  sm: 'h-8 gap-2 px-3 text-sm leading-5',
  md: 'h-10 gap-2 px-4 text-sm leading-5',
  lg: 'h-12 gap-2 px-5 text-base leading-[22px]',
};

/** Tamaño del icono según el botón. */
export const TAMANO_ICONO: Record<TamanoBoton, string> = { sm: 'size-4', md: 'size-4', lg: 'size-5' };

export function clasesBoton({
  variante = 'primario',
  tamano = 'md',
  patron = 'compatibilidad',
  anchoCompleto,
  className,
}: {
  variante?: VarianteBoton;
  tamano?: TamanoBoton;
  /** Button 9:343 o KbdButton 237:76798; no cambia la escala por defecto. */
  patron?: PatronBoton;
  anchoCompleto?: boolean;
  className?: string;
} = {}): string {
  // Ancho completo también se encoge: con `shrink-0` de la base, un botón al 100 %
  // junto a otro («Volver» + «Continuar») medía 100 % + el vecino y desbordaba el
  // contenedor (en el móvil el diálogo de nueva organización quedaba corrido).
  const escala = patron === 'button' ? TAMANO_BUTTON : patron === 'kbd' ? TAMANO_KBD : TAMANO;
  return cn(BASE, VARIANTE[variante], escala[tamano], anchoCompleto && 'w-full min-w-0 shrink', className);
}

/** Tema del `Kbd` que va dentro de un botón: sobre color de marca o peligro, `marca`; si no, `claro`. */
export function temaKbdDe(variante: VarianteBoton = 'primario'): TemaKbd {
  return variante === 'primario' || variante === 'destructivo' ? 'marca' : 'claro';
}
