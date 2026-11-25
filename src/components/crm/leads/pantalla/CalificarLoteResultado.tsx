'use client';

import { useTranslations } from 'next-intl';
import { ArrowRight, CircleCheck } from 'lucide-react';
import { AvatarIniciales } from '@/components/kit/AvatarIniciales';
import { PanelAdaptable } from '@/components/kit/PanelAdaptable';
import { clasesBoton } from '@/components/kit/botonClases';
import type { LeadFila } from '@/components/crm/kit/leadRowLogica';
import { MARCADOR_CLIENTE, nombreDesdePatron } from '@/lib/services/crm/calificarLoteLogica';
import { formatMoneda, type ContextoMoneda } from '@/lib/utils/moneda';
import { avataresLote, motivoLote, type ResultadoLote } from './calificarLotePantallaLogica';

/** «Café Aurora, Taller Norte, Ana Gómez y 22 más». */
function nombresResumidos(leads: readonly LeadFila[], total: number, t: (k: string, v: Record<string, string | number>) => string): string {
  const visibles = leads.slice(0, 3).map((l) => l.full_name?.trim() || '?');
  const resto = Math.max(0, total - visibles.length);
  return resto > 0 ? t('nombresYMas', { nombres: visibles.join(', '), n: resto }) : visibles.join(', ');
}

/** Avatares compactos de los leads del lote (+N los que no están en la página) y sus nombres. */
export function AvataresLote({ leads, total }: { leads: readonly LeadFila[]; total: number }) {
  const t = useTranslations('crm.pantallaLeads.lote');
  const { visibles, resto } = avataresLote(leads, total, 3);
  return (
    <div className="flex items-center gap-3 rounded-lg bg-subtle p-3">
      <ul className="flex shrink-0 -space-x-2" aria-label={t('seleccionados', { n: total })}>
        {visibles.map((l) => (
          <li key={l.id} title={l.full_name ?? ''}>
            <AvatarIniciales nombre={l.full_name?.trim() || '?'} src={l.avatar_url} className="ring-2 ring-surface" />
          </li>
        ))}
        {resto > 0 && (
          <li className="flex size-8 items-center justify-center rounded-full bg-surface text-xs font-medium text-fg-secondary ring-2 ring-surface">{t('mas', { n: resto })}</li>
        )}
      </ul>
      <div className="flex min-w-0 flex-col">
        <span className="text-sm font-semibold text-fg">{t('seleccionados', { n: total })}</span>
        {leads.length > 0 && <span className="truncate text-[13px] text-fg-secondary">{nombresResumidos(leads, total, t)}</span>}
      </div>
    </div>
  );
}

/**
 * Paso 2 del lote (Figma 1524:122419): ayuda del marcador y «Vista previa ·
 * así quedarán los nombres» con los tres primeros leads y «+N más».
 */
export function VistaPreviaNombres({ patron, leads, total }: { patron: string; leads: readonly LeadFila[]; total: number }) {
  const t = useTranslations('crm.pantallaLeads.lote');
  const muestra = leads.slice(0, 3);
  return (
    <div className="-mt-1 flex flex-col gap-1.5">
      <p className="text-xs text-fg-muted">{t('ayudaMarcador', { marcador: MARCADOR_CLIENTE })}</p>
      {patron.trim() && muestra.length > 0 && (
        <>
          <span className="text-xs font-medium text-fg-secondary">{t('vistaPrevia')}</span>
          <ul className="flex flex-wrap gap-1.5">
            {muestra.map((l) => (
              <li key={l.id} className="rounded-full bg-subtle px-2.5 py-1 text-xs text-fg-secondary">{nombreDesdePatron(patron, l.full_name)}</li>
            ))}
            {total > muestra.length && <li className="rounded-full bg-subtle px-2.5 py-1 text-xs text-fg-secondary">{t('masN', { n: total - muestra.length })}</li>}
          </ul>
        </>
      )}
    </div>
  );
}

export interface CalificarLoteResultadoProps {
  abierto: boolean;
  total: number;
  /** Filas visibles del lote (avatares y nombres de ejemplo). */
  leads?: readonly LeadFila[];
  /** Patrón del nombre enviado («{cliente} — Uniformes»). */
  patron?: string;
  /** `null` mientras se envía. */
  resultado: ResultadoLote | null;
  onCerrar: () => void;
  onVerPipeline: () => void;
  /** Líneas de la plantilla: el resultado dice cuántas se crearon con líneas y el valor que entró al pipeline. */
  conLineas?: { lineas: number; valorPorOportunidad: number; moneda: ContextoMoneda } | null;
}

