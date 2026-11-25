'use client';

/**
 * «Transcripción» del detalle de una llamada (Figma 1363:20 listo, 1365:800947
 * transcribiendo, 1368:17 móvil plegada).
 *
 * Cada segmento lleva el avatar y el nombre de quien habla y su minuto; un clic
 * salta el audio a `start_ms` y el segmento que suena se resalta. En móvil se
 * ve solo el segmento actual (o el primero) y «Ver completa» abre la hoja.
 * Estados: transcribiendo (esqueleto), fallida («Reintentar»), sin
 * transcripción («Transcribir ahora») y sin voz detectada.
 */

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Mic, RefreshCw } from 'lucide-react';
import { Tarjeta } from '@/components/kit/Tarjeta';
import { SearchInput } from '@/components/kit/SearchInput';
import { AvatarIniciales } from '@/components/kit/AvatarIniciales';
import { AvisoTonal } from '@/components/kit/AvisoTonal';
import { HojaDetalle } from '@/components/kit/HojaDetalle';
import { clasesBoton } from '@/components/kit/botonClases';
import { useLocaleIntl } from '@/components/kit/useIdiomaKit';
import { cn } from '@/utils/Utils';
import type { CallIntelligenceState, TranscriptSegmentDto } from '@/components/crm/calls/useCallIntelligence';
import { formatoReloj } from './llamadaDetalleLogica';

interface Hablantes {
  agente: string | null;
  cliente: string | null;
}

interface TranscripcionLlamadaProps {
  estado: CallIntelligenceState;
  hablantes: Hablantes;
  actualMs: number | null;
  onIr: (ms: number) => void;
  onTranscribir: (forzar: boolean) => void;
  transcribiendo: boolean;
  /** Móvil: plegada (un segmento + «Ver completa»). */
  plegada?: boolean;
}

/** Idioma de la transcripción para la cabecera (`spa` → `es-CO` en la región de la org). */
function etiquetaIdioma(lang: string | null | undefined, locale: string): string {
  if (!lang) return '';
  const l = lang.toLowerCase();
  const base = l.startsWith('spa') || l.startsWith('es') ? 'es' : l.startsWith('eng') || l.startsWith('en') ? 'en' : l.startsWith('por') || l.startsWith('pt') ? 'pt' : l.startsWith('fr') ? 'fr' : l.slice(0, 2);
  const region = locale.split('-')[1];
  return region && base === locale.split('-')[0] ? `${base}-${region}` : base;
}

