'use client';

import { useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { Badge } from '@/components/ui/badge';
import { clasesBoton } from './botonClases';
import { Kbd } from './Kbd';
import { useAtajos, type Atajo } from './useAtajos';
import { useKitTextos } from './useIdiomaKit';

/**
 * Barra «Tienes cambios sin guardar» (Figma Sitio web B/12-01; también Diseño,
 * SEO, Ventas en línea y POS › Configuración de reservas): contador «N
 * cambios», «Descartar» y «Guardar cambios» con Ctrl+S.
 *
 * - Escritorio: pegada al pie del contenido (`sticky`), ancho del formulario.
 * - Móvil (< lg): fija abajo, a todo el ancho, con el margen seguro del iPhone.
 *
 * Solo se pinta si `cambios > 0` o mientras guarda. Ctrl+S funciona aunque el
 * foco esté en un campo (es lo que la persona espera al escribir).
 */
export interface SettingsSaveBarProps {
  /** Cuántos cambios sin guardar; 0 oculta la barra. */
  cambios: number;
  onGuardar: () => void;
  onDescartar: () => void;
  guardando?: boolean;
  /** Bloquea «Guardar» (formulario inválido) con el motivo para el lector de pantalla. */
  deshabilitado?: boolean;
  motivo?: string;
  /** Texto del primario; por defecto «Guardar cambios». */
  textoGuardar?: string;
  /** Mensaje; por defecto «Tienes cambios sin guardar». */
  mensaje?: string;
  className?: string;
}

export function SettingsSaveBar({
  cambios,
  onGuardar,
  onDescartar,
  guardando = false,
  deshabilitado = false,
  motivo,
  textoGuardar,
  mensaje,
  className,
}: SettingsSaveBarProps) {
  const tx = useKitTextos();
  const visible = cambios > 0 || guardando;
  const atajos = useMemo<Atajo[]>(
    () => [
      {
        tecla: 'Ctrl+S',
        descripcion: tx('barraGuardado.guardar', 'Guardar cambios'),
        accion: onGuardar,
        cuando: () => cambios > 0 && !guardando && !deshabilitado,
        permitirEnCampo: true,
      },
    ],
    [tx, onGuardar, cambios, guardando, deshabilitado],
  );
  useAtajos(atajos, { activo: visible });

  if (!visible) return null;

  return (
    <div
      role="region"
      aria-label={tx('barraGuardado.region', 'Cambios sin guardar')}
      className={cn(
        'z-30 flex items-center gap-3 border-line-warning bg-warning-subtle',
        'fixed inset-x-0 bottom-0 border-t px-4 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3',
        'lg:sticky lg:bottom-4 lg:rounded-xl lg:border lg:px-4 lg:py-3',
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2" aria-live="polite">
        <Badge tono="advertencia" apariencia="contorno" tamano="sm" className="shrink-0 tabular-nums">
          {tx('barraGuardado.cambios', cambios === 1 ? '1 cambio' : '{n} cambios', { n: cambios })}
        </Badge>
        <span className="hidden truncate text-sm font-medium text-warning-text sm:inline">
          {mensaje ?? tx('barraGuardado.mensaje', 'Tienes cambios sin guardar')}
        </span>
      </div>
      <button
        type="button"
        onClick={onDescartar}
        disabled={guardando}
        className={clasesBoton({ variante: 'fantasma', tamano: 'md' })}
      >
        {tx('barraGuardado.descartar', 'Descartar')}
      </button>
      <button
        type="button"
        onClick={onGuardar}
        disabled={guardando || deshabilitado || cambios === 0}
        aria-busy={guardando || undefined}
        title={deshabilitado ? motivo : undefined}
        aria-keyshortcuts="Control+S"
        className={clasesBoton({ variante: 'primario', tamano: 'md' })}
      >
        {guardando && <Loader2 aria-hidden="true" className="size-4 animate-spin" />}
        {textoGuardar ?? tx('barraGuardado.guardar', 'Guardar cambios')}
        <Kbd tecla="Ctrl+S" tema="marca" tamano="sm" className="hidden lg:inline-flex" />
      </button>
      {deshabilitado && motivo ? <span className="sr-only">{motivo}</span> : null}
    </div>
  );
}
