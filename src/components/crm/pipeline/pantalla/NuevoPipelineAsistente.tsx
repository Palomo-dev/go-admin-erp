'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Circle, Loader2, Plus } from 'lucide-react';
import { PanelAdaptable } from '@/components/kit/PanelAdaptable';
import { Stepper } from '@/components/kit/Stepper';
import { FormField } from '@/components/kit/FormField';
import { clasesBoton } from '@/components/kit/botonClases';
import { cn } from '@/utils/Utils';
import { PipelineTemplateCard } from '@/components/crm/kit/PipelineTemplateCard';
import { StageEditorRow } from '@/components/crm/kit/StageEditorRow';
import { clavePlantilla } from '@/components/crm/kit/pipelineTemplateCardLogica';
import { reordenar } from '@/components/crm/kit/stageEditorRowLogica';
import { CLASE_CAMPO } from '@/components/crm/kit/camposCrm';
import { SelectCrm } from '@/components/crm/kit/SelectCrm';
import { claveError, emitirCambioCrm, ErrorApiCrm, pedirCrm } from '@/components/crm/acciones/apiCrm';
import { invalidarCatalogosCrm } from '@/components/crm/acciones/useCatalogosCrm';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import type { PipelineTemplate } from '@/lib/services/crm/pipelineTemplates';
import { cuerpoPipeline, datosIniciales, etapaNueva, etapasEditables, MAX_ETAPAS, PERIODOS_META, plantillasAsistente, revisarEtapas, TIPOS_PIPELINE, validarDatos, type DatosPipeline, type PasoAsistente } from './nuevoPipelineLogica';

/**
 * «Nuevo pipeline» (CRM ola 3B, plan §4.3; Figma 816:56539, 816:56990,
 * 816:57260, 816:57906 y 816:58273; móvil 817:*): plantilla → nombre, tipo,
 * meta y por defecto → etapas editables (`StageEditorRow`). Crea todo en UNA
 * transacción por `POST /api/crm/pipelines` (`crm.pipelines.manage`); si
 * falla no queda nada a medias y el asistente conserva lo escrito.
 */
export interface NuevoPipelineAsistenteProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  /** Pipelines de la organización (aviso «ya existe uno de ese tipo» y nombre repetido). */
  existentes: readonly { name: string; pipeline_type?: string | null }[];
  /** «Sin embudo de ventas → Crear embudo»: arranca en Ventas. */
  plantillaInicial?: 'sales' | 'onboarding' | 'renewal' | 'blank';
  onCreado: (pipelineId: string) => void;
}

