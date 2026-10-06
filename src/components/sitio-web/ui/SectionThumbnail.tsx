'use client';

import { Plus } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { useTextosComun } from './textos';

/**
 * Miniatura esquemática de una sección (Figma A/07j; «Añadir sección» A/05e,
 * Páginas y plantillas de página): Portada, Carta destacada, Galería,
 * Reservas, Opiniones, Ubicación y horario, Texto, Productos, Eventos y
 * Llamado a la acción, más la tarjeta «Añadir sección». Dibujo con tokens
 * (no son colores del cliente): bloques en `line`, acento en `brand`.
 * Seleccionada: borde de marca y tinte.
 */
export type TipoMiniaturaSeccion =
  | 'portada'
  | 'carta_destacada'
  | 'galeria'
  | 'reservas'
  | 'opiniones'
  | 'ubicacion_horario'
  | 'texto'
  | 'productos'
  | 'eventos'
  | 'llamado_accion';

export const TIPOS_MINIATURA_SECCION: readonly TipoMiniaturaSeccion[] = [
  'portada',
  'carta_destacada',
  'galeria',
  'reservas',
  'opiniones',
  'ubicacion_horario',
  'texto',
  'productos',
  'eventos',
  'llamado_accion',
];

export interface SectionThumbnailProps {
  /** Tipo de sección, o `anadir` para la tarjeta «Añadir sección». */
  tipo: TipoMiniaturaSeccion | 'anadir';
  /** Nombre visible; por defecto el del tipo. */
  etiqueta?: string;
  seleccionada?: boolean;
  /** Sin `onSeleccionar` se pinta como figura (no interactiva). */
  onSeleccionar?: () => void;
  /** Sin el nombre debajo (cuando la tarjeta ya lo muestra). */
  soloDibujo?: boolean;
  className?: string;
}

const L = 'rounded-sm bg-line-strong';
const A = 'rounded-sm bg-brand';

