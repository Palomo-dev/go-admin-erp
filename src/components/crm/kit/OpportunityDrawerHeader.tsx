'use client';

import type { ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ExternalLink, Pencil, RotateCcw, Trophy, X, XCircle } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { Badge } from '@/components/ui/badge';
import { AvatarIniciales } from '@/components/kit/AvatarIniciales';
import { clasesBoton } from '@/components/kit/botonClases';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { formatMoneda, type ContextoMoneda } from '@/lib/utils/moneda';
import { QuickActionsBarCrm } from './QuickActionsBarCrm';
import { StageBar } from './StageBar';
import { accionesPie, bandaIcp, estadoOportunidad, TONO_ESTADO } from './drawerHeaderLogica';
import { diasDesde, fechaCortaPlana } from './fechasCrm';
import { TONO_PRIORIDAD, temperaturaValida } from './opportunityCardLogica';
import type { AccionRapidaCrm, EstadoAccionRapida } from './quickActionLogica';
import type { EtapaBarra } from './stageBarLogica';

/**
 * Cabecera del drawer de oportunidad (Figma `OpportunityDrawerHeader`
 * 801:25828; reemplaza `drawer/DrawerHeader.tsx`): nombre, prioridad
 * (temperatura), cliente (enlace), estado, score e ICP; datos clave (monto,
 * probabilidad de la etapa, cierre estimado, responsable, días en la etapa);
 * `StageBar`; acciones rápidas y pie Editar · Marcar perdida · Marcar ganada.
 *
 * Layouts: `escritorio` · `movil` (datos en 2 columnas, barra de etapa
 * compacta) · `movilCompacta` (al desplazar: nombre, monto y etapa + íconos).
 */
export interface OportunidadDrawer {
  id: string;
  name: string;
  status: string | null;
  temperature?: string | null;
  score_total?: number | null;
  icp_band?: string | null;
  amount: number | string | null;
  currency: string | null;
  /** `date`. */
  expected_close_date?: string | null;
  stage_id: string;
  clienteNombre?: string | null;
  responsable?: { nombre: string; avatarUrl?: string | null } | null;
  /** Último cambio de etapa (`opportunity_stage_history.changed_at`) o `created_at`. */
  entroEtapaEn?: string | null;
}

export interface OpportunityDrawerHeaderProps {
  oportunidad: OportunidadDrawer;
  /** Moneda de la oportunidad. */
  moneda: ContextoMoneda;
  etapas: readonly EtapaBarra[];
  layout?: 'escritorio' | 'movil' | 'movilCompacta';
  permisos?: { editar?: boolean; cerrar?: boolean };
  estadosAcciones?: readonly EstadoAccionRapida[];
  onAccion?: (accion: AccionRapidaCrm) => void;
  onElegirEtapa?: (etapa: EtapaBarra) => void;
  onAbrirEtapas?: () => void;
  onGanar?: () => void;
  onPerder?: () => void;
  onReabrir?: () => void;
  onEditar?: () => void;
  onAbrirCliente?: () => void;
  onAbrirDetalle?: () => void;
  onCerrar?: () => void;
  menu?: ReactNode;
  ahora?: Date;
}

