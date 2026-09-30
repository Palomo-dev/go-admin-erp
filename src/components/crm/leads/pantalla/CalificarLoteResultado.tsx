'use client';

import { useTranslations } from 'next-intl';
import { CircleAlert, CircleCheck, KanbanSquare, Loader2 } from 'lucide-react';
import { AvatarIniciales } from '@/components/kit/AvatarIniciales';
import { PanelAdaptable } from '@/components/kit/PanelAdaptable';
import { clasesBoton } from '@/components/kit/botonClases';
import type { LeadFila } from '@/components/crm/kit/leadRowLogica';
import { avataresLote, motivoLote, type ResultadoLote } from './calificarLotePantallaLogica';

/** Avatares compactos de los leads del lote (+N los que no están en la página). */
export function AvataresLote({ leads, total }: { leads: readonly LeadFila[]; total: number }) {
  const t = useTranslations('crm.pantallaLeads.lote');
  const { visibles, resto } = avataresLote(leads, total);
  return (
    <div className="flex items-center gap-3 rounded-lg bg-subtle p-3">
      <ul className="flex -space-x-2" aria-label={t('seleccionados', { n: total })}>
        {visibles.map((l) => (
          <li key={l.id} title={l.full_name ?? ''}>
            <AvatarIniciales nombre={l.full_name?.trim() || '?'} src={l.avatar_url} className="ring-2 ring-surface" />
          </li>
        ))}
        {resto > 0 && (
          <li className="flex size-8 items-center justify-center rounded-full bg-surface text-xs font-medium text-fg-secondary ring-2 ring-surface">{t('mas', { n: resto })}</li>
        )}
      </ul>
      <span className="text-sm font-semibold text-fg">{t('seleccionados', { n: total })}</span>
    </div>
  );
}

export interface CalificarLoteResultadoProps {
  abierto: boolean;
  total: number;
  /** `null` mientras se envía. */
  resultado: ResultadoLote | null;
  onCerrar: () => void;
  onVerPipeline: () => void;
}

/** Progreso («Creando N oportunidades…») y resultado del lote en el mismo diálogo. */
export function CalificarLoteResultado({ abierto, total, resultado, onCerrar, onVerPipeline }: CalificarLoteResultadoProps) {
  const t = useTranslations('crm.pantallaLeads.lote');
  const enviando = resultado === null;
  return (
    <PanelAdaptable
      abierto={abierto}
      onAbiertoChange={(x) => !x && onCerrar()}
      titulo={t('resultadoTitulo')}
      ancho={560}
      ocupado={enviando}
      pie={
        !enviando && (
          <>
            <button type="button" onClick={onCerrar} className={clasesBoton({ variante: 'secundario' })}>{t('cerrar')}</button>
            {resultado.creadas.length > 0 && (
              <button type="button" onClick={onVerPipeline} className={clasesBoton()}>
                <KanbanSquare aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('verPipeline')}
              </button>
            )}
          </>
        )
      }
    >
      {enviando ? (
        <p role="status" aria-live="polite" className="flex items-center gap-2 py-6 text-sm text-fg">
          <Loader2 aria-hidden="true" className="size-5 animate-spin text-brand" />
          {t('creando', { n: total })}
        </p>
      ) : (
        <div className="flex flex-col gap-4" aria-live="polite">
          <p className="flex items-center gap-2 text-sm font-semibold text-fg">
            <CircleCheck aria-hidden="true" className="size-5 text-success-text" strokeWidth={1.5} />
            {t('creadas', { n: resultado.creadas.length })}
          </p>
          {resultado.fallidas.length > 0 && (
            <section className="flex flex-col gap-2">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-danger-text">
                <CircleAlert aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('fallidas', { n: resultado.fallidas.length })}
              </h3>
              <ul className="flex max-h-64 flex-col divide-y divide-line overflow-y-auto rounded-lg border border-line">
                {resultado.fallidas.map((f) => (
                  <li key={f.customer_id} className="flex flex-col gap-0.5 px-3 py-2 text-[13px]">
                    <span className="font-medium text-fg">{f.nombre || t('leadNoDisponible')}</span>
                    <span className="text-danger-text">{t(`motivos.${motivoLote(f.codigo)}`, { codigo: f.codigo })}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </PanelAdaptable>
  );
}
