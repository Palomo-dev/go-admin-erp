'use client';

/**
 * Textos de una novedad en la lista (Figma 20.12.1): la línea bajo el tipo
 * («Mié 11 · 2 h 20 min»), el detalle («Extra nocturna · pasa el tope diario»,
 * «Motivo: transporte», «Intermedio → Cierre») y el origen.
 */
import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useDias, useHora } from '../asistencia/comunAsistencia';
import { alertaTope, origenNovedad, textoDuracion, type FilaNovedad } from '../asistencia/asistenciaLogica';

export function useTextosNovedad(zona: string) {
  const t = useTranslations('hrmAsistencia');
  const dias = useDias();
  const hora = useHora(zona);
  return useMemo(
    () => ({
      cuando: (f: FilaNovedad): string => {
        const dia = dias.corto(f.fecha);
        if (f.tipo === 'ajuste_marca') return `${dia} · ${t(`marcas.${f.evento ?? 'check_in'}`).toLocaleLowerCase()} ${hora(f.hora)}`;
        if (f.tipo === 'cambio_turno' && f.cambio?.de && f.cambio?.a) return `${dia} · ${f.cambio.de} → ${f.cambio.a}`;
        if (f.tipo === 'ausencia') return `${dia} · ${f.minutos ? textoDuracion(f.minutos) : t('novedades.turnoCompleto')}`;
        return f.minutos ? `${dia} · ${textoDuracion(f.minutos)}` : dia;
      },
      detalle: (f: FilaNovedad): string => {
        const tope = alertaTope(f);
        if (f.tipo === 'horas_extra') {
          const cat = f.extra ? t(`categorias.${f.extra.categoria}`) : t('novedades.tipos.horas_extra');
          return tope ? `${cat} · ${t(`novedades.pasaTope.${tope.codigo}`)}` : cat;
        }
        if (f.tipo === 'cambio_turno') {
          if (f.contraparte_pendiente && f.cambio?.con) return t('novedades.esperando', { nombre: f.cambio.con });
          if (f.estado === 'aprobada' && f.cambio?.con) return t('novedades.cambio', { nombre: f.cambio.con });
          return f.solicito ? t('novedades.loPidio', { nombre: f.solicito }) : '—';
        }
        if (f.tipo === 'ausencia' && !f.justificacion) {
          if (f.estado === 'rechazada') return t('novedades.sinJustificar');
          return t('novedades.sinMarca');
        }
        if (f.justificacion) {
          if (f.tipo === 'ajuste_marca') return f.justificacion;
          return f.estado === 'aprobada'
            ? t('novedades.justificada', { motivo: f.justificacion })
            : t('novedades.motivo', { motivo: f.justificacion });
        }
        return t('novedades.sinMotivo');
      },
      origen: (f: FilaNovedad): string => t(`novedades.origenes.${origenNovedad(f)}`),
    }),
    [t, dias, hora]
  );
}
