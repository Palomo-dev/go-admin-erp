'use client';

/**
 * «Llamadas en vivo y recientes» del detalle de campaña de voz (Figma
 * 1809:144962). Primero las que están en curso (con cronómetro y «Abrir»),
 * luego el historial con su resultado: reunión, devolución, buzón con
 * reintento, «pidió no volver a llamar»… Cada fila abre la llamada en
 * /app/crm/llamadas (grabación, transcripción y análisis).
 */

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { ExternalLink, FileText, Phone } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tarjeta } from '@/components/kit/Tarjeta';
import { EmptyState } from '@/components/kit/EmptyState';
import { clasesBoton } from '@/components/kit/botonClases';
import { useLocaleIntl } from '@/components/kit/useIdiomaKit';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import type { FilaHoy, LlamadaCampanaVoz } from '@/lib/services/crm/voiceCampaignDetailService';
import { cronometro, etiquetaFila, tiempoRelativo } from './campanaVozDetalleLogica';

interface Props {
  filas: readonly LlamadaCampanaVoz[];
  detalle: Readonly<Record<string, FilaHoy>>;
  enMarcha: boolean;
  /** Reloj de la pantalla (ms): cronómetro y «hace N min». */
  ahora: number;
}

export function LlamadasCampanaVoz({ filas, detalle, enMarcha, ahora }: Props) {
  const t = useTranslations('crm.campanaVoz');
  return (
    <Tarjeta
      titulo={t('llamadas.titulo')}
      sinRelleno
      accion={
        <a href="/app/crm/llamadas" className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}>
          <ExternalLink aria-hidden="true" className="size-4" strokeWidth={1.5} />
          {t('llamadas.verTodas')}
        </a>
      }
    >
      {filas.length === 0 ? (
        <EmptyState variante="empty" compacto icono={Phone} titulo={t('llamadas.vacio.titulo')} descripcion={t(enMarcha ? 'llamadas.vacio.enMarcha' : 'llamadas.vacio.detenida')} />
      ) : (
        <ul className="divide-y divide-line" aria-label={t('llamadas.titulo')}>
          {filas.map((l) => (
            <FilaLlamada key={l.id} llamada={l} detalle={detalle[l.id] ?? null} ahora={ahora} />
          ))}
        </ul>
      )}
    </Tarjeta>
  );
}

function FilaLlamada({ llamada, detalle, ahora }: { llamada: LlamadaCampanaVoz; detalle: FilaHoy | null; ahora: number }) {
  const t = useTranslations('crm.campanaVoz');
  const locale = useLocaleIntl();
  const { formatDateTime, formatTime } = useFormatDate();
  const rtf = useMemo(() => new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'short' }), [locale]);
  const e = etiquetaFila(llamada, detalle);
  const relativo = tiempoRelativo(llamada.started_at, ahora);
  const cuando = e.clave === 'enCurso' || !relativo ? t('ahora') : rtf.format(relativo.valor, relativo.unidad);
  const texto =
    e.clave === 'enCurso'
      ? t('filas.enCurso', { tiempo: cronometro(llamada.started_at, ahora) })
      : e.clave === 'conversacion'
        ? e.detalle ?? ''
        : e.cuando
          ? t(`filas.${e.clave}Cuando`, { cuando: e.clave === 'buzon' || e.clave === 'noContesto' ? formatTime(e.cuando) : formatDateTime(e.cuando) })
          : t(`filas.${e.clave}`);
  const nombre = llamada.customer_name ?? t('filas.sinCliente');
  return (
    <li className="flex min-h-[53px] flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 sm:flex-nowrap">
      <Phone aria-hidden="true" className={e.clave === 'enCurso' ? 'size-3.5 shrink-0 text-brand' : 'size-3.5 shrink-0 text-fg-secondary'} strokeWidth={1.75} />
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg sm:w-40 sm:flex-none">{nombre}</span>
      <span className="order-last w-full min-w-0 sm:order-none sm:w-auto sm:flex-1">
        <Badge tono={e.tono} tamano="sm" className="max-w-full truncate">
          {texto}
        </Badge>
      </span>
      <span className="shrink-0 text-xs text-fg-secondary">{cuando}</span>
      <a
        href={`/app/crm/llamadas?call=${encodeURIComponent(llamada.id)}`}
        className={clasesBoton({ variante: e.clave === 'enCurso' ? 'secundario' : 'fantasma', tamano: 'sm' })}
        aria-label={t('filas.abrirAria', { nombre, cuando: llamada.started_at ? formatDateTime(llamada.started_at) : '' })}
      >
        {e.clave === 'enCurso' ? <ExternalLink aria-hidden="true" className="size-4" strokeWidth={1.5} /> : <FileText aria-hidden="true" className="size-4" strokeWidth={1.5} />}
        {e.clave === 'enCurso' ? t('filas.abrir') : <span className="sr-only">{t('filas.abrir')}</span>}
      </a>
    </li>
  );
}
