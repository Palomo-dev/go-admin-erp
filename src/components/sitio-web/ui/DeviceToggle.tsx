'use client';

import { EyeOff, type LucideIcon } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { DISPOSITIVOS_SITIO, type DispositivoSitio, type VisibilidadDispositivos } from './visibilidadDispositivo';
import { useTextosComun } from './textos';
import { ICONO_DISPOSITIVO_VISTA } from './iconosSitio';

/**
 * Interruptor de visibilidad por dispositivo (Figma «figma-estilo» 08):
 *
 * - visible: tinte de marca, borde de marca, icono del dispositivo y texto en
 *   azul profundo.
 * - oculta: borde neutro, ojo tachado y texto atenuado.
 *
 * Es un botón con `aria-pressed`. `DeviceToggleGroup` pinta los tres en fila
 * sobre `VisibilidadDispositivos` (panel de estilo de la sección del editor).
 */
// Los iconos salen de la tabla única del módulo (iconosSitio.ts): el computador del
// interruptor es el mismo monitor del selector de ancho del editor.
const ICONO: Record<DispositivoSitio, LucideIcon> = {
  computador: ICONO_DISPOSITIVO_VISTA.escritorio,
  tableta: ICONO_DISPOSITIVO_VISTA.tableta,
  celular: ICONO_DISPOSITIVO_VISTA.celular,
};

export interface DeviceToggleProps {
  dispositivo: DispositivoSitio;
  visible: boolean;
  onCambiar: (visible: boolean) => void;
  deshabilitado?: boolean;
  className?: string;
}

export function DeviceToggle({ dispositivo, visible, onCambiar, deshabilitado, className }: DeviceToggleProps) {
  const tx = useTextosComun();
  const Icono = visible ? ICONO[dispositivo] : EyeOff;
  const nombre = tx(`dispositivos.${dispositivo}`);
  return (
    <button
      type="button"
      aria-pressed={visible}
      aria-label={tx('dispositivos.mostrarEn', { dispositivo: nombre })}
      disabled={deshabilitado}
      onClick={() => onCambiar(!visible)}
      className={cn(
        'inline-flex h-10 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-50',
        visible ? 'border-line-brand bg-brand-tint text-brand-deep' : 'border-line-strong bg-surface text-fg-muted hover:bg-hover',
        className,
      )}
    >
      <Icono aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.5} />
      <span aria-hidden="true">{nombre}</span>
    </button>
  );
}

export interface DeviceToggleGroupProps {
  valor: VisibilidadDispositivos;
  onCambiar: (valor: VisibilidadDispositivos) => void;
  /** Dispositivos a mostrar; los tres por defecto. */
  dispositivos?: readonly DispositivoSitio[];
  /** Etiqueta del grupo para lectores de pantalla («Mostrar la sección en»). */
  etiqueta: string;
  deshabilitado?: boolean;
  /** Dispositivos que no se pueden cambiar uno a uno (p. ej. tableta mientras el sitio público no la lea). */
  bloqueados?: readonly DispositivoSitio[];
  className?: string;
}

export function DeviceToggleGroup({
  valor,
  onCambiar,
  dispositivos = DISPOSITIVOS_SITIO,
  etiqueta,
  deshabilitado,
  bloqueados = [],
  className,
}: DeviceToggleGroupProps) {
  return (
    <div role="group" aria-label={etiqueta} className={cn('flex flex-wrap gap-2', className)}>
      {dispositivos.map((d) => (
        <DeviceToggle
          key={d}
          dispositivo={d}
          visible={valor[d]}
          deshabilitado={deshabilitado || bloqueados.includes(d)}
          onCambiar={(visible) => onCambiar({ ...valor, [d]: visible })}
        />
      ))}
    </div>
  );
}
