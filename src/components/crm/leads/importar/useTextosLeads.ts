'use client';

import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import type { MensajeImportacion, ResultadoFilaLead } from '@/lib/crm/importacionLeads/tipos';

/** Textos de mensajes, acciones y motivos del importador de leads (`leadsImportar.*`). */
export function useTextosLeads() {
  const t = useTranslations('leadsImportar');

  const mensaje = useCallback(
    (m: MensajeImportacion) => {
      const clave = `mensajes.${m.codigo}`;
      return t.has(clave) ? t(clave, m.params ?? {}) : m.codigo;
    },
    [t],
  );

  const accion = useCallback((r: ResultadoFilaLead, excluida = false) => (excluida ? t('accion.excluida') : t(`accion.${r.accion}`)), [t]);

  /** Motivo de omisión + cliente con el que coincide + errores y avisos, en una línea. */
  const detalle = useCallback(
    (r: ResultadoFilaLead) => {
      const partes: string[] = [];
      if (r.motivo) partes.push(t(`motivos.${r.motivo}`, { fila: r.duplicadaDe ?? '' }));
      if (r.cliente) partes.push(t('coincide', { nombre: r.cliente.nombre ?? '—', por: t(`por.${r.cliente.por}`) }));
      for (const m of [...r.errores, ...r.avisos]) partes.push(mensaje(m));
      return partes.join(' · ');
    },
    [t, mensaje],
  );

  return { t, mensaje, accion, detalle };
}
