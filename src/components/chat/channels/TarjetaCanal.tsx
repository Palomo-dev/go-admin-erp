'use client';

/**
 * Tarjeta de canal (Figma 91-chat-00 «TarjetaCanal», usada en 91-chat-20
 * «Conectar otro canal»): ícono del canal, nombre, insignia de estado,
 * descripción y una acción. `proximamente` no tiene botón: es solo texto.
 */
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { clasesBoton } from '@/components/kit';
import { cn } from '@/utils/Utils';
import { CanalIcono, type Canal } from '@/components/chat/ui/CanalIcono';

export type EstadoTarjetaCanal = 'conectado' | 'disponible' | 'proximamente';

export interface TarjetaCanalProps {
  canal: Canal;
  titulo: string;
  /** Texto de la insignia («Conectado», «Disponible», «Próximamente»). */
  etiquetaEstado: string;
  estado: EstadoTarjetaCanal;
  descripcion?: ReactNode;
  /** Botón de la tarjeta. Con `estado="proximamente"` se pinta como texto atenuado. */
  accion: { etiqueta: string; onClick?: () => void };
  className?: string;
}

const TONO: Record<EstadoTarjetaCanal, 'exito' | 'neutro'> = {
  conectado: 'exito',
  disponible: 'neutro',
  proximamente: 'neutro',
};

export function TarjetaCanal({ canal, titulo, etiquetaEstado, estado, descripcion, accion, className }: TarjetaCanalProps) {
  const proximo = estado === 'proximamente';
  return (
    <article className={cn('flex h-full flex-col gap-3 rounded-xl border border-line bg-surface p-4', className)}>
      <div className="flex items-start gap-3">
        <CanalIcono canal={canal} size={40} className={cn('rounded-lg', proximo && 'opacity-60')} />
        <div className="flex min-w-0 flex-col items-start gap-1">
          <h3 className={cn('truncate text-[15px] font-medium leading-5', proximo ? 'text-fg-secondary' : 'text-fg')}>{titulo}</h3>
          <Badge tono={TONO[estado]} tamano="sm">
            {etiquetaEstado}
          </Badge>
        </div>
      </div>
      {descripcion && <p className={cn('flex-1 text-[13px] leading-5', proximo ? 'text-fg-muted' : 'text-fg-secondary')}>{descripcion}</p>}
      {proximo ? (
        <p className="pt-1 text-center text-[13px] font-medium text-fg-secondary">{accion.etiqueta}</p>
      ) : (
        <button
          type="button"
          onClick={accion.onClick}
          className={clasesBoton({ variante: estado === 'conectado' ? 'secundario' : 'primario', tamano: 'sm', anchoCompleto: true })}
        >
          {accion.etiqueta}
        </button>
      )}
    </article>
  );
}