export function TranscripcionLlamada({ estado, hablantes, actualMs, onIr, onTranscribir, transcribiendo, plegada }: TranscripcionLlamadaProps) {
  const t = useTranslations('crm.llamadas.detalle.transcripcion');
  const locale = useLocaleIntl();
  const [q, setQ] = useState('');
  const [hojaAbierta, setHojaAbierta] = useState(false);
  const tr = estado.transcript;
  const segmentos = useMemo(() => tr?.segments ?? [], [tr]);
  const filtrados = useMemo(() => {
    const term = q.trim().toLowerCase();
    return term ? segmentos.filter((s) => s.text.toLowerCase().includes(term)) : segmentos;
  }, [segmentos, q]);
  const activo = useMemo(() => {
    if (actualMs === null) return null;
    return segmentos.find((s) => actualMs >= s.start_ms && actualMs < s.end_ms)?.id ?? null;
  }, [segmentos, actualMs]);

  const trabajando =
    !!tr && (tr.status === 'pending' || tr.status === 'processing' || !!tr.jobs?.some((j) => j.kind === 'transcribe' && (j.status === 'queued' || j.status === 'running')));
  const completa = !!tr && !trabajando && tr.status === 'completed';

  const nombreDe = (s: TranscriptSegmentDto) =>
    s.speaker_role === 'agent'
      ? hablantes.agente ?? t('agente')
      : s.speaker_role === 'customer'
        ? hablantes.cliente ?? t('cliente')
        : s.speaker_label.replace('speaker_', t('hablante') + ' ');

  const metadatos = completa
    ? [
        etiquetaIdioma(tr.language, locale),
        typeof tr.speaker_count === 'number' ? t('hablantes', { n: tr.speaker_count }) : null,
        typeof tr.confidence === 'number' ? t('confianza', { n: Math.round(tr.confidence * 100) }) : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : '';

  const lista = (segs: TranscriptSegmentDto[], conBusqueda: boolean) => (
    <ol className="flex flex-col gap-1" aria-label={t('titulo')}>
      {segs.map((s) => {
        const esActivo = s.id === activo;
        const nombre = nombreDe(s);
        return (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => onIr(s.start_ms)}
              aria-current={esActivo ? 'true' : undefined}
              aria-label={t('irA', { tiempo: formatoReloj(s.start_ms), quien: nombre })}
              className={cn(
                'flex w-full items-start gap-3 rounded-lg px-2 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                esActivo ? 'bg-brand-tint' : 'hover:bg-hover',
              )}
            >
              <AvatarIniciales nombre={nombre} className={cn('size-7 text-[11px]', s.speaker_role === 'agent' ? 'bg-brand-tint text-brand' : 'bg-subtle text-fg-secondary')} />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span className={cn('truncate text-xs font-semibold', s.speaker_role === 'agent' ? 'text-brand' : 'text-fg')}>{nombre}</span>
                  <span className="shrink-0 text-xs tabular-nums text-fg-secondary">{formatoReloj(s.start_ms)}</span>
                </span>
                <span className="block text-sm text-fg">{conBusqueda ? resaltar(s.text, q) : s.text}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );

  let cuerpo: React.ReactNode;
  if (estado.loading && !tr) {
    cuerpo = <Esqueleto filas={plegada ? 2 : 5} />;
  } else if (!tr) {
    cuerpo = (
      <div className="flex flex-col items-start gap-3">
        <p className="flex items-center gap-2 text-sm text-fg-secondary">
          <Mic aria-hidden="true" className="size-4" /> {t('sinTranscripcion')}
        </p>
        <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'sm' })} disabled={transcribiendo} onClick={() => onTranscribir(false)}>
          {transcribiendo ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <Mic aria-hidden="true" className="size-4" />}
          {t('transcribirAhora')}
        </button>
      </div>
    );
  } else if (trabajando) {
    cuerpo = (
      <div className="flex flex-col gap-4" role="status">
        <p className="text-[13px] leading-[18px] text-fg-secondary">{t('transcribiendo')}</p>
        <Esqueleto filas={plegada ? 2 : 5} />
      </div>
    );
  } else if (tr.status === 'failed') {
    cuerpo = (
      <AvisoTonal
        tono="peligro"
        rol="alert"
        titulo={t('fallida')}
        descripcion={tr.error_message ?? undefined}
        accion={tr.error_code === 'INSUFFICIENT_CREDITS' ? { etiqueta: t('comprarCreditos'), href: '/app/configuracion?modulo=crm&tab=creditos' } : { etiqueta: t('reintentar'), onClick: () => onTranscribir(true), cargando: transcribiendo }}
      />
    );
  } else if (segmentos.length === 0) {
    cuerpo = tr.full_text?.trim() ? (
      <p className="whitespace-pre-wrap text-sm text-fg">{tr.full_text}</p>
    ) : (
      <AvisoTonal tono="advertencia" compacto titulo={t('sinVoz')} />
    );
  } else if (plegada) {
    const actual = segmentos.find((s) => s.id === activo) ?? segmentos[0];
    cuerpo = (
      <div className="flex flex-col gap-2">
        {lista([actual], false)}
        {segmentos.length > 1 && (
          <button type="button" className={cn(clasesBoton({ variante: 'fantasma', tamano: 'sm' }), 'self-start')} onClick={() => setHojaAbierta(true)}>
            {t('verCompleta')}
          </button>
        )}
      </div>
    );
  } else {
    cuerpo = (
      <div className="flex flex-col gap-3">
        <SearchInput value={q} onChange={setQ} placeholder={t('buscar')} etiqueta={t('buscar')} atajo={false} tamano="md" />
        {q && <p className="text-xs text-fg-secondary">{t('coincidencias', { n: filtrados.length })}</p>}
        {lista(filtrados, true)}
      </div>
    );
  }

  return (
    <>
      <Tarjeta
        titulo={t('titulo')}
        accion={
          completa ? (
            <div className="flex items-center gap-1">
              {metadatos && <span className="hidden text-xs text-fg-secondary sm:inline">{metadatos}</span>}
              <button
                type="button"
                className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}
                disabled={transcribiendo}
                onClick={() => onTranscribir(true)}
                aria-label={t('volverATranscribir')}
                title={t('volverATranscribir')}
              >
                <RefreshCw aria-hidden="true" className={cn('size-4', transcribiendo && 'animate-spin')} />
              </button>
            </div>
          ) : undefined
        }
      >
        <div aria-live="polite">{cuerpo}</div>
      </Tarjeta>
      {plegada && (
        <HojaDetalle abierto={hojaAbierta} onAbiertoChange={setHojaAbierta} titulo={t('titulo')} subtitulo={metadatos || undefined}>
          <div className="flex flex-col gap-3">
            <SearchInput value={q} onChange={setQ} placeholder={t('buscar')} etiqueta={t('buscar')} atajo={false} tamano="md" />
            {lista(filtrados, true)}
          </div>
        </HojaDetalle>
      )}
    </>
  );
}

function Esqueleto({ filas }: { filas: number }) {
  return (
    <div className="flex flex-col gap-3" aria-hidden="true">
      {Array.from({ length: filas }).map((_, i) => (
        <div key={i} className="h-2.5 animate-pulse rounded-full bg-line motion-reduce:animate-none" />
      ))}
    </div>
  );
}

function resaltar(texto: string, q: string) {
  const term = q.trim();
  if (!term) return texto;
  const i = texto.toLowerCase().indexOf(term.toLowerCase());
  if (i < 0) return texto;
  return (
    <>
      {texto.slice(0, i)}
      <mark className="rounded bg-warning-subtle px-0.5 text-fg">{texto.slice(i, i + term.length)}</mark>
      {texto.slice(i + term.length)}
    </>
  );
}