/**
 * «Creando» (Figma 1525:122807) y «Calificación en lote terminada» (1525:123244)
 * en el mismo diálogo. El lote es una sola petición: mientras se crea, la barra
 * es indeterminada y la lista muestra los primeros nombres.
 */
export function CalificarLoteResultado({ abierto, total, leads = [], patron = '', resultado, onCerrar, onVerPipeline, conLineas }: CalificarLoteResultadoProps) {
  const t = useTranslations('crm.pantallaLeads.lote');
  const enviando = resultado === null;
  const nombresPorId = new Map(leads.map((l) => [l.id, l.full_name]));
  return (
    <PanelAdaptable
      abierto={abierto}
      onAbiertoChange={(x) => !x && onCerrar()}
      titulo={enviando ? t('titulo', { n: total }) : t('terminadaTitulo')}
      descripcion={enviando ? t('creandoDescripcion') : t('procesados', { n: total })}
      ancho={560}
      ocupado={enviando}
      pie={
        enviando ? (
          <button type="button" disabled className={clasesBoton()}>
            <ArrowRight aria-hidden="true" className="size-4" />
            {t('creandoBoton')}
          </button>
        ) : (
          <>
            <button type="button" onClick={onCerrar} className={clasesBoton({ variante: 'secundario' })}>{t('cerrar')}</button>
            {resultado.creadas.length > 0 && (
              <button type="button" onClick={onVerPipeline} className={clasesBoton()}>
                <ArrowRight aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('verPipeline')}
              </button>
            )}
          </>
        )
      }
    >
      {enviando ? (
        <div className="flex flex-col gap-4" role="status" aria-live="polite">
          <AvataresLote leads={leads} total={total} />
          <div className="flex flex-col gap-2">
            <span className="text-[13px] text-fg-secondary">{t('creando', { n: total })}</span>
            <div className="h-1.5 overflow-hidden rounded-full bg-subtle">
              <div className="h-full w-1/3 animate-pulse rounded-full bg-brand" />
            </div>
            <ul className="flex flex-col gap-1.5 text-sm">
              {leads.slice(0, 3).map((l) => (
                <li key={l.id} className="flex justify-between gap-3">
                  <span className="truncate text-fg">{nombreDesdePatron(patron || MARCADOR_CLIENTE, l.full_name)}</span>
                  <span className="shrink-0 text-fg-secondary">{t('creandoUno')}</span>
                </li>
              ))}
            </ul>
          </div>
          <p className="text-[13px] text-fg-secondary">{t('creandoNota')}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4" aria-live="polite">
          {resultado.creadas.length > 0 && (
            <p className="flex items-start gap-2 rounded-lg border border-line-success bg-success-subtle px-4 py-3 text-[13px] text-success-text">
              <CircleCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
              <span>
                {t('creadasDetalle', { n: resultado.creadas.length })}
                {conLineas && ` ${t('creadasConLineas', { n: resultado.creadas.length, lineas: conLineas.lineas, valor: formatMoneda(conLineas.valorPorOportunidad * resultado.creadas.length, conLineas.moneda) })}`}
              </span>
            </p>
          )}
          {resultado.creadas.length === 0 && <p className="text-sm font-semibold text-fg">{t('creadas', { n: 0 })}</p>}
          {resultado.fallidas.length > 0 && (
            <section className="flex flex-col gap-3 rounded-lg border border-line-danger bg-danger-subtle px-4 py-3">
              <h3 className="text-sm font-semibold text-danger-text">{t('noCalificados', { n: resultado.fallidas.length })}</h3>
              <ul className="flex max-h-64 flex-col gap-3 overflow-y-auto">
                {resultado.fallidas.map((f) => {
                  const nombre = f.nombre || nombresPorId.get(f.customer_id) || t('leadNoDisponible');
                  return (
                    <li key={f.customer_id} className="flex items-center gap-3">
                      <AvatarIniciales nombre={nombre} />
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate text-sm font-medium text-fg">{nombre}</span>
                        <span className="text-[13px] text-danger-text">{t(`motivos.${motivoLote(f.codigo)}`, { codigo: f.codigo })}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
          {resultado.fallidas.length > 0 && resultado.creadas.length > 0 && (
            <p className="text-[13px] text-fg-secondary">{t('notaFinal', { fallidas: resultado.fallidas.length, creadas: resultado.creadas.length })}</p>
          )}
        </div>
      )}
    </PanelAdaptable>
  );
}