function Dibujo({ tipo }: { tipo: TipoMiniaturaSeccion | 'anadir' }) {
  switch (tipo) {
    case 'portada':
      return (
        <div className="flex size-full flex-col items-center justify-center gap-1.5">
          <span className={cn(L, 'h-1.5 w-1/2')} />
          <span className={cn(L, 'h-1 w-1/3 opacity-60')} />
          <span className={cn(A, 'mt-1 h-2 w-1/5 rounded')} />
        </div>
      );
    case 'carta_destacada':
      return (
        <div className="grid size-full grid-cols-2 gap-1.5">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="flex flex-col justify-center gap-1 rounded-sm border border-line p-1">
              <span className={cn(L, 'h-1 w-3/4')} />
              <span className={cn(L, 'h-1 w-1/2 opacity-60')} />
            </span>
          ))}
        </div>
      );
    case 'galeria':
      return (
        <div className="grid size-full grid-cols-3 grid-rows-2 gap-1">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <span key={i} className="rounded-sm bg-line" />
          ))}
        </div>
      );
    case 'reservas':
      return (
        <div className="grid size-full grid-cols-2 items-center gap-2">
          <span className="flex flex-col gap-1">
            <span className={cn(L, 'h-1.5 w-3/4')} />
            <span className={cn(L, 'h-1 w-1/2 opacity-60')} />
          </span>
          <span className="flex flex-col gap-1">
            <span className="h-2 rounded-sm border border-line" />
            <span className="h-2 rounded-sm border border-line" />
            <span className={cn(A, 'h-2')} />
          </span>
        </div>
      );
    case 'opiniones':
      return (
        <div className="grid size-full grid-cols-3 gap-1">
          {[0, 1, 2].map((i) => (
            <span key={i} className="flex flex-col gap-1 rounded-sm border border-line p-1">
              <span className="flex gap-0.5">
                {[0, 1, 2].map((j) => (
                  <span key={j} className="size-1 rounded-full bg-brand" />
                ))}
              </span>
              <span className={cn(L, 'h-1 w-full opacity-60')} />
              <span className={cn(L, 'h-1 w-2/3 opacity-60')} />
            </span>
          ))}
        </div>
      );
    case 'ubicacion_horario':
      return (
        <div className="grid size-full grid-cols-2 gap-2">
          <span className="relative rounded-sm bg-line">
            <span className="absolute left-1/2 top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand" />
          </span>
          <span className="flex flex-col justify-center gap-1">
            <span className={cn(L, 'h-1.5 w-3/4')} />
            <span className={cn(L, 'h-1 w-full opacity-60')} />
            <span className={cn(L, 'h-1 w-2/3 opacity-60')} />
          </span>
        </div>
      );
    case 'texto':
      return (
        <div className="flex size-full flex-col justify-center gap-1">
          <span className={cn(L, 'h-1.5 w-1/2')} />
          <span className={cn(L, 'h-1 w-full opacity-60')} />
          <span className={cn(L, 'h-1 w-full opacity-60')} />
          <span className={cn(L, 'h-1 w-3/4 opacity-60')} />
        </div>
      );
    case 'productos':
      return (
        <div className="grid size-full grid-cols-4 gap-1">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="flex flex-col gap-1">
              <span className="flex-1 rounded-sm bg-line" />
              <span className={cn(L, 'h-1 w-3/4')} />
              <span className={cn(A, 'h-1 w-1/2')} />
            </span>
          ))}
        </div>
      );
    case 'eventos':
      return (
        <div className="flex size-full flex-col justify-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <span key={i} className="flex items-center gap-1.5">
              <span className="size-2.5 shrink-0 rounded-sm bg-brand-tint ring-1 ring-brand" />
              <span className={cn(L, 'h-1 flex-1')} />
              <span className={cn(A, 'h-1.5 w-3')} />
            </span>
          ))}
        </div>
      );
    case 'llamado_accion':
      return (
        <div className="flex size-full items-center justify-center rounded-sm bg-brand-tint">
          <span className="flex w-2/3 flex-col items-center gap-1">
            <span className={cn(L, 'h-1.5 w-full')} />
            <span className={cn(A, 'h-2 w-1/3 rounded')} />
          </span>
        </div>
      );
    default:
      return (
        <div className="flex size-full items-center justify-center">
          <Plus aria-hidden="true" className="size-5 text-brand" strokeWidth={1.5} />
        </div>
      );
  }
}

export function SectionThumbnail({ tipo, etiqueta, seleccionada, onSeleccionar, soloDibujo, className }: SectionThumbnailProps) {
  const tx = useTextosComun();
  const nombre = etiqueta ?? tx(`seccion.${tipo}`);
  const caja = (
    <span
      aria-hidden="true"
      className={cn(
        'block aspect-[4/3] w-full rounded-lg border p-2',
        tipo === 'anadir' ? 'border-dashed border-line-strong bg-surface' : seleccionada ? 'border-brand bg-brand-tint' : 'border-line bg-surface',
      )}
    >
      <Dibujo tipo={tipo} />
    </span>
  );
  const pie = soloDibujo ? (
    <span className="sr-only">{nombre}</span>
  ) : (
    <span className={cn('truncate text-xs leading-4', seleccionada ? 'font-medium text-brand-deep' : 'text-fg')}>{nombre}</span>
  );

  if (!onSeleccionar) {
    return (
      <figure className={cn('flex flex-col gap-1.5', className)}>
        {caja}
        <figcaption className="contents">{pie}</figcaption>
      </figure>
    );
  }
  return (
    <button
      type="button"
      onClick={onSeleccionar}
      aria-pressed={tipo === 'anadir' ? undefined : !!seleccionada}
      className={cn(
        'flex flex-col gap-1.5 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2',
        className,
      )}
    >
      {caja}
      {pie}
    </button>
  );
}
