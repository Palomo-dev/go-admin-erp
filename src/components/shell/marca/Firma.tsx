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

type TamanoIsotipo = 16 | 24 | 32 | 40 | 64;

const ISOTIPO: Record<TamanoIsotipo, { lado: string; radio: string; texto: string }> = {
  // 16: sello sobre el avatar de la organización en la pantalla de arranque.
  16: { lado: 'h-4 w-4', radio: 'rounded-[5px]', texto: 'text-[5.5px] tracking-[-0.01em]' },
  24: { lado: 'h-6 w-6', radio: 'rounded-[7px]', texto: 'text-[8px] tracking-[-0.01em]' },
  32: { lado: 'h-8 w-8', radio: 'rounded-[9px]', texto: 'text-[10.5px] tracking-[-0.01em]' },
  40: { lado: 'h-10 w-10', radio: 'rounded-[12px]', texto: 'text-[13px] tracking-[-0.01em]' },
  // 64 (Isotipo Size=64 de Figma): pantalla de arranque («Comprobando tu sesión»).
  64: { lado: 'h-16 w-16', radio: 'rounded-[18.5px]', texto: 'text-[21px] tracking-[-0.01em]' },
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

/**
 * `tamano` 32 es la Firma `Size=32` del acceso (Figma `EscenaAcceso`, 1129:36409):
 * isotipo de 32 y texto de 18. Por defecto 24 (shell, drawer).
 */
export function Firma({
  invertido = false,
  tamano = 24,
  className,
}: {
  invertido?: boolean;
  tamano?: 24 | 32;
  className?: string;
}) {
  return (
    <span className={cn('inline-flex items-center', tamano === 32 ? 'gap-2.5' : 'gap-2', className)}>
      <Isotipo tamano={tamano} invertido={invertido} />
      <span className={cn(tamano === 32 ? 'text-lg' : 'text-sm', 'tracking-[-0.01em]', invertido ? 'text-white' : 'text-fg')}>
        <span className="font-bold">GO </span>
        <span className="font-medium">Admin</span>
      </span>
    </span>
  );
}
