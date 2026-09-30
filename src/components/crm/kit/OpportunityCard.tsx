'use client';

import type { HTMLAttributes, ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Calendar, CalendarClock, Clock, GripVertical, MessageSquare } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { Badge } from '@/components/ui/badge';
import { AvatarIniciales } from '@/components/kit/AvatarIniciales';
import { StatusBadge } from '@/components/kit/StatusBadge';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { formatMoneda, type ContextoMoneda } from '@/lib/utils/moneda';
import { QuickActionsBarCrm } from './QuickActionsBarCrm';
import { fechaCortaInstante } from './fechasCrm';
import { claveCanal, TONO_PRIORIDAD, vistaTarjeta, type OportunidadTarjeta, type TextoClave } from './opportunityCardLogica';
import type { AccionRapidaCrm, EstadoAccionRapida } from './quickActionLogica';

/**
 * Tarjeta de oportunidad (Figma `OpportunityCard` 759:22188): conserva lo de
 * `OpportunityCardV2` (arrastre, avatar, nombre, cliente, monto, score,
 * próximo y último contacto) y suma prioridad (temperatura, D4), responsable,
 * días en etapa y la fila de acciones rápidas **siempre visible**.
 *
 * Estados: normal · vencida (borde y texto en rojo) · ganada · perdida ·
 * arrastrando (sombra y leve giro). `densidad='lista'` es la de móvil: casilla
 * de selección, etapa y barra táctil.
 *
 * El monto va en la moneda **de la oportunidad** (`moneda`, que la pantalla
 * arma con `useMonedaOrganizacion().paraDocumento(op.currency)`).
 */
export interface OpportunityCardProps {
  oportunidad: OportunidadTarjeta;
  moneda: ContextoMoneda;
  densidad?: 'kanban' | 'lista';
  arrastrando?: boolean;
  /** Props del asa (listeners de dnd); solo kanban. */
  propsAsa?: HTMLAttributes<HTMLSpanElement>;
  seleccionada?: boolean;
  onSeleccionChange?: (seleccionada: boolean) => void;
  onAbrir?: (id: string) => void;
  estadosAcciones?: readonly EstadoAccionRapida[];
  onAccion?: (accion: AccionRapidaCrm) => void;
  /** Menú «⋯» (`OpportunityRowMenu`). */
  menu?: ReactNode;
  /** «Ahora» inyectable (pruebas). */
  ahora?: Date;
  className?: string;
}

