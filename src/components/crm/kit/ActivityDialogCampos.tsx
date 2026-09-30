'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Info, Plus, X } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { Badge } from '@/components/ui/badge';
import { CalendarioMes } from '@/components/kit/CalendarioMes';
import { CampoFecha } from '@/components/kit/CampoFecha';
import { FormField } from '@/components/kit/FormField';
import { SegmentedControl } from '@/components/kit/SegmentedControl';
import { CampoFechaHora } from './CampoFechaHora';
import { CLASE_AREA, CLASE_AVISO_INFO, CLASE_CAMPO } from './camposCrm';
import { SelectCrm } from './SelectCrm';
import {
  DURACIONES_REUNION,
  horaFin,
  RESULTADOS_LLAMADA,
  type ValoresCorreo,
  type ValoresLlamada,
  type ValoresNota,
  type ValoresReunion,
  type ValoresWhatsApp,
} from './activityDialogLogica';

/**
 * Cuerpos de `ActivityDialog` (Figma 760:445129), uno por tipo. Solo
 * presentación: los valores, los errores (ya traducidos) y las opciones los
 * pasa `ActivityDialog`.
 */
type Errores<V> = Partial<Record<keyof V, string | null>>;
interface CamposProps<V> {
  v: V;
  cambiar: (parcial: Partial<V>) => void;
  errores: Errores<V>;
}

const casilla = 'size-4 shrink-0 rounded border-line-strong accent-brand-action';

export function CamposLlamada({ v, cambiar, errores }: CamposProps<ValoresLlamada>) {
  const t = useTranslations('crm.kit.actividad');
  return (
    <>
      <FormField etiqueta={t('llamada.direccion')}>
        {(c) => (
          <SegmentedControl
            aria-labelledby={c.idEtiqueta}
            opciones={(['outbound', 'inbound'] as const).map((d) => ({ valor: d, etiqueta: t(`llamada.direcciones.${d}`) }))}
            valor={v.direccion}
            onValorChange={(direccion) => cambiar({ direccion })}
          />
        )}
      </FormField>
      <FormField etiqueta={t('llamada.resultado')} obligatorio error={errores.resultado}>
        {(c) => (
          <div role="radiogroup" aria-labelledby={c.idEtiqueta} aria-describedby={c['aria-describedby']} className="flex flex-wrap gap-2">
            {RESULTADOS_LLAMADA.map((r) => {
              const activo = v.resultado === r;
              return (
                <button
                  key={r}
                  type="button"
                  role="radio"
                  aria-checked={activo}
                  onClick={() => cambiar({ resultado: r })}
                  className={cn(
                    'inline-flex h-8 items-center gap-1 rounded-full border px-3 text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                    activo ? 'border-line-brand bg-brand-tint text-brand-deep' : 'border-line-strong bg-surface text-fg-secondary hover:bg-hover',
                  )}
                >
                  {activo && <Check aria-hidden="true" className="size-3.5" strokeWidth={2} />}
                  {t(`llamada.resultados.${r}`)}
                </button>
              );
            })}
          </div>
        )}
      </FormField>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField etiqueta={t('llamada.duracion')} ayuda={t('llamada.duracionAyuda')} error={errores.duracion}>
          <input value={v.duracion} onChange={(e) => cambiar({ duracion: e.target.value })} className={CLASE_CAMPO} placeholder="4:12" />
        </FormField>
        <FormField etiqueta={t('fechaHora')} obligatorio error={errores.fechaHora}>
          <CampoFechaHora valor={v.fechaHora} onValorChange={(fechaHora) => cambiar({ fechaHora })} />
        </FormField>
      </div>
      <FormField etiqueta={t('llamada.notas')}>
        <textarea value={v.notas} onChange={(e) => cambiar({ notas: e.target.value })} className={CLASE_AREA} />
      </FormField>
      <label className="flex items-center gap-2 text-sm text-fg">
        <input type="checkbox" checked={v.crearSeguimiento} onChange={(e) => cambiar({ crearSeguimiento: e.target.checked })} className={casilla} />
        {t('llamada.seguimiento')}
      </label>
      {v.crearSeguimiento && (
        <FormField etiqueta={t('llamada.fechaSeguimiento')} obligatorio error={errores.fechaSeguimiento}>
          <CampoFecha valor={v.fechaSeguimiento} onValorChange={(fechaSeguimiento) => cambiar({ fechaSeguimiento })} />
        </FormField>
      )}
    </>
  );
}

export interface OpcionSimple {
  id: string;
  etiqueta: string;
}

const aOpcion = (o: OpcionSimple) => ({ valor: o.id, etiqueta: o.etiqueta });

