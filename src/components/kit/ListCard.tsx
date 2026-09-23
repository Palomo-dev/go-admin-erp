'use client';

import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as EventoRaton,
  type PointerEvent as EventoPuntero,
  type ReactNode,
} from 'react';
import { ImageIcon, type LucideIcon } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { Checkbox } from '@/components/ui/checkbox';
import { AvatarIniciales } from './AvatarIniciales';
import { RowActionsMenu } from './RowActionsMenu';
import type { AccionFila } from './acciones';
import { useKitT } from './useIdiomaKit';

/**
 * Tarjeta de listado móvil (Figma `ListCard` 580:277858, propiedad
 * `Inicio = icono | avatar | imagen`, y sub-componente «ListCard / Dato»
 * 745:20605).
 *
 * Contenedor blanco con borde de 1 px, radio 12 y sin sombra; a la izquierda
 * el «inicio» (icono tintado de 40, avatar de iniciales de 40 o imagen de 48),
 * en el centro título (1 línea) + insignia, subtítulo (≤ 2 líneas), datos con
 * icono (1 línea cada uno), etiquetas que envuelven y meta; a la derecha valor
 * y estado; al final «⋯», que abre la hoja de acciones.
 *
 * Nada se sale de la pantalla: toda la cadena flex lleva `min-w-0` y cada
 * texto de una línea, elipsis. El que se recorta es el título; la insignia,
 * el valor y el estado no se encogen.
 *
 * Toda la tarjeta abre el detalle (el título es el botón y estira su área a la
 * tarjeta); la casilla y el «⋯» quedan por encima y no la disparan. En modo
 * selección la tarjeta gana la casilla y el borde de marca de 2 px.
 */
export type InicioListCard = 'icono' | 'avatar' | 'imagen';

/** Una línea «icono 12 + texto 12/16» (Figma «ListCard / Dato» 745:20605). */
export interface DatoListCard {
  icono: LucideIcon;
  texto: ReactNode;
  /** Nombre del dato para lectores de pantalla («Correo»); el icono es decorativo. */
  etiqueta?: string;
}

export interface ListCardProps {
  /**
   * Qué va al inicio. Si se omite, se deduce: `avatar` → avatar, `imagen` →
   * imagen, `icono` → icono. `miniatura` (nodo libre) sigue funcionando.
   */
  inicio?: InicioListCard;
  /** Icono de la entidad (Inicio=icono): caja de 40, radio 8, tinte de marca. */
  icono?: LucideIcon;
  /** Inicio=avatar: círculo de marca de 40 con iniciales (o la foto si existe). */
  avatar?: { nombre: string; src?: string | null };
  /**
   * Inicio=imagen: 48×48, radio 8, fondo sutil y borde. Sin `src`, o si la
   * imagen falla, queda el marcador con el icono de imagen de 18.
   */
  imagen?: { src?: string | null; alt?: string; onError?: () => void };
  /**
   * Nodo libre en la caja de 40 del inicio (compatibilidad). Si hay `avatar`
   * o `imagen`, estos mandan.
   */
  miniatura?: ReactNode;
  titulo: string;
  /** Badge junto al título (Persona/Empresa). No se encoge: se recorta el título. */
  insignia?: ReactNode;
  /** 13/18, hasta 2 líneas. */
  subtitulo?: ReactNode;
  /** Líneas de dato con icono, una por línea y con elipsis. Los vacíos se omiten. */
  datos?: readonly (DatoListCard | null | false | undefined)[];
  /** Badges sm bajo el texto (stock por sucursal, «3 var.»); envuelven, nunca desbordan. */
  etiquetas?: ReactNode;
  /** @deprecated Usa `etiquetas`; se pinta en la misma fila. */
  insignias?: ReactNode;
  /** 12/16 atenuado, 1 línea. */
  meta?: ReactNode;
  /** Importe o cifra a la derecha («$ 12,5 M»). */
  valor?: ReactNode;
  /** Normalmente `<StatusBadge tamano="sm" />`. */
  estado?: ReactNode;
  onClick?: () => void;
  acciones?: readonly AccionFila[];
  /** Muestra la casilla (modo selección múltiple). */
  seleccionable?: boolean;
  seleccionado?: boolean;
  onSeleccionChange?: (seleccionado: boolean) => void;
  /**
   * Mantener pulsada la tarjeta (500 ms) o clic derecho: entra en modo
   * selección (Figma Clientes móvil «selección múltiple»). Con esta prop, en
   * modo selección tocar la tarjeta alterna su casilla en lugar de abrirla.
   */
  onMantenerPulsado?: () => void;
  className?: string;
}

