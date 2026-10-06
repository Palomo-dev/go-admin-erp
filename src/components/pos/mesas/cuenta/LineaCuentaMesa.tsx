'use client';

import { useTranslations } from 'next-intl';
import {
  Ban,
  Check,
  ChefHat,
  Lock,
  Minus,
  MoreHorizontal,
  Plus,
  SlidersHorizontal,
  StickyNote,
  Trash2,
  TriangleAlert,
  UserRound,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react';
import { CartTag, RowActionsMenu, type AccionFila } from '@/components/kit';
import { cn } from '@/utils/Utils';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { minutosDesde, type EstadoCocinaMesa, type LineaMesa } from './cuentaMesaLogica';
import { useTextosCartaQr } from '../solicitudes/textosCartaQr';

/**
 * Línea de la cuenta de la mesa (Figma `CartLine v3` dentro de `CartPanel
 * Variant=mesa`, D3–D6): miniatura, nombre, «1 × $ 32.000 · inc. impoconsumo
 * 8 %», cantidad (− 1 +) mientras está «Por enviar» o candado «1 und» si la
 * cocina ya la tiene, etiquetas (estado de cocina, comensal), la nota de
 * cocina en su franja y las acciones abajo a la derecha.
 *
 * Por enviar: nota · modificadores · comensal · ⋯ · quitar.
 * Enviada: nota · servido · ⋯ · anular (con motivo, D13).
 */
export interface LineaCuentaMesaProps {
  linea: LineaMesa;
  formatear: (valor: number) => string;
  /** «Impoconsumo 8 %» de la tasa de la línea (sin nombre: «impuesto 8 %»). */
  textoImpuesto: string | null;
  ahora: Date;
  onCantidad?: (cantidad: number) => void;
  onNota?: () => void;
  onModificadores?: () => void;
  onComensal?: () => void;
  onQuitar?: () => void;
  onServido?: () => void;
  onAnular?: () => void;
  /** Acciones del «⋯» (mover a otra mesa, etc.). */
  masAcciones?: AccionFila[];
  deshabilitada?: boolean;
  className?: string;
}

const ESTADO_TONO: Record<EstadoCocinaMesa, string> = {
  por_enviar: 'border border-line-strong bg-surface text-fg',
  en_cocina: 'border border-line-info bg-info-subtle text-info-text',
  preparando: 'border border-line-warning bg-warning-subtle text-warning-text',
  lista: 'border border-line-success bg-success-subtle text-success-text',
  servida: 'border border-line bg-subtle text-fg-secondary',
  cancelada: 'border border-line-danger bg-danger-subtle text-danger-text',
  sin_cocina: 'border border-line bg-subtle text-fg-secondary',
};

const BOTON = 'inline-flex size-8 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50';

function BotonIcono({ icono: Icono, etiqueta, onClick, activo, peligro, deshabilitado }: { icono: LucideIcon; etiqueta: string; onClick?: () => void; activo?: boolean; peligro?: boolean; deshabilitado?: boolean }) {
  if (!onClick) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={deshabilitado}
      aria-label={etiqueta}
      title={etiqueta}
      className={cn(
        BOTON,
        peligro ? 'text-danger-text hover:bg-danger-subtle' : activo ? 'bg-brand-tint text-brand' : 'text-fg-secondary hover:bg-hover hover:text-fg',
      )}
    >
      <Icono aria-hidden="true" className="size-4" strokeWidth={1.5} />
    </button>
  );
}

