'use client';

import { useTranslations } from 'next-intl';
import { TimelineEntry } from '@/components/crm/kit/TimelineEntry';
import type { EntradaLinea } from '@/components/crm/kit/timelineEntryLogica';
import { claveTitulo, estadoEntrada, metaEntrada, partesDuracion, textoPlano, tipoEntradaFeed, type EntradaFeed } from './actividadesPantallaLogica';

/**
 * Una entrada de la línea de tiempo de la organización con el `TimelineEntry`
 * del kit: título por tipo («Llamada saliente · 4 min 12 s»), detalle,
 * «Hoy 09:40 · Carlos Ruiz · Ana Gómez · Uniformes 2026» y badge de estado.
 * El menú «⋯» (Editar, Duplicar, Eliminar) solo si el servidor dijo
 * `editable` (lo propio, o todo con `crm.activities.edit_any`).
 */
export interface EntradaActividadProps {
  entrada: EntradaFeed;
  onAbrir?: (e: EntradaFeed) => void;
  onEditar?: (e: EntradaFeed) => void;
  onDuplicar?: (e: EntradaFeed) => void;
  onEliminar?: (e: EntradaFeed) => void;
  ahora?: Date;
}

export function useEntradaLinea() {
  const t = useTranslations('crm.pantallaActividades.entrada');
  return (e: EntradaFeed): EntradaLinea => {
    const clave = claveTitulo(e);
    const dur = partesDuracion(e.duration_seconds);
    const texto = textoPlano(e.texto);
    const base = clave === 'sistema' ? texto ?? t('titulo.sistema') : clave === 'tarea' ? t('titulo.tarea', { titulo: texto ?? '' }) : t(`titulo.${clave}`);
    const titulo = dur ? `${base} · ${t('duracion', dur)}` : base;
    const detalle = clave === 'sistema' || clave === 'tarea' ? (e.tarea?.prioridad ? t('prioridad', { prioridad: t(`prioridades.${e.tarea.prioridad}`) }) : null) : texto;
    const estado = estadoEntrada(e);
    return {
      id: e.id,
      tipo: tipoEntradaFeed(e),
      titulo,
      detalle,
      ocurrioEn: e.ocurrio_en,
      autor: metaEntrada(e, t('sistema')) || null,
      estado: estado ? { etiqueta: t(`estado.${estado.clave}`), tono: estado.tono } : null,
      editable: e.editable,
    };
  };
}

export function EntradaActividad({ entrada, onAbrir, onEditar, onDuplicar, onEliminar, ahora }: EntradaActividadProps) {
  const aLinea = useEntradaLinea();
  const destino = entrada.oportunidad ?? entrada.cliente;
  return (
    <TimelineEntry
      entrada={aLinea(entrada)}
      ahora={ahora}
      onAbrir={onAbrir && destino ? () => onAbrir(entrada) : undefined}
      onEditar={onEditar ? () => onEditar(entrada) : undefined}
      onDuplicar={onDuplicar ? () => onDuplicar(entrada) : undefined}
      onEliminar={onEliminar ? () => onEliminar(entrada) : undefined}
    />
  );
}