const MS_PULSACION_LARGA = 500;

function usePulsacionLarga(onMantenerPulsado?: () => void) {
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const disparada = useRef(false);
  const cancelar = () => {
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = null;
  };
  if (!onMantenerPulsado) return { disparada, props: {} };
  return {
    disparada,
    props: {
      onPointerDown: (e: EventoPuntero) => {
        if (e.button !== 0) return;
        disparada.current = false;
        cancelar();
        temporizador.current = setTimeout(() => {
          disparada.current = true;
          onMantenerPulsado();
        }, MS_PULSACION_LARGA);
      },
      onPointerUp: cancelar,
      onPointerLeave: cancelar,
      onPointerCancel: cancelar,
      onPointerMove: (e: EventoPuntero) => {
        if (Math.abs(e.movementX) + Math.abs(e.movementY) > 8) cancelar();
      },
      onContextMenu: (e: EventoRaton) => {
        e.preventDefault();
        cancelar();
        onMantenerPulsado();
      },
      // La pulsación larga no debe terminar abriendo el detalle.
      onClickCapture: (e: EventoRaton) => {
        if (disparada.current) {
          disparada.current = false;
          e.preventDefault();
          e.stopPropagation();
        }
      },
    },
  };
}

/** Inicio=imagen: 48×48 con marcador si no hay foto o si la foto falla. */
function ImagenInicio({ src, alt = '', onError }: NonNullable<ListCardProps['imagen']>) {
  const [fallo, setFallo] = useState(false);
  useEffect(() => setFallo(false), [src]);
  return (
    <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-subtle text-fg-muted">
      {src && !fallo ? (
        // eslint-disable-next-line @next/next/no-img-element -- imágenes de Storage con dominios variables
        <img
          src={src}
          alt={alt}
          loading="lazy"
          className="size-full object-cover"
          onError={() => {
            setFallo(true);
            onError?.();
          }}
        />
      ) : (
        <>
          <ImageIcon aria-hidden="true" className="size-[18px]" strokeWidth={1.5} />
          <span className="sr-only">Sin imagen</span>
        </>
      )}
    </div>
  );
}

/** Una línea de dato (Figma «ListCard / Dato» 745:20605): icono 12 + gap 6 + texto 12/16 con elipsis. */
export function ListCardDato({ icono: Icono, texto, etiqueta }: DatoListCard) {
  return (
    <span
      className="flex min-w-0 items-center gap-1.5 text-xs font-medium leading-4 text-fg-secondary"
      title={typeof texto === 'string' ? texto : undefined}
    >
      <Icono aria-hidden="true" className="size-3 shrink-0" strokeWidth={1.75} />
      {etiqueta && <span className="sr-only">{etiqueta}:</span>}
      <span className="min-w-0 truncate">{texto}</span>
    </span>
  );
}

function deducirInicio({ inicio, avatar, imagen, miniatura, icono }: ListCardProps): InicioListCard | 'miniatura' | null {
  if (inicio === 'avatar' && avatar) return 'avatar';
  if (inicio === 'imagen') return 'imagen';
  if (inicio === 'icono' && icono) return 'icono';
  if (avatar) return 'avatar';
  if (imagen) return 'imagen';
  if (miniatura) return 'miniatura';
  if (icono) return 'icono';
  return null;
}