export function LineaCuentaMesa({
  linea,
  formatear,
  textoImpuesto,
  ahora,
  onCantidad,
  onNota,
  onModificadores,
  onComensal,
  onQuitar,
  onServido,
  onAnular,
  masAcciones,
  deshabilitada,
  className,
}: LineaCuentaMesaProps) {
  const t = useTranslations('posMesasFlujo.linea');
  const tq = useTextosCartaQr();
  const minutos = minutosDesde(linea.estadoDesde, ahora);
  const editable = linea.porEnviar && !linea.pagada;
  const etiquetaEstado =
    linea.estado === 'por_enviar'
      ? t('estado.por_enviar')
      : linea.estado === 'en_cocina' || linea.estado === 'preparando'
        ? t(`estado.${linea.estado}Min`, { min: minutos ?? 0 })
        : t(`estado.${linea.estado}`);

  return (
    <div
      role="group"
      aria-label={linea.nombre}
      className={cn(
        'flex flex-col gap-2 rounded-xl border bg-surface p-3',
        linea.estado === 'lista' ? 'border-line-success' : 'border-line',
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-subtle text-fg-muted">
          {linea.imagen ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={linea.imagen} alt="" className="size-full object-cover" />
          ) : (
            <UtensilsCrossed className="size-5" strokeWidth={1.5} />
          )}
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="truncate text-sm font-medium leading-5 text-fg" title={linea.variante ? `${linea.nombre} · ${linea.variante}` : linea.nombre}>
            {linea.nombre}
            {linea.variante && <span className="font-normal text-fg-secondary">{` · ${linea.variante}`}</span>}
          </p>
          <p className="truncate text-xs leading-4 text-fg-secondary tabular-nums">
            {t('precioUnidad', { cantidad: linea.cantidad, precio: formatear(linea.precioUnitario) })}
            {editable && textoImpuesto && ` · ${textoImpuesto}`}
            {!editable && linea.enviadaAt && (
              <>
                {` · ${t(linea.estado === 'lista' ? 'lista' : 'enviada')} `}
                <HoraZona iso={linea.enviadaAt} />
              </>
            )}
          </p>
          {linea.modificadores.length > 0 && (
            <p className="truncate text-xs leading-4 text-fg-secondary">
              {linea.modificadores.map((m) => (m.extraPrice ? `${m.name} (+${formatear(m.extraPrice)})` : m.name)).join(' · ')}
            </p>
          )}
        </div>
        {editable && onCantidad ? (
          <div className="flex shrink-0 items-center gap-2" role="group" aria-label={t('cantidadDe', { nombre: linea.nombre })}>
            <button
              type="button"
              onClick={() => onCantidad(linea.cantidad - 1)}
              disabled={deshabilitada}
              aria-label={t('menos', { nombre: linea.nombre })}
              className={cn(BOTON, 'border border-line-strong bg-surface text-fg-secondary hover:bg-hover hover:text-fg')}
            >
              <Minus aria-hidden="true" className="size-4" strokeWidth={1.5} />
            </button>
            <span className="w-5 text-center text-sm font-medium tabular-nums text-fg">{linea.cantidad}</span>
            <button
              type="button"
              onClick={() => onCantidad(linea.cantidad + 1)}
              disabled={deshabilitada}
              aria-label={t('mas', { nombre: linea.nombre })}
              className={cn(BOTON, 'border border-line-strong bg-surface text-fg-secondary hover:bg-hover hover:text-fg')}
            >
              <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
            </button>
          </div>
        ) : (
          <span className="flex shrink-0 items-center gap-1 pt-0.5 text-sm tabular-nums text-fg-secondary" title={t('enCocinaBloqueada')}>
            <Lock aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
            {t('unidades', { n: linea.cantidad })}
          </span>
        )}
        <span className="w-20 shrink-0 pt-0.5 text-right text-sm font-semibold tabular-nums text-fg">{formatear(linea.total)}</span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <CartTag icono={null} className={cn('h-[22px] px-2 text-xs', ESTADO_TONO[linea.estado])}>
          {etiquetaEstado}
        </CartTag>
        {linea.comensal && (
          <CartTag icono={null} className="h-[22px] px-2 text-xs">
            {t('comensalN', { n: linea.comensal })}
          </CartTag>
        )}
        {linea.quienPidio && (
          <CartTag icono={null} className="h-[22px] px-2 text-xs">
            {tq('pedido.comensal', { nombre: linea.quienPidio })}
          </CartTag>
        )}
        {linea.alergia && (
          <CartTag tono="peligro" icono={TriangleAlert} className="h-[22px] px-2 text-xs">
            {t('alergia')}
          </CartTag>
        )}
      </div>

      {linea.notaCocina && (
        <p className="flex items-center gap-2 rounded-md bg-subtle px-2 py-1 text-[13px] text-fg-secondary">
          <ChefHat aria-hidden="true" className="size-4 shrink-0 text-fg-muted" strokeWidth={1.5} />
          <span className="truncate">{t('notaCocina', { nota: linea.notaCocina })}</span>
        </p>
      )}

      <div className="flex items-center justify-end gap-1">
        <BotonIcono icono={StickyNote} etiqueta={t('acciones.nota')} onClick={onNota} activo={editable && (!!linea.notaCocina || !!linea.notaCliente)} deshabilitado={deshabilitada} />
        {editable ? (
          <>
            <BotonIcono icono={SlidersHorizontal} etiqueta={t('acciones.modificadores')} onClick={onModificadores} deshabilitado={deshabilitada} />
            <BotonIcono icono={UserRound} etiqueta={t('acciones.comensal')} onClick={onComensal} activo={!!linea.comensal} deshabilitado={deshabilitada} />
          </>
        ) : (
          <BotonIcono
            icono={Check}
            etiqueta={t('acciones.servido')}
            onClick={linea.estado === 'servida' || linea.estado === 'sin_cocina' || linea.estado === 'cancelada' ? undefined : onServido}
            activo={linea.estado === 'lista'}
            deshabilitado={deshabilitada}
          />
        )}
        {masAcciones && masAcciones.length > 0 ? (
          <RowActionsMenu orientacion="horizontal" tamano="sm" titulo={linea.nombre} acciones={masAcciones} />
        ) : (
          <span className={cn(BOTON, 'text-fg-muted')} aria-hidden="true">
            <MoreHorizontal className="size-4" strokeWidth={1.5} />
          </span>
        )}
        {editable ? (
          <BotonIcono icono={Trash2} etiqueta={t('acciones.quitar')} onClick={onQuitar} peligro deshabilitado={deshabilitada} />
        ) : (
          <BotonIcono icono={Ban} etiqueta={t('acciones.anular')} onClick={linea.estado === 'cancelada' ? undefined : onAnular} peligro deshabilitado={deshabilitada} />
        )}
      </div>
    </div>
  );
}

/** Hora corta («12:41 p. m.») en la zona de la organización. */
export function HoraZona({ iso, prefijo = '' }: { iso: string | null | undefined; prefijo?: string }) {
  const { formatTime } = useFormatDate();
  if (!iso) return null;
  return <>{`${prefijo}${formatTime(iso)}`}</>;
}