export function OpportunityDrawerHeader(p: OpportunityDrawerHeaderProps) {
  const { oportunidad: op, moneda, etapas, layout = 'escritorio', permisos, ahora = new Date() } = p;
  const t = useTranslations('crm.kit.cabecera');
  const idioma = useLocale();
  const { timezone } = useFormatDate();
  const estado = estadoOportunidad(op.status);
  const temp = temperaturaValida(op.temperature);
  const icp = bandaIcp(op.icp_band);
  const etapa = etapas.find((e) => e.id === op.stage_id);
  const dias = diasDesde(op.entroEtapaEn, ahora, timezone);
  const pie = accionesPie(estado, permisos);
  const movil = layout !== 'escritorio';
  const barraAcciones = <QuickActionsBarCrm variante={movil ? 'tarjetaMovil' : 'drawer'} estados={p.estadosAcciones} onAccion={p.onAccion} />;

  if (layout === 'movilCompacta') {
    return (
      <header className="flex flex-col gap-2 border-b border-line bg-surface px-4 py-2">
        <div className="flex items-center gap-2">
          {p.onCerrar && <button type="button" aria-label={t('cerrar')} onClick={p.onCerrar} className="flex size-8 items-center justify-center rounded-lg text-fg-secondary hover:bg-hover"><X aria-hidden="true" className="size-5" /></button>}
          <div className="flex min-w-0 flex-1 flex-col">
            <h2 className="truncate text-sm font-semibold text-fg">{op.name}</h2>
            <p className="truncate text-xs text-fg-secondary">
              {[`${formatMoneda(op.amount, moneda)} ${moneda.code}`, etapa ? (etapa.probability === null ? etapa.name : t('etapaProb', { etapa: etapa.name, prob: etapa.probability })) : null].filter(Boolean).join(' · ')}
            </p>
          </div>
          {p.menu}
        </div>
        {barraAcciones}
      </header>
    );
  }

  const dato = (etiqueta: string, valor: ReactNode, extra?: ReactNode) => (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-xs text-fg-secondary">{etiqueta}</dt>
      <dd className="flex items-baseline gap-1 truncate text-sm font-semibold text-fg">{valor}{extra}</dd>
    </div>
  );

  return (
    <header className="flex flex-col gap-4 bg-surface">
      <div className="flex items-start gap-3">
        <AvatarIniciales nombre={op.clienteNombre || op.name} tamano="md" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="truncate text-lg font-semibold text-fg">{op.name}</h2>
          <div className="flex flex-wrap items-center gap-1.5">
            {op.clienteNombre && (p.onAbrirCliente ? <button type="button" onClick={p.onAbrirCliente} className="text-[13px] font-medium text-brand-deep hover:underline">{op.clienteNombre}</button> : <span className="text-[13px] text-fg-secondary">{op.clienteNombre}</span>)}
            <Badge tono={TONO_ESTADO[estado]} apariencia="contorno" tamano="sm">{t(`estado.${estado}`)}</Badge>
            {typeof op.score_total === 'number' && <Badge tono="informacion" apariencia="contorno" tamano="sm">{t('score', { score: op.score_total })}</Badge>}
            {icp && !movil && <Badge tono="neutro" apariencia="contorno" tamano="sm">{t('icp', { banda: icp })}</Badge>}
          </div>
        </div>
        {temp && <Badge tono={TONO_PRIORIDAD[temp]} punto tamano="sm">{t(`temperatura.${temp}`)}</Badge>}
        {!movil && p.onAbrirDetalle && <button type="button" aria-label={t('abrirDetalle')} onClick={p.onAbrirDetalle} className="flex size-8 items-center justify-center rounded-lg text-fg-secondary hover:bg-hover"><ExternalLink aria-hidden="true" className="size-4" /></button>}
        {p.menu}
      </div>

      <dl className={cn('grid gap-3 rounded-lg bg-subtle p-3', movil ? 'grid-cols-2' : 'grid-cols-5')}>
        {dato(t('monto'), formatMoneda(op.amount, moneda), <span className="text-xs font-normal text-fg-muted">{moneda.code}</span>)}
        {dato(t('probabilidad'), etapa?.probability === null || etapa?.probability === undefined ? '—' : `${etapa.probability} %`, <span className="text-xs font-normal text-fg-muted">{t('deLaEtapa')}</span>)}
        {dato(movil ? t('cierre') : t('cierreEstimado'), fechaCortaPlana(op.expected_close_date, idioma, true) || '—')}
        {dato(t('responsable'), op.responsable ? <span className="flex items-center gap-1.5"><AvatarIniciales nombre={op.responsable.nombre} src={op.responsable.avatarUrl} className="size-5 text-[10px]" />{op.responsable.nombre}</span> : <span className="font-normal text-fg-muted">{t('sinResponsable')}</span>)}
        {!movil && dato(t('enLaEtapa'), dias === null ? '—' : t('dias', { dias }))}
      </dl>

      <StageBar etapas={etapas} actualId={op.stage_id} layout={movil ? 'movil' : 'escritorio'} onElegir={p.onElegirEtapa} onGanar={() => p.onGanar?.()} onPerder={() => p.onPerder?.()} onAbrirHoja={p.onAbrirEtapas} soloLectura={permisos?.editar === false} />
      {barraAcciones}

      {pie.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {pie.includes('editar') && p.onEditar && (
            <button type="button" onClick={p.onEditar} className={clasesBoton({ variante: 'fantasma', tamano: 'sm', className: 'mr-auto' })}>
              <Pencil aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('editar')}
            </button>
          )}
          {pie.includes('perder') && <button type="button" onClick={p.onPerder} className={clasesBoton({ variante: 'secundario', tamano: 'sm', className: movil ? 'flex-1' : '' })}><XCircle aria-hidden="true" className="size-4" strokeWidth={1.5} />{t('marcarPerdida')}</button>}
          {pie.includes('ganar') && <button type="button" onClick={p.onGanar} className={clasesBoton({ tamano: 'sm', className: movil ? 'flex-1' : '' })}><Trophy aria-hidden="true" className="size-4" strokeWidth={1.5} />{t('marcarGanada')}</button>}
          {pie.includes('reabrir') && p.onReabrir && <button type="button" onClick={p.onReabrir} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}><RotateCcw aria-hidden="true" className="size-4" strokeWidth={1.5} />{t('reabrir')}</button>}
        </div>
      )}
    </header>
  );
}