export function ListCard(props: ListCardProps) {
  const t = useKitT();
  const {
    icono: Icono,
    avatar,
    imagen,
    miniatura,
    titulo,
    insignia,
    subtitulo,
    datos,
    etiquetas,
    insignias,
    meta,
    valor,
    estado,
    onClick,
    acciones,
    seleccionable,
    seleccionado,
    onSeleccionChange,
    onMantenerPulsado,
    className,
  } = props;
  const pulsacion = usePulsacionLarga(onMantenerPulsado);
  const alTocar =
    onMantenerPulsado && seleccionable && onSeleccionChange ? () => onSeleccionChange(!seleccionado) : onClick;
  const inicio = deducirInicio(props);
  const lineas = (datos ?? []).filter((d): d is DatoListCard => !!d);
  const hayEtiquetas = !!etiquetas || !!insignias;

  return (
    <div
      {...pulsacion.props}
      className={cn(
        'relative flex min-w-0 items-center gap-3 rounded-xl bg-surface transition-colors',
        // Con el borde de 2 px se quita 1 px de padding: la tarjeta no salta al seleccionarla.
        seleccionado ? 'border-2 border-line-brand py-[11px] pl-[11px] pr-[7px]' : 'border border-line py-3 pl-3 pr-2',
        onClick && 'hover:bg-hover has-[button[data-principal]:focus-visible]:ring-2 has-[button[data-principal]:focus-visible]:ring-brand',
        className,
      )}
    >
      {seleccionable && (
        <Checkbox
          checked={!!seleccionado}
          onCheckedChange={(v) => onSeleccionChange?.(v === true)}
          aria-label={t('tabla.seleccionar', { nombre: titulo })}
          className="relative z-10 size-[18px] shrink-0 rounded"
        />
      )}

      {inicio === 'avatar' && avatar ? (
        <AvatarIniciales nombre={avatar.nombre} src={avatar.src} tamano="md" />
      ) : inicio === 'imagen' ? (
        <ImagenInicio {...(imagen ?? {})} />
      ) : inicio === 'miniatura' ? (
        <div aria-hidden="true" className="size-10 shrink-0 overflow-hidden rounded-lg">
          {miniatura}
        </div>
      ) : inicio === 'icono' && Icono ? (
        <div aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-tint text-brand">
          <Icono className="size-5" strokeWidth={1.5} />
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex min-w-0 items-center gap-1.5">
          {alTocar ? (
            <button
              type="button"
              data-principal=""
              onClick={alTocar}
              title={titulo}
              className="min-w-0 truncate text-left text-sm font-medium leading-5 text-fg outline-none after:absolute after:inset-0 after:rounded-xl after:content-['']"
            >
              {titulo}
            </button>
          ) : (
            <span className="min-w-0 truncate text-sm font-medium leading-5 text-fg" title={titulo}>
              {titulo}
            </span>
          )}
          {insignia && <span className="flex shrink-0 items-center">{insignia}</span>}
        </div>
        {subtitulo && (
          <span className="line-clamp-2 min-w-0 break-words text-[13px] leading-[18px] text-fg-secondary">{subtitulo}</span>
        )}
        {lineas.length > 0 && (
          <div className="flex min-w-0 flex-col gap-0.5">
            {lineas.map((d, i) => (
              <ListCardDato key={d.etiqueta ?? i} {...d} />
            ))}
          </div>
        )}
        {hayEtiquetas && (
          <div className="flex min-w-0 flex-wrap items-center gap-1 pt-0.5">
            {etiquetas}
            {insignias}
          </div>
        )}
        {meta && <span className="min-w-0 truncate text-xs font-medium leading-4 text-fg-muted">{meta}</span>}
      </div>

      {(valor !== undefined || estado) && (
        <div className="flex shrink-0 flex-col items-end gap-1">
          {valor !== undefined && (
            <span className="whitespace-nowrap text-sm font-medium leading-5 text-fg tabular-nums">{valor}</span>
          )}
          {estado}
        </div>
      )}

      {acciones && acciones.length > 0 && (
        <div className="relative z-10 shrink-0">
          <RowActionsMenu acciones={acciones} titulo={titulo} />
        </div>
      )}
    </div>
  );
}