export function OpportunityCard({
  oportunidad: op,
  moneda,
  densidad = 'kanban',
  arrastrando,
  propsAsa,
  seleccionada,
  onSeleccionChange,
  onAbrir,
  estadosAcciones,
  onAccion,
  menu,
  ahora = new Date(),
  className,
}: OpportunityCardProps) {
  const t = useTranslations('crm.kit.tarjeta');
  const idioma = useLocale();
  const { timezone } = useFormatDate();
  const v = vistaTarjeta(op, ahora, timezone);
  const tx = (c: TextoClave | null) => (c ? t(c.clave, c.valores) : '');
  const lista = densidad === 'lista';
  const cliente = op.clienteNombre?.trim() || t('sinCliente');

  return (
    <article
      aria-label={op.name}
      data-estado={v.estado}
      className={cn(
        'flex flex-col gap-2 rounded-xl border bg-surface p-3 text-left',
        v.estado === 'vencida' ? 'border-line-danger' : 'border-line',
        seleccionada && 'border-line-brand bg-brand-tint',
        arrastrando && 'rotate-1 shadow-lg ring-2 ring-brand',
        className,
      )}
    >
      <div className="flex items-center gap-2">
        {lista ? (
          <input
            type="checkbox"
            checked={!!seleccionada}
            onChange={(e) => onSeleccionChange?.(e.target.checked)}
            aria-label={t('seleccionar', { nombre: op.name })}
            className="size-4 shrink-0 rounded border-line-strong accent-brand-action"
          />
        ) : (
          <span {...propsAsa} aria-hidden="true" className="flex shrink-0 cursor-grab text-fg-muted">
            <GripVertical className="size-4" strokeWidth={1.5} />
          </span>
        )}
        <AvatarIniciales nombre={op.clienteNombre || op.name} />
        <div className="flex min-w-0 flex-1 flex-col">
          <button
            type="button"
            onClick={() => onAbrir?.(op.id)}
            className="truncate text-left text-sm font-medium text-fg hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            {op.name}
          </button>
          <span className="truncate text-xs text-fg-secondary">{cliente}</span>
        </div>
        {v.estado === 'ganada' || v.estado === 'perdida' ? (
          <StatusBadge estado={v.estado === 'ganada' ? 'ganada' : 'perdida'} etiqueta={t(`estado.${v.estado}`)} />
        ) : (
          v.temperatura && (
            <Badge tono={TONO_PRIORIDAD[v.temperatura]} tamano="sm" aria-label={t('prioridadAria', { prioridad: t(`prioridad.${v.temperatura}`) })}>
              {t(`prioridad.${v.temperatura}`)}
            </Badge>
          )
        )}
        {menu}
      </div>

      <div className="flex items-center gap-2">
        <span
          className={cn(
            'text-base font-semibold',
            v.estado === 'ganada' ? 'text-success-text' : v.estado === 'perdida' ? 'text-danger-text' : 'text-fg',
          )}
        >
          {formatMoneda(op.amount, moneda)}
        </span>
        {lista && op.etapaNombre && (
          <Badge tono="marca" tamano="sm">
            {op.etapaNombre}
          </Badge>
        )}
        <span className="flex-1" />
        {typeof op.score_total === 'number' && (
          <Badge tono="informacion" apariencia="contorno" tamano="sm">
            {t('score', { score: op.score_total })}
          </Badge>
        )}
      </div>

      {v.cierre && (
        <p className="flex items-start gap-1.5 text-xs text-fg-secondary">
          <Calendar aria-hidden="true" className="mt-px size-3.5 shrink-0" strokeWidth={1.5} />
          <span>
            {tx(v.cierre)}
            {op.closed_at ? ` · ${fechaCortaInstante(op.closed_at, timezone, idioma)}` : ''}
          </span>
        </p>
      )}
      {v.proximo && (
        <p className={cn('flex items-start gap-1.5 text-xs', v.proximo.vencido ? 'font-medium text-danger-text' : 'text-fg-secondary')}>
          <Clock aria-hidden="true" className="mt-px size-3.5 shrink-0" strokeWidth={1.5} />
          <span>{[v.proximo.accion ?? t('sinAccion'), tx(v.proximo.cuando)].filter(Boolean).join(' · ')}</span>
        </p>
      )}
      {v.ultimo && (
        <p className="flex items-start gap-1.5 text-xs text-fg-muted">
          <MessageSquare aria-hidden="true" className="mt-px size-3.5 shrink-0" strokeWidth={1.5} />
          <span>{t('ultimo', { canal: t(`canal.${claveCanal(v.ultimo.canal)}`), cuando: tx(v.ultimo.cuando) })}</span>
        </p>
      )}

      <hr className="border-line" />
      <div className="flex items-center gap-2 text-xs">
        {op.responsable ? (
          <>
            <AvatarIniciales nombre={op.responsable.nombre} src={op.responsable.avatarUrl} />
            <span className="truncate text-fg-secondary">{op.responsable.nombre}</span>
          </>
        ) : (
          <span className="text-fg-muted">{t('sinResponsable')}</span>
        )}
        <span className="flex-1" />
        {v.diasEnEtapa !== null && (
          <span className="flex shrink-0 items-center gap-1 text-fg-muted">
            <CalendarClock aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
            {t('diasEnEtapa', { dias: v.diasEnEtapa })}
          </span>
        )}
      </div>

      <QuickActionsBarCrm variante={lista ? 'tarjetaMovil' : 'tarjeta'} estados={estadosAcciones} onAccion={onAccion} />
    </article>
  );
}
