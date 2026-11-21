import { cn } from '@/utils/Utils';

/**
 * Código de cupón con borde punteado (Figma `CodigoCupon`, 1088:718200).
 * Tono de marca mientras se puede canjear; gris cuando no (agotado, vencido,
 * inactivo, archivado, programado).
 */
export function CodigoCupon({ codigo, vivo = true, className }: { codigo: string; vivo?: boolean; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center truncate rounded-md border border-dashed px-2 py-0.5 font-mono text-[13px] font-medium tracking-wide',
        // Tokens del sistema (sin colores sueltos ni `dark:`): el morado del Figma no es token.
        vivo ? 'border-line-brand bg-brand-tint text-brand-deep' : 'border-line-strong bg-subtle text-fg',
        className,
      )}
    >
      {codigo}
    </span>
  );
}
