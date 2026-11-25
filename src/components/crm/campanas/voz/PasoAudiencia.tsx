'use client';

import { useMemo, useState } from 'react';
import { CalendarClock, ClipboardList, GitBranch, Kanban, RefreshCw, Users, X, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/utils/Utils';
import { Badge } from '@/components/ui/badge';
import { CustomerPicker } from '@/components/kit/CustomerPicker';
import type { ClientePicker } from '@/components/kit/selectorEntidadLogica';
import type { TonoBadge } from '@/components/kit/estadoTono';
import { SelectCrm } from '@/components/crm/kit/SelectCrm';
import { stagesOfPipeline, type CrmLookupsState } from '@/components/crm/shared/useCrmLookups';
import { buscarClientesCrm } from '@/components/crm/acciones/buscarClientes';
import type { EstadoObjetivo } from '@/lib/services/crm/campanaVozAudiencia';
import { FUENTES_AUDIENCIA, FUENTES_NO_DISPONIBLES, type ErrorPaso, type FormAsistente, type FuenteAudiencia } from './asistenteVozLogica';
import type { Lectura, SecuenciaConPasos } from './useDatosAsistenteVoz';
import type { AudienciaEstado } from './useAudienciaPrevia';

const ICONOS: Record<FuenteAudiencia, LucideIcon> = {
  pipeline_stage: Kanban,
  manual_list: ClipboardList,
  segment: Users,
  followup_due: CalendarClock,
  sequence_step: GitBranch,
};

const TONO_ESTADO: Record<EstadoObjetivo, TonoBadge> = {
  llamar: 'exito',
  prueba: 'informacion',
  baja: 'peligro',
  lista: 'peligro',
  sin_telefono: 'advertencia',
};

/** Paso 2 · Audiencia (Figma 1681:856945). */
export function PasoAudiencia({
  form,
  cambiar,
  errores,
  lookups,
  secuencias,
  audiencia,
  segmentoSinUsar = false,
}: {
  form: FormAsistente;
  cambiar: (p: Partial<FormAsistente>) => void;
  errores: ErrorPaso[];
  lookups: CrmLookupsState;
  secuencias: Lectura<SecuenciaConPasos[]>;
  audiencia: AudienciaEstado;
  /** Se llegó desde un segmento (`?segment=`), que las llamadas aún no usan: se avisa y se elige a quién llamar. */
  segmentoSinUsar?: boolean;
}) {
  const t = useTranslations('crm.campanaVozAsistente.audiencia');
  const [nombres, setNombres] = useState<Record<string, string>>({});
  const pipelines = lookups.pipelines;
  const pipelineId = form.pipelineId ?? lookups.stages.find((s) => s.id === form.stageId)?.pipeline_id ?? null;
  const etapas = useMemo(() => stagesOfPipeline(lookups.stages, pipelineId), [lookups.stages, pipelineId]);
  const listaSecuencias = secuencias.estado === 'listo' ? secuencias.datos : [];
  const secuenciaId = form.sequenceId ?? listaSecuencias.find((s) => s.steps.some((p) => p.id === form.stepId))?.id ?? null;
  const pasosSecuencia = listaSecuencias.find((s) => s.id === secuenciaId)?.steps ?? [];
  const nombreEtapa = (id: string | null) => lookups.stages.find((s) => s.id === id)?.name ?? '—';

  const elegirFuente = (fuente: FuenteAudiencia) => cambiar({ fuente });

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
        <h2 className="text-[13px] font-medium leading-[18px] text-fg">{t('pregunta')}</h2>
        {segmentoSinUsar && (
          <p role="status" className="rounded-lg border border-line bg-subtle px-3 py-2 text-[13px] leading-[18px] text-fg-secondary">
            {t('segmentoSinUsar')}
          </p>
        )}
        <div role="radiogroup" aria-label={t('pregunta')} className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {FUENTES_AUDIENCIA.map((f) => {
            const Icono = ICONOS[f];
            const sel = form.fuente === f;
            const deshabilitada = FUENTES_NO_DISPONIBLES.has(f);
            return (
              <button
                key={f}
                type="button"
                role="radio"
                aria-checked={sel}
                disabled={deshabilitada}
                title={deshabilitada ? t('noDisponible') : undefined}
                onClick={() => elegirFuente(f)}
                className={cn(
                  'flex min-h-[58px] flex-col items-start justify-between gap-2 rounded-lg border p-3 text-left text-[13px] leading-[18px] transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50',
                  sel ? 'border-brand bg-brand-tint text-brand-deep ring-1 ring-brand' : 'border-line text-fg hover:bg-hover',
                )}
              >
                <Icono aria-hidden="true" className="size-4" strokeWidth={1.5} />
                <span>{t(`fuentes.${f}`)}</span>
                {deshabilitada && <span className="sr-only">{t('noDisponible')}</span>}
              </button>
            );
          })}
        </div>

        {form.fuente === 'pipeline_stage' && (
          <div className="grid gap-2 sm:grid-cols-2">
            <SelectCrm
              aria-label={t('pipeline')}
              valor={pipelineId ?? ''}
              placeholder={t('pipelinePlaceholder')}
              opciones={pipelines.map((p) => ({ valor: p.id, etiqueta: `${t('pipeline')}: ${p.name}` }))}
              onValorChange={(v) => cambiar({ pipelineId: v || null, stageId: null })}
            />
            <SelectCrm
              aria-label={t('etapa')}
              aria-invalid={errores.includes('audiencia') && !form.stageId}
              valor={form.stageId ?? ''}
              placeholder={t('etapaPlaceholder')}
              disabled={!pipelineId}
              opciones={etapas.map((s) => ({ valor: s.id, etiqueta: `${t('etapa')}: ${s.name}` }))}
              onValorChange={(v) => cambiar({ stageId: v || null })}
            />
          </div>
        )}

        {form.fuente === 'sequence_step' && (
          <div className="grid gap-2 sm:grid-cols-2">
            <SelectCrm
              aria-label={t('secuencia')}
              valor={secuenciaId ?? ''}
              placeholder={t('secuenciaPlaceholder')}
              aria-busy={secuencias.estado === 'cargando'}
              opciones={listaSecuencias.map((s) => ({ valor: s.id, etiqueta: s.name }))}
              onValorChange={(v) => cambiar({ sequenceId: v || null, stepId: null })}
            />
            <SelectCrm
              aria-label={t('paso')}
              aria-invalid={errores.includes('audiencia') && !form.stepId}
              valor={form.stepId ?? ''}
              placeholder={t('pasoPlaceholder')}
              disabled={!secuenciaId}
              opciones={[...pasosSecuencia]
                .sort((a, b) => a.step_number - b.step_number)
                .map((p) => ({ valor: p.id, etiqueta: t('pasoOpcion', { n: p.step_number, canal: p.channel }) }))}
              onValorChange={(v) => cambiar({ stepId: v || null })}
            />
          </div>
        )}

        {form.fuente === 'followup_due' && <p className="text-[13px] leading-[18px] text-fg-secondary">{t('seguimientoAyuda')}</p>}

        {form.fuente === 'manual_list' && (
          <div className="flex flex-col gap-2">
            <CustomerPicker
              cliente={null}
              etiqueta={t('lista.agregar')}
              layout="campo"
              buscar={async (texto) =>
                (await buscarClientesCrm(texto)).map((c): ClientePicker => ({ id: c.id, nombre: c.full_name ?? t('tabla.sinNombre'), telefono: c.phone }))
              }
              onCambiar={(c) => {
                setNombres((n) => ({ ...n, [c.id]: c.nombre }));
                if (!form.customerIds.includes(c.id)) cambiar({ customerIds: [...form.customerIds, c.id] });
              }}
            />
            {form.customerIds.length === 0 ? (
              <p className="text-[13px] text-fg-secondary">{t('lista.vacia')}</p>
            ) : (
              <>
                <p className="text-xs text-fg-secondary">{t('lista.cuenta', { n: form.customerIds.length })}</p>
                <ul className="flex flex-wrap gap-1.5">
                  {form.customerIds.map((id) => {
                    const nombre = nombres[id] ?? audiencia.datos?.muestra.find((m) => m.customer_id === id)?.nombre ?? t('tabla.sinNombre');
                    return (
                      <li key={id} className="flex items-center gap-1 rounded-full border border-line bg-subtle py-0.5 pl-2.5 pr-1 text-xs text-fg">
                        {nombre}
                        <button
                          type="button"
                          aria-label={t('lista.quitar', { nombre })}
                          onClick={() => cambiar({ customerIds: form.customerIds.filter((x) => x !== id) })}
                          className="rounded-full p-0.5 text-fg-muted hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                        >
                          <X aria-hidden="true" className="size-3" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </div>
        )}

        {errores.includes('audiencia') && (
          <p role="alert" className="text-xs text-danger-text">
            {t('error')}
          </p>
        )}
      </section>

      <CifraAudiencia audiencia={audiencia} />

      {audiencia.estado === 'lista' && audiencia.datos && audiencia.datos.muestra.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <table className="w-full text-left text-sm" aria-label={t('tabla.etiqueta')}>
            <thead className="bg-subtle text-[13px] text-fg-secondary">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-medium">{t('tabla.contacto')}</th>
                <th scope="col" className="hidden px-4 py-2.5 font-medium sm:table-cell">{t('tabla.telefono')}</th>
                <th scope="col" className="hidden px-4 py-2.5 font-medium md:table-cell">{t('tabla.etapa')}</th>
                <th scope="col" className="px-4 py-2.5 font-medium">{t('tabla.estado')}</th>
              </tr>
            </thead>
            <tbody>
              {audiencia.datos.muestra.map((m) => (
                <tr key={m.customer_id} className="border-t border-line">
                  <td className="px-4 py-3 text-fg">{m.nombre ?? t('tabla.sinNombre')}</td>
                  <td className="hidden px-4 py-3 tabular-nums text-fg sm:table-cell">{m.telefono ?? '—'}</td>
                  <td className="hidden px-4 py-3 text-fg md:table-cell">{nombreEtapa(m.stage_id)}</td>
                  <td className="px-4 py-3">
                    <Badge tono={TONO_ESTADO[m.estado]} apariencia="contorno" tamano="sm">
                      {t(`estados.${m.estado}`)}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CifraAudiencia({ audiencia }: { audiencia: AudienciaEstado }) {
  const t = useTranslations('crm.campanaVozAsistente.audiencia.resumen');
  const d = audiencia.datos;
  return (
    <section aria-live="polite" className="flex flex-col gap-2 rounded-xl border border-line bg-subtle p-4">
      {audiencia.estado === 'inactiva' && <p className="text-[13px] text-fg-secondary">{t('elegir')}</p>}
      {audiencia.estado === 'cargando' && !d && <p className="text-[13px] text-fg-secondary">{t('cargando')}</p>}
      {audiencia.estado === 'error' && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[13px] text-danger-text">{t('error')}</p>
          <button type="button" onClick={audiencia.recargar} className="text-[13px] font-medium text-brand hover:underline">
            {t('reintentar')}
          </button>
        </div>
      )}
      {d && audiencia.estado !== 'error' && audiencia.estado !== 'inactiva' && (
        <>
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="text-lg font-semibold leading-6 text-fg">{t('seLlamaran', { n: d.a_llamar })}</p>
              <p className="text-xs text-fg-secondary">{t('de', { total: d.total, hora: audiencia.hora ?? '' })}</p>
            </div>
            <button
              type="button"
              onClick={audiencia.recargar}
              aria-label={t('actualizar')}
              title={t('actualizar')}
              className="rounded-md p-1.5 text-fg-muted hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <RefreshCw aria-hidden="true" className={cn('size-4', audiencia.estado === 'cargando' && 'animate-spin')} strokeWidth={1.5} />
            </button>
          </div>
          {d.total === 0 && <p className="text-[13px] text-fg-secondary">{t('vacia')}</p>}
          <div className="flex flex-wrap gap-1.5">
            {d.excluidos.baja > 0 && (
              <Badge tono="peligro" apariencia="contorno" tamano="sm">
                {t('baja', { n: d.excluidos.baja })}
              </Badge>
            )}
            {d.excluidos.lista > 0 && (
              <Badge tono="peligro" apariencia="contorno" tamano="sm">
                {t('lista', { n: d.excluidos.lista })}
              </Badge>
            )}
            {d.excluidos.sin_telefono > 0 && (
              <Badge tono="advertencia" apariencia="contorno" tamano="sm">
                {t('sinTelefono', { n: d.excluidos.sin_telefono })}
              </Badge>
            )}
          </div>
          {d.truncado && <p className="text-xs text-fg-muted">{t('truncado', { n: d.total })}</p>}
        </>
      )}
    </section>
  );
}