export function CamposCorreo({ v, cambiar, errores, remitentes, plantillas }: CamposProps<ValoresCorreo> & { remitentes: readonly (OpcionSimple & { verificado?: boolean })[]; plantillas: readonly OpcionSimple[] }) {
  const t = useTranslations('crm.kit.actividad');
  const remitente = remitentes.find((r) => r.id === v.remitenteId);
  return (
    <>
      <FormField etiqueta={t('correo.de')} obligatorio error={errores.remitenteId} extra={remitente?.verificado ? <Badge tono="exito" apariencia="contorno" tamano="sm">{t('correo.verificado')}</Badge> : undefined}>
        <SelectCrm valor={v.remitenteId} onValorChange={(remitenteId) => cambiar({ remitenteId })} opcionVacia={t('elegir')} opciones={remitentes.map(aOpcion)} />
      </FormField>
      <FormField etiqueta={t('correo.para')} obligatorio error={errores.para}>
        <input type="email" value={v.para} onChange={(e) => cambiar({ para: e.target.value })} className={CLASE_CAMPO} />
      </FormField>
      {plantillas.length > 0 && (
        <FormField etiqueta={t('plantilla')}>
          <SelectCrm valor={v.plantillaId} onValorChange={(plantillaId) => cambiar({ plantillaId })} opcionVacia={t('sinPlantilla')} opciones={plantillas.map(aOpcion)} />
        </FormField>
      )}
      <FormField etiqueta={t('correo.asunto')} obligatorio error={errores.asunto}>
        <input value={v.asunto} onChange={(e) => cambiar({ asunto: e.target.value })} className={CLASE_CAMPO} />
      </FormField>
      <FormField etiqueta={t('mensaje')} obligatorio error={errores.mensaje}>
        <textarea value={v.mensaje} onChange={(e) => cambiar({ mensaje: e.target.value })} className={cn(CLASE_AREA, 'min-h-[120px]')} />
      </FormField>
    </>
  );
}

export function CamposWhatsApp({
  v,
  cambiar,
  errores,
  canales,
  plantillas,
  dentroVentana,
  diasSinRespuesta,
  nombreCliente,
  zonaNombre,
}: CamposProps<ValoresWhatsApp> & {
  canales: readonly OpcionSimple[];
  plantillas: readonly (OpcionSimple & { vistaPrevia?: string })[];
  dentroVentana: boolean;
  diasSinRespuesta: number | null;
  nombreCliente: string;
  zonaNombre: string;
}) {
  const t = useTranslations('crm.kit.actividad');
  const vista = plantillas.find((p) => p.id === v.plantillaId)?.vistaPrevia;
  return (
    <>
      <FormField etiqueta={t('whatsapp.canal')} obligatorio error={errores.canalId}>
        <SelectCrm valor={v.canalId} onValorChange={(canalId) => cambiar({ canalId })} opcionVacia={t('elegir')} opciones={canales.map(aOpcion)} />
      </FormField>
      {!dentroVentana && (
        <p className={CLASE_AVISO_INFO}>
          <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
          {diasSinRespuesta === null ? t('whatsapp.sinRespuesta', { nombre: nombreCliente }) : t('whatsapp.fueraVentana', { nombre: nombreCliente, dias: diasSinRespuesta })}
        </p>
      )}
      <FormField etiqueta={dentroVentana ? t('plantilla') : t('whatsapp.plantillaAprobada')} obligatorio={!dentroVentana} error={errores.plantillaId}>
        <SelectCrm valor={v.plantillaId} onValorChange={(plantillaId) => cambiar({ plantillaId })} opcionVacia={dentroVentana ? t('sinPlantilla') : t('elegir')} opciones={plantillas.map(aOpcion)} />
      </FormField>
      {vista ? (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-fg-secondary">{t('whatsapp.vistaPrevia')}</span>
          <p className="rounded-lg bg-success-subtle px-3 py-2 text-sm text-fg">{vista}</p>
        </div>
      ) : (
        dentroVentana && (
          <FormField etiqueta={t('mensaje')} obligatorio error={errores.texto}>
            <textarea value={v.texto} onChange={(e) => cambiar({ texto: e.target.value })} className={CLASE_AREA} />
          </FormField>
        )
      )}
      <label className="flex items-center gap-2 text-sm text-fg">
        <input type="checkbox" checked={v.programar} onChange={(e) => cambiar({ programar: e.target.checked })} className={casilla} />
        {t('whatsapp.programar', { zona: zonaNombre })}
      </label>
      {v.programar && (
        <FormField etiqueta={t('fechaHora')} obligatorio error={errores.fechaHora}>
          <CampoFechaHora valor={v.fechaHora} onValorChange={(fechaHora) => cambiar({ fechaHora })} />
        </FormField>
      )}
      <p className="text-xs text-fg-muted">{t('whatsapp.credito')}</p>
    </>
  );
}

