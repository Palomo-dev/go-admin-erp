'use client';

/**
 * Columna izquierda del detalle de una carta (Figma B/13-02): «Cuándo se
 * muestra» (fila por día con interruptor y franjas), «En qué sedes» (Todas /
 * Elegir sedes) y «PDF de la carta (opcional)». El horario se reutiliza en la
 * pestaña «Horario» del móvil: un solo componente.
 */
import { useRef } from 'react';
import { ExternalLink, Plus, Upload, X } from 'lucide-react';
import { FormSection, SegmentedControl, clasesBoton } from '@/components/kit';
import { CampoHora } from '@/components/kit/CampoHora';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/utils/Utils';
import { DIAS_ISO, esTodoElDia, type DiaIso, type FranjaHorario, type HorarioCarta, type SedeCarta } from '@/lib/website/carta';
import type { TraductorConfiguracion } from '../textos';
import { CLASE_TAMANO_ICONO, TRAZO_ICONO } from '../../ui/iconosSitio';

const FRANJA_NUEVA: FranjaHorario = { from: '12:00', to: '15:00' };

export function PanelHorarioCarta({
  t,
  horario,
  onCambiar,
  deshabilitado,
}: {
  t: TraductorConfiguracion;
  horario: HorarioCarta;
  onCambiar: (h: HorarioCarta) => void;
  deshabilitado?: boolean;
}) {
  const cambiarDia = (dia: DiaIso, franjas: FranjaHorario[]) => onCambiar({ ...horario, [dia]: franjas });

  return (
    <FormSection titulo={t('detalle.cuando')}>
      <ul className="flex flex-col gap-2">
        {DIAS_ISO.map((dia) => {
          const franjas = horario[dia] ?? [];
          const activo = franjas.length > 0;
          return (
            <li key={dia} className="flex flex-wrap items-start gap-x-3 gap-y-2">
              <div className="flex w-20 items-center gap-2 pt-1">
                <Switch
                  checked={activo}
                  disabled={deshabilitado}
                  aria-label={t(`carta.diasLargos.${dia}`)}
                  onCheckedChange={(v) => cambiarDia(dia, v ? [{ ...(horario['1']?.[0] ?? FRANJA_NUEVA) }] : [])}
                />
                <span className="text-sm text-fg">{t(`carta.dias.${dia}`)}</span>
              </div>
              {!activo ? (
                <span className="pt-1.5 text-[13px] text-fg-muted">{t('detalle.noSeMuestra')}</span>
              ) : (
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  {franjas.map((f, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <CampoHora
                        tamano="sm"
                        paso={15}
                        valor={f.from}
                        disabled={deshabilitado}
                        aria-label={`${t('detalle.desde')} · ${t(`carta.diasLargos.${dia}`)}`}
                        onValorChange={(v) => cambiarDia(dia, franjas.map((x, j) => (j === i ? { ...x, from: v } : x)))}
                        className="w-28"
                      />
                      <span aria-hidden="true" className="text-fg-muted">
                        –
                      </span>
                      <CampoHora
                        tamano="sm"
                        paso={15}
                        valor={f.to}
                        disabled={deshabilitado}
                        aria-label={`${t('detalle.hasta')} · ${t(`carta.diasLargos.${dia}`)}`}
                        onValorChange={(v) => cambiarDia(dia, franjas.map((x, j) => (j === i ? { ...x, to: v } : x)))}
                        className="w-28"
                      />
                      {esTodoElDia(f) && <span className="text-xs text-fg-muted">{t('carta.todoElDia')}</span>}
                      {franjas.length > 1 && (
                        <button
                          type="button"
                          className={clasesBoton({ variante: 'fantasma', tamano: 'sm', className: 'px-2' })}
                          aria-label={t('detalle.quitarFranja')}
                          disabled={deshabilitado}
                          onClick={() => cambiarDia(dia, franjas.filter((_, j) => j !== i))}
                        >
                          <X aria-hidden="true" className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} />
                        </button>
                      )}
                    </div>
                  ))}
                  {franjas.length < 4 && (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 self-start text-xs font-medium text-link hover:underline disabled:opacity-50"
                      disabled={deshabilitado}
                      onClick={() => cambiarDia(dia, [...franjas, { ...FRANJA_NUEVA }])}
                    >
                      <Plus aria-hidden="true" className={CLASE_TAMANO_ICONO.meta} strokeWidth={TRAZO_ICONO} />
                      {t('detalle.anadirFranja')}
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </FormSection>
  );
}

export function PanelSedesCarta({
  t,
  sedes,
  todas,
  onCambiar,
  deshabilitado,
}: {
  t: TraductorConfiguracion;
  sedes: number[] | null;
  todas: SedeCarta[];
  onCambiar: (s: number[] | null) => void;
  deshabilitado?: boolean;
}) {
  const elegir = sedes !== null;
  return (
    <FormSection titulo={t('detalle.sedes')}>
      <SegmentedControl
        etiqueta={t('detalle.sedes')}
        anchoCompleto
        deshabilitado={deshabilitado}
        opciones={[
          { valor: 'todas', etiqueta: t('detalle.sedesTodas') },
          { valor: 'elegir', etiqueta: t('detalle.sedesElegir') },
        ]}
        valor={elegir ? 'elegir' : 'todas'}
        onValorChange={(v) => onCambiar(v === 'todas' ? null : todas.slice(0, 1).map((s) => s.id))}
      />
      {elegir && (
        <ul className="flex flex-col gap-2">
          {todas.map((s) => {
            const id = `carta-sede-${s.id}`;
            const marcada = sedes.includes(s.id);
            return (
              <li key={s.id} className="flex items-center gap-2">
                <Checkbox
                  id={id}
                  checked={marcada}
                  disabled={deshabilitado || (marcada && sedes.length === 1)}
                  onCheckedChange={(v) => onCambiar(v ? [...sedes, s.id] : sedes.filter((x) => x !== s.id))}
                />
                <label htmlFor={id} className="text-sm text-fg">
                  {s.nombre}
                </label>
              </li>
            );
          })}
        </ul>
      )}
      {elegir && sedes.length === 1 && <p className="text-xs text-fg-muted">{t('detalle.sedesAlMenosUna')}</p>}
    </FormSection>
  );
}

export function PanelPdfCarta({
  t,
  pdfUrl,
  subiendo,
  onSubir,
  onQuitar,
  deshabilitado,
}: {
  t: TraductorConfiguracion;
  pdfUrl: string | null;
  subiendo: boolean;
  onSubir: (archivo: File) => void;
  onQuitar: () => void;
  deshabilitado?: boolean;
}) {
  const entrada = useRef<HTMLInputElement>(null);
  return (
    <FormSection titulo={t('detalle.pdf')} descripcion={t('detalle.pdfDescripcion')}>
      <input
        ref={entrada}
        type="file"
        accept="application/pdf"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const archivo = e.target.files?.[0];
          if (archivo) onSubir(archivo);
          e.target.value = '';
        }}
      />
      <div className={cn('flex flex-wrap items-center gap-2')}>
        <button
          type="button"
          className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}
          disabled={deshabilitado || subiendo}
          onClick={() => entrada.current?.click()}
        >
          <Upload aria-hidden="true" className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} />
          {subiendo ? t('detalle.subiendo') : pdfUrl ? t('detalle.cambiarPdf') : t('detalle.subirPdf')}
        </button>
        {pdfUrl && (
          <>
            <a href={pdfUrl} target="_blank" rel="noopener noreferrer" className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}>
              <ExternalLink aria-hidden="true" className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} />
              {t('detalle.verPdf')}
            </a>
            <button type="button" className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })} disabled={deshabilitado} onClick={onQuitar}>
              <X aria-hidden="true" className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} />
              {t('detalle.quitarPdf')}
            </button>
          </>
        )}
      </div>
    </FormSection>
  );
}
