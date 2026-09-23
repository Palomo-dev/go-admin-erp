/**
 * Isotipo y firma de GO Admin (manual de marca v2.0; Figma `02 Componentes` ›
 * Fundamentos › Isotipo y Firma).
 *
 * Isotipo: cuadrado Azul GO, radio 0,29× del lado, «GO» Inter 700 blanco al
 * ~0,52× del ancho. No se deforma ni se recolorea fuera de Azul GO / blanco.
 * `invertido` es la variante sobre fondo Azul GO (drawer móvil): cuadrado blanco
 * con «GO» azul.
 */
import { cn } from '@/lib/utils';

type TamanoIsotipo = 24 | 32 | 40;

const ISOTIPO: Record<TamanoIsotipo, { lado: string; radio: string; texto: string }> = {
  24: { lado: 'h-6 w-6', radio: 'rounded-[7px]', texto: 'text-[8px] tracking-[-0.01em]' },
  32: { lado: 'h-8 w-8', radio: 'rounded-[9px]', texto: 'text-[10.5px] tracking-[-0.01em]' },
  40: { lado: 'h-10 w-10', radio: 'rounded-[12px]', texto: 'text-[13px] tracking-[-0.01em]' },
};

export function Isotipo({
  tamano = 24,
  invertido = false,
  className,
}: {
  tamano?: TamanoIsotipo;
  invertido?: boolean;
  className?: string;
}) {
  const t = ISOTIPO[tamano];
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center font-bold leading-none',
        t.lado,
        t.radio,
        t.texto,
        invertido ? 'bg-white text-brand' : 'bg-brand text-fg-on-brand',
        className
      )}
    >
      GO
    </span>
  );
}

export function Firma({ invertido = false, className }: { invertido?: boolean; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <Isotipo tamano={24} invertido={invertido} />
      <span className={cn('text-sm tracking-[-0.01em]', invertido ? 'text-white' : 'text-fg')}>
        <span className="font-bold">GO </span>
        <span className="font-medium">Admin</span>
      </span>
    </span>
  );
}