export function CamposReunion({ v, cambiar, errores, hoy, zonaNombre, oportunidad }: CamposProps<ValoresReunion> & { hoy: string; zonaNombre: string; oportunidad?: string | null }) {
  const t = useTranslations('crm.kit.actividad');
  const [nuevo, setNuevo] = useState('');
  const agregar = () => {
    const n = nuevo.trim();
    if (n && !v.participantes.includes(n)) cambiar({ participantes: [...v.participantes, n] });
    setNuevo('');
  };
  return (
    <>
      <FormField etiqueta={t('reunion.titulo')} obligatorio error={errores.titulo}>
        <input value={v.titulo} onChange={(e) => cambiar({ titulo: e.target.value })} className={CLASE_CAMPO} />
      </FormField>
      <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
        <div className="flex flex-col gap-1">
          <CalendarioMes valor={v.dia || null} diaInicial={v.dia || hoy} hoy={hoy} min={hoy} onElegir={(dia) => cambiar({ dia })} className="rounded-lg border border-line p-2" />
          {errores.dia && <p role="alert" className="text-xs text-danger-text">{errores.dia}</p>}
        </div>
        <div className="flex flex-col gap-3">
          <FormField etiqueta={t('reunion.empieza')} obligatorio error={errores.hora}>
            <input type="time" value={v.hora} onChange={(e) => cambiar({ hora: e.target.value })} className={CLASE_CAMPO} />
          </FormField>
          <FormField etiqueta={t('reunion.termina')} ayuda={t('reunion.zona', { zona: zonaNombre })}>
            <SelectCrm
              valor={String(v.duracionMin)}
              onValorChange={(d) => cambiar({ duracionMin: Number(d) })}
              opciones={DURACIONES_REUNION.map((d) => ({ valor: String(d), etiqueta: t('reunion.fin', { hora: horaFin(v.hora, d), minutos: d }) }))}
            />
          </FormField>
        </div>
      </div>
      <FormField etiqueta={t('reunion.participantes')}>
        {(c) => (
          <div role="group" aria-labelledby={c.idEtiqueta} className="flex flex-wrap items-center gap-2">
            {v.participantes.map((p) => (
              <span key={p} className="inline-flex h-8 items-center gap-1 rounded-full bg-brand-tint px-3 text-[13px] text-brand-deep">
                {p}
                <button type="button" aria-label={t('reunion.quitar', { nombre: p })} onClick={() => cambiar({ participantes: v.participantes.filter((x) => x !== p) })} className="rounded-full hover:bg-brand-tint-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
                  <X aria-hidden="true" className="size-3.5" />
                </button>
              </span>
            ))}
            <span className="inline-flex items-center gap-1">
              <input aria-label={t('reunion.agregar')} value={nuevo} onChange={(e) => setNuevo(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); agregar(); } }} placeholder={t('reunion.agregar')} className={cn(CLASE_CAMPO, 'h-8 w-36')} />
              <button type="button" aria-label={t('reunion.agregar')} onClick={agregar} className="flex size-8 items-center justify-center rounded-lg text-fg-secondary hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
                <Plus aria-hidden="true" className="size-4" />
              </button>
            </span>
          </div>
        )}
      </FormField>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField etiqueta={t('reunion.lugar')}>
          <input value={v.lugar} onChange={(e) => cambiar({ lugar: e.target.value })} className={CLASE_CAMPO} />
        </FormField>
        {oportunidad && (
          <FormField etiqueta={t('reunion.oportunidad')}>
            <input value={oportunidad} readOnly disabled className={CLASE_CAMPO} />
          </FormField>
        )}
      </div>
    </>
  );
}

export function CamposNota({ v, cambiar, errores, relacionadas }: CamposProps<ValoresNota> & { relacionadas: readonly string[] }) {
  const t = useTranslations('crm.kit.actividad');
  return (
    <>
      <FormField etiqueta={t('nota.nota')} obligatorio error={errores.cuerpo}>
        <textarea value={v.cuerpo} onChange={(e) => cambiar({ cuerpo: e.target.value })} className={cn(CLASE_AREA, 'min-h-[112px]')} />
      </FormField>
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-fg-secondary">{t('nota.relacionada')}</span>
        <span className="flex flex-wrap gap-2">
          {relacionadas.map((r) => <Badge key={r} tono="marca" tamano="sm">{r}</Badge>)}
        </span>
      </div>
      <label className="flex items-center gap-2 text-sm text-fg">
        <input type="checkbox" role="switch" checked={v.fijar} onChange={(e) => cambiar({ fijar: e.target.checked })} className={casilla} />
        {t('nota.fijar')}
      </label>
      <p className="text-xs text-fg-muted">{t('nota.ayuda')}</p>
    </>
  );
}
