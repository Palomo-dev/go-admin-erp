'use client';

import { CalendarDays, CircleAlert, CircleCheck, Loader2, Pencil, Zap } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { BarraProgreso } from '@/components/kit/BarraProgreso';
import { CampoFecha } from '@/components/kit/CampoFecha';
import { FormField } from '@/components/kit/FormField';
import { TarjetaSeleccionable } from '@/components/kit/TarjetaSeleccionable';
import { SelectCrm } from '@/components/crm/kit/SelectCrm';
import { horasDesde, type ErrorPaso, type FormAsistente, type PasoAsistente } from './asistenteVozLogica';
import type { Lectura, MotivoOrganizacion } from './useDatosAsistenteVoz';

export interface FilaRevision {
  clave: 'nombre' | 'objetivo' | 'audiencia' | 'agente' | 'horario' | 'topes' | 'cumplimiento';
  valor: string;
  paso: PasoAsistente;
}

/** Paso 6 · Revisión y activar (Figma 1683:861470): lista para revisar, con «Editar» por fila. */
export function PasoRevision({ filas, onEditar, motivos }: { filas: FilaRevision[]; onEditar: (p: PasoAsistente) => void; motivos: Lectura<MotivoOrganizacion[]> }) {
  const t = useTranslations('crm.campanaVozAsistente.revision');
  const tMotivos = useTranslations('vozCampanasDisparo.motivos');
  const bloqueos = motivos.estado === 'listo' ? motivos.datos.filter((m) => m.bloquea) : [];
  return (
    <section aria-labelledby="revision-titulo" className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4">
      <h2 id="revision-titulo" className="text-base font-semibold leading-6 text-fg">
        {t('titulo')}
      </h2>
      <dl className="flex flex-col">
        {filas.map((f) => (
          <div key={f.clave} className="flex flex-col gap-1 border-b border-line py-3 last:border-b-0 sm:flex-row sm:items-center sm:gap-4">
            <dt className="shrink-0 text-[13px] text-fg-secondary sm:w-28">{t(`filas.${f.clave}`)}</dt>
            <dd className="flex min-w-0 flex-1 items-center justify-between gap-3">
              <span className="min-w-0 text-sm text-fg sm:text-right">{f.valor}</span>
              <button
                type="button"
                onClick={() => onEditar(f.paso)}
                aria-label={t('editarAria', { campo: t(`filas.${f.clave}`) })}
                className="flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-[13px] font-medium text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <Pencil aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('editar')}
              </button>
            </dd>
          </div>
        ))}
      </dl>
      <div aria-live="polite">
        {motivos.estado === 'cargando' && (
          <p className="flex items-center gap-2 rounded-lg bg-subtle p-3 text-[13px] text-fg-secondary">
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            {t('comprobando')}
          </p>
        )}
        {motivos.estado === 'error' && <p className="rounded-lg bg-warning-subtle p-3 text-[13px] text-warning-text">{t('errorComprobar')}</p>}
        {motivos.estado === 'listo' && bloqueos.length === 0 && (
          <p className="flex items-start gap-2 rounded-lg border border-line-success bg-success-subtle p-3 text-[13px] text-success-text">
            <CircleCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
            {t('listo')}
          </p>
        )}
        {bloqueos.length > 0 && (
          <div role="alert" className="flex flex-col gap-1 rounded-lg border border-line-danger bg-danger-subtle p-3 text-[13px] text-danger-text">
            <p className="flex items-center gap-2 font-medium">
              <CircleAlert aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.5} />
              {t('bloqueado')}
            </p>
            <ul className="list-disc pl-10">
              {bloqueos.map((m) => (
                <li key={m.codigo}>{tMotivos.has(m.codigo) ? tMotivos(m.codigo, m.datos ?? {}) : m.codigo}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

/** Columna derecha del paso 6: «¿Cuándo empieza?» y «Minutos de voz». */
export function CuandoEmpieza({
  form,
  cambiar,
  errores,
  hoy,
  zona,
  estimado,
  disponibles,
}: {
  form: FormAsistente;
  cambiar: (p: Partial<FormAsistente>) => void;
  errores: ErrorPaso[];
  hoy: string;
  zona: string;
  estimado: number | null;
  disponibles: number | null;
}) {
  const t = useTranslations('crm.campanaVozAsistente.revision');
  const tHorario = useTranslations('crm.campanaVozAsistente.horario');
  const formato = useFormatter();
  return (
    <div className="flex flex-col gap-4">
      <section aria-labelledby="cuando-titulo" className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
        <h2 id="cuando-titulo" className="text-base font-semibold leading-6 text-fg">
          {t('cuando.titulo')}
        </h2>
        <div role="radiogroup" aria-labelledby="cuando-titulo" className="flex flex-col gap-2">
          <TarjetaSeleccionable
            orientacion="horizontal"
            icono={Zap}
            titulo={t('cuando.ahora.titulo')}
            descripcion={t('cuando.ahora.texto')}
            seleccionada={form.inicio === 'ahora'}
            onSeleccionar={() => cambiar({ inicio: 'ahora' })}
          />
          <TarjetaSeleccionable
            orientacion="horizontal"
            icono={CalendarDays}
            titulo={t('cuando.programar.titulo')}
            descripcion={t('cuando.programar.texto')}
            seleccionada={form.inicio === 'programar'}
            onSeleccionar={() => cambiar({ inicio: 'programar', inicioFecha: form.inicioFecha || hoy })}
          />
        </div>
        {form.inicio === 'programar' && (
          <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-2">
            <FormField etiqueta={t('cuando.fecha')} obligatorio error={errores.includes('inicio') ? t('cuando.error') : null} ayuda={t('cuando.ayuda', { zona })}>
              {(campo) => (
                <CampoFecha
                  id={campo.id}
                  aria-describedby={campo['aria-describedby']}
                  aria-invalid={campo['aria-invalid']}
                  required
                  valor={form.inicioFecha}
                  min={hoy}
                  hoy={hoy}
                  onValorChange={(dia) => cambiar({ inicioFecha: dia })}
                />
              )}
            </FormField>
            <FormField etiqueta={t('cuando.hora')}>
              {(campo) => (
                <SelectCrm
                  id={campo.id}
                  valor={String(form.inicioHora)}
                  opciones={horasDesde().map((h) => ({ valor: String(h), etiqueta: tHorario('hora', { h }) }))}
                  onValorChange={(v) => cambiar({ inicioHora: Number(v) })}
                />
              )}
            </FormField>
          </div>
        )}
      </section>
      <section className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4">
        <div className="flex items-baseline justify-between gap-2 text-[13px]">
          <span className="text-fg-secondary">{t('minutos.titulo')}</span>
          <span className="font-medium tabular-nums text-fg">
            {disponibles === null
              ? '—'
              : estimado === null
                ? t('minutos.sinEstimado', { disponibles: formato.number(disponibles) })
                : t('minutos.valor', { estimado: formato.number(estimado), disponibles: formato.number(disponibles) })}
          </span>
        </div>
        {estimado !== null && disponibles !== null && disponibles > 0 && (
          <BarraProgreso valor={Math.min(estimado, disponibles)} max={disponibles} etiqueta={t('minutos.titulo')} tono={estimado > disponibles ? 'advertencia' : 'marca'} />
        )}
        <p className="text-xs leading-4 text-fg-muted">{t('minutos.ayuda')}</p>
      </section>
    </div>
  );
}
