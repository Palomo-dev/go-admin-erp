'use client';

/**
 * Paso 4 «Datos del negocio» (Figma A/03d): logo, nombre en el sitio, WhatsApp
 * para pedidos y reservas, dirección y el horario de la sede principal en solo
 * lectura con «Editar en Organización › Sucursales». Lo que se cambia aquí va
 * SOLO al borrador del sitio (identidad y redes), nunca a la organización.
 *
 * El logo se elige con el MISMO selector de imágenes de la organización que
 * usa `CampoLogoFavicon` (Diseño y Configuración): no hay una segunda subida.
 * Aquí solo se pinta el logo (A/03d no pide favicon) y se guarda como
 * `identidad.logoUrl` del borrador.
 */
import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Clock, ExternalLink } from 'lucide-react';
import { FormField, clasesBoton } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { useLocaleIntl } from '@/components/kit/useIdiomaKit';
import { filasHorario, hora12 } from './logicaAsistente';
import { EncabezadoPaso } from './EncabezadoPaso';
import { useTextosResumen } from '../textos';
import { CLASE_TAMANO_ICONO, TRAZO_ICONO } from '../../ui/iconosSitio';
import { cn } from '@/utils/Utils';

// El selector se carga al abrirlo, como en `CampoLogoFavicon`.
const ImagePickerDialog = dynamic(() => import('@/components/common/ImagePickerDialog'), { ssr: false });

export const RUTA_SUCURSALES = '/app/organizacion/sucursales';

export interface DatosNegocioForm {
  nombre: string;
  whatsapp: string;
  logoUrl: string | null;
}

export interface PasoDatosNegocioProps {
  organizationId: number;
  datos: DatosNegocioForm;
  onCambiar: (datos: DatosNegocioForm) => void;
  errores: { nombre?: string | null; whatsapp?: string | null };
  sede: { nombre: string; direccion: string | null; horario: unknown } | null;
}

export function PasoDatosNegocio({ organizationId, datos, onCambiar, errores, sede }: PasoDatosNegocioProps) {
  const t = useTextosResumen();
  const locale = useLocaleIntl();
  const [selector, setSelector] = useState(false);
  const filas = filasHorario(sede?.horario);

  const dias = (desde: string, hasta: string) => {
    const a = t(`asistente.datos.dias.${desde}`);
    return desde === hasta ? a : t('asistente.datos.diasRango', { desde: a, hasta: t(`asistente.datos.dias.${hasta}`).toLowerCase() });
  };

  return (
    <div className="flex flex-col gap-6">
      <EncabezadoPaso paso="datos" titulo={t('asistente.datos.titulo')} descripcion={t('asistente.datos.descripcion', { sede: sede ? t('asistente.datos.descripcionSede', { sede: sede.nombre }) : '' })} />

      <div className="grid grid-cols-1 gap-5 md:grid-cols-[200px_1fr]">
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-fg">{t('asistente.datos.logo')}</span>
          <div className="flex flex-col items-center gap-3 rounded-xl border border-line bg-surface p-4">
            <span className="flex size-24 items-center justify-center overflow-hidden rounded-lg border border-line bg-subtle">
              {datos.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- logo del cliente en un bucket público, tamaño fijo
                <img src={datos.logoUrl} alt={t('asistente.datos.logo')} className="size-full object-contain" />
              ) : (
                <span className="text-xs text-fg-muted">{t('asistente.datos.sinLogo')}</span>
              )}
            </span>
            {datos.logoUrl && <span className="text-xs text-fg-secondary">{t('asistente.datos.logoOrigen')}</span>}
            <button type="button" onClick={() => setSelector(true)} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
              {t('asistente.datos.cambiarLogo')}
            </button>
            {selector && (
              <ImagePickerDialog
                open
                onOpenChange={(v) => !v && setSelector(false)}
                organizationId={organizationId || undefined}
                title={t('asistente.datos.logo')}
                onSelect={(url) => {
                  onCambiar({ ...datos, logoUrl: url });
                  setSelector(false);
                }}
              />
            )}
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <FormField etiqueta={t('asistente.datos.nombre')} obligatorio error={errores.nombre}>
            <Input value={datos.nombre} maxLength={200} onChange={(e) => onCambiar({ ...datos, nombre: e.target.value })} />
          </FormField>
          <FormField etiqueta={t('asistente.datos.whatsapp')} ayuda={t('asistente.datos.whatsappAyuda')} error={errores.whatsapp}>
            <Input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="+57 300 000 0000"
              value={datos.whatsapp}
              onChange={(e) => onCambiar({ ...datos, whatsapp: e.target.value })}
            />
          </FormField>
          <FormField etiqueta={t('asistente.datos.direccion')} ayuda={t('asistente.datos.direccionAyuda')}>
            <Input value={sede?.direccion ?? ''} readOnly className="bg-subtle" />
          </FormField>
        </div>
      </div>

      <section aria-labelledby="horario-sede" className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="horario-sede" className="flex items-center gap-2 text-sm font-medium text-fg">
            <Clock aria-hidden="true" className={cn(CLASE_TAMANO_ICONO.base, 'text-fg-secondary')} strokeWidth={TRAZO_ICONO} />
            {sede ? t('asistente.datos.horarioTitulo', { sede: sede.nombre }) : t('asistente.datos.horarioSinSede')}
          </h3>
          <a href={RUTA_SUCURSALES} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[13px] font-medium text-link hover:underline">
            <ExternalLink aria-hidden="true" className={CLASE_TAMANO_ICONO.meta} strokeWidth={TRAZO_ICONO} />
            {t('asistente.datos.editarSucursales')}
          </a>
        </div>
        {filas.length === 0 ? (
          <p className="text-[13px] text-fg-secondary">{t('asistente.datos.horarioVacio')}</p>
        ) : (
          <dl className="flex flex-col gap-1.5">
            {filas.map((f) => (
              <div key={f.desde} className="flex items-center justify-between gap-3 text-[13px]">
                <dt className="text-fg-secondary">{dias(f.desde, f.hasta)}</dt>
                <dd className="tabular-nums text-fg">
                  {f.abre && f.cierra ? `${hora12(f.abre, locale)} – ${hora12(f.cierra, locale)}` : t('asistente.datos.cerrado')}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </section>
    </div>
  );
}