export function NuevoPipelineAsistente(p: NuevoPipelineAsistenteProps) {
  const t = useTranslations('crm.oportunidad.asistente');
  const tp = useTranslations('crm.kit.plantilla');
  const te = useTranslations('crm.accionesRapidas.errores');
  const moneda = useMonedaOrganizacion();
  const plantillas = plantillasAsistente();
  const tipos = p.existentes.map((x) => x.pipeline_type ?? null);
  const [paso, setPaso] = useState<PasoAsistente>('plantilla');
  const [plantilla, setPlantilla] = useState<PipelineTemplate>(plantillas[0]);
  const [datos, setDatos] = useState<DatosPipeline>(() => datosIniciales(plantillas[0], moneda.code, tp('nombres.ventas'), tipos));
  const [etapas, setEtapas] = useState(() => etapasEditables(plantillas[0], { ganada: tp('ganada'), perdida: tp('perdida') }));
  const [intentado, setIntentado] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const elegir = (pl: PipelineTemplate) => {
    setPlantilla(pl);
    setDatos(datosIniciales(pl, moneda.code, tp(`nombres.${clavePlantilla(pl.key)}`), tipos));
    setEtapas(etapasEditables(pl, { ganada: tp('ganada'), perdida: tp('perdida') }));
  };
  useEffect(() => {
    if (!p.abierto) return;
    setPaso('plantilla');
    setIntentado(false);
    setError(null);
    elegir(plantillas.find((x) => x.key === p.plantillaInicial) ?? plantillas[0]);
    // Solo al abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.abierto]);

  const errorDatos = validarDatos(datos, p.existentes.map((x) => x.name));
  const revision = revisarEtapas(etapas);
  const colores = Array.from(new Set(plantillas.flatMap((x) => x.stages.map((s) => s.color)).filter(Boolean)));

  const crear = async () => {
    setIntentado(true);
    if (!revision.ok || errorDatos) return;
    setOcupado(true);
    setError(null);
    try {
      const { data } = await pedirCrm<{ pipeline: { id: string } }>('/api/crm/pipelines', { method: 'POST', cuerpo: cuerpoPipeline(datos, etapas) });
      invalidarCatalogosCrm();
      emitirCambioCrm({ entidad: 'opportunity', accion: 'pipeline' });
      p.onCreado(data.pipeline.id);
      p.onAbiertoChange(false);
    } catch (e) {
      setError(e instanceof ErrorApiCrm && e.status === 409 ? t('errorNombre') : e instanceof ErrorApiCrm && e.status === 400 ? t('errorEtapas') : t('errorCrear', { detalle: te(claveError(e)) }));
    } finally {
      setOcupado(false);
    }
  };

  const siguiente = () => {
    if (paso === 'plantilla') return setPaso('datos');
    setIntentado(true);
    if (!errorDatos) {
      setIntentado(false);
      setPaso('etapas');
    }
  };

  const titulo = paso === 'plantilla' ? t('titulo') : t('tituloCon', { nombre: datos.nombre || tp(`nombres.${clavePlantilla(plantilla.key)}`) });
  const pie = (
    <>
      <button type="button" onClick={() => p.onAbiertoChange(false)} disabled={ocupado} className={clasesBoton({ variante: 'fantasma', className: 'sm:mr-auto' })}>{t('cancelar')}</button>
      {paso !== 'plantilla' && (
        <button type="button" onClick={() => setPaso(paso === 'etapas' ? 'datos' : 'plantilla')} disabled={ocupado} className={clasesBoton({ variante: 'secundario' })}>
          <ArrowLeft aria-hidden="true" className="size-4" />
          {t('atras')}
        </button>
      )}
      {paso === 'etapas' ? (
        <button type="button" onClick={() => void crear()} disabled={ocupado} aria-busy={ocupado || undefined} className={clasesBoton()}>
          {ocupado ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <Check aria-hidden="true" className="size-4" />}
          {t('crear')}
        </button>
      ) : (
        <button type="button" onClick={siguiente} className={clasesBoton()}>
          <ArrowRight aria-hidden="true" className="size-4" />
          {t('siguiente')}
        </button>
      )}
    </>
  );

  const check = (ok: boolean, texto: string) => (
    <li className={cn('flex items-center gap-2 text-[13px]', ok ? 'text-fg' : 'text-danger-text')}>
      {ok ? <CheckCircle2 aria-hidden="true" className="size-4 text-success-text" /> : <Circle aria-hidden="true" className="size-4" />}
      {texto}
    </li>
  );

  return (
    <PanelAdaptable abierto={p.abierto} onAbiertoChange={p.onAbiertoChange} titulo={titulo} descripcion={t(`desc.${paso}`)} ancho={1120} ocupado={ocupado} pie={pie}
      debajoCabecera={<Stepper pasos={(['plantilla', 'datos', 'etapas'] as const).map((v) => ({ valor: v, etiqueta: t(`pasos.${v}`) }))} actual={paso} etiqueta={t('pasosAria')} resumenMovil={(n, total, etiqueta) => t('pasoMovil', { n, total, etiqueta })} />}
    >
      {error && <p role="alert" className="rounded-lg bg-danger-subtle px-3 py-2 text-[13px] text-danger-text">{error}</p>}
      {paso === 'plantilla' && (
        <>
          <div role="radiogroup" aria-label={t('pasos.plantilla')} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {plantillas.map((pl) => <PipelineTemplateCard key={pl.key} plantilla={pl} seleccionada={pl.key === plantilla.key} onSeleccionar={() => elegir(pl)} tiposExistentes={tipos} />)}
          </div>
          <p className="text-xs text-fg-muted">{t('notaCierre')}</p>
        </>
      )}
      {paso === 'datos' && (
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="flex flex-col gap-4">
            <FormField etiqueta={t('nombre')} obligatorio error={intentado && errorDatos && errorDatos !== 'metaInvalida' ? t(`error.${errorDatos}`) : undefined} ayuda={t('nombreAyuda')}>
              <input value={datos.nombre} onChange={(e) => setDatos({ ...datos, nombre: e.target.value })} maxLength={120} className={CLASE_CAMPO} />
            </FormField>
            <FormField etiqueta={t('tipo')} obligatorio ayuda={datos.tipo === 'sales' ? t('tipoAyuda') : undefined}>
              <SelectCrm valor={datos.tipo} onValorChange={(tipo) => setDatos({ ...datos, tipo: tipo as DatosPipeline['tipo'] })} opciones={TIPOS_PIPELINE.map((x) => ({ valor: x, etiqueta: t(`tipos.${x}`) }))} />
            </FormField>
            <div className="grid gap-3 sm:grid-cols-3">
              <FormField etiqueta={t('meta')} error={intentado && errorDatos === 'metaInvalida' ? t('error.metaInvalida') : undefined}>
                <input inputMode="decimal" value={datos.meta} onChange={(e) => setDatos({ ...datos, meta: e.target.value })} className={CLASE_CAMPO} />
              </FormField>
              <FormField etiqueta={t('moneda')}>
                <input value={datos.moneda} onChange={(e) => setDatos({ ...datos, moneda: e.target.value.toUpperCase().slice(0, 3) })} className={CLASE_CAMPO} />
              </FormField>
              <FormField etiqueta={t('periodo')}>
                <SelectCrm valor={datos.periodo} onValorChange={(periodo) => setDatos({ ...datos, periodo: periodo as DatosPipeline['periodo'] })} opciones={PERIODOS_META.map((x) => ({ valor: x, etiqueta: t(`periodos.${x}`) }))} />
              </FormField>
            </div>
            <label className="flex items-start gap-3 rounded-xl border border-line p-3">
              <input type="checkbox" checked={datos.porDefecto} onChange={(e) => setDatos({ ...datos, porDefecto: e.target.checked })} className="mt-1 size-4 accent-brand-action" />
              <span className="flex flex-col gap-0.5">
                <span className="text-sm font-medium text-fg">{t('porDefecto')}</span>
                <span className="text-xs text-fg-secondary">{t('porDefectoAyuda')}</span>
              </span>
            </label>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-fg-secondary">{t('vistaPrevia')}</span>
            <PipelineTemplateCard plantilla={plantilla} seleccionada onSeleccionar={() => undefined} tabIndex={-1} />
          </div>
        </div>
      )}
      {paso === 'etapas' && (
        <div className="flex flex-col gap-2">
          {etapas.map((e, i) => (
            <StageEditorRow
              key={e.clave}
              etapa={e}
              colores={colores}
              error={intentado ? revision.errores[e.clave] ?? null : null}
              onCambiar={(n) => setEtapas(etapas.map((x) => (x.clave === e.clave ? n : x)))}
              onMover={(d) => setEtapas(reordenar(etapas, i, i + d))}
              onEliminar={etapas.length > 1 ? () => setEtapas(etapas.filter((x) => x.clave !== e.clave)) : undefined}
            />
          ))}
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setEtapas([...etapas, etapaNueva(colores[0] ?? '')])} disabled={etapas.length >= MAX_ETAPAS} className={clasesBoton({ variante: 'secundario' })}>
              <Plus aria-hidden="true" className="size-4" />
              {t('agregarEtapa')}
            </button>
            <span className="text-xs text-fg-muted">{t('limiteEtapas', { n: etapas.length, max: MAX_ETAPAS })}</span>
          </div>
          <ul aria-label={t('requisitosAria')} className="flex flex-col gap-1.5 rounded-xl bg-subtle p-3">
            {check(!!revision.ganada, revision.ganada ? t('checkGanada', { nombre: revision.ganada }) : t('faltaGanada'))}
            {check(!!revision.perdida, revision.perdida ? t('checkPerdida', { nombre: revision.perdida }) : t('faltaPerdida'))}
            {check(revision.enOrden, t('checkOrden'))}
          </ul>
        </div>
      )}
    </PanelAdaptable>
  );
}
