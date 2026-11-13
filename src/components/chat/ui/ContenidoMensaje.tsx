'use client';

import * as React from 'react';
import { Download, FileText, Pause, Play } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/utils/Utils';
import { duracionGrabacion } from './composerLogica';

/** Lo que hace falta de una fila de `messages` para pintarla. */
export interface MensajeContenido {
  content: string;
  content_type?: string | null;
  metadata?: {
    file_name?: string;
    file_size?: number;
    products?: Array<{ id: number | string; name: string; price: number; imageUrl?: string | null }>;
  } | null;
}

/** Partes de un texto: imágenes `[IMG:url]`, **negrilla** y saltos de línea. */
export function partesTexto(texto: string): Array<{ tipo: 'img'; url: string } | { tipo: 'texto'; negrilla: boolean; valor: string }> {
  const out: Array<{ tipo: 'img'; url: string } | { tipo: 'texto'; negrilla: boolean; valor: string }> = [];
  for (const parte of texto.split(/(\[IMG:[^\]]+\])/g)) {
    if (!parte) continue;
    const img = /^\[IMG:([^\]]+)\]$/.exec(parte);
    if (img) {
      if (/^https?:\/\//i.test(img[1])) out.push({ tipo: 'img', url: img[1] });
      continue;
    }
    for (const seg of parte.split(/(\*\*[^*]+\*\*)/g)) {
      if (!seg) continue;
      const b = /^\*\*([^*]+)\*\*$/.exec(seg);
      out.push({ tipo: 'texto', negrilla: !!b, valor: b ? b[1] : seg });
    }
  }
  return out;
}

function Audio({ src, claro }: { src: string; claro: boolean }) {
  const t = useTranslations('chatUi.burbuja');
  const ref = React.useRef<HTMLAudioElement>(null);
  const [sonando, setSonando] = React.useState(false);
  const [avance, setAvance] = React.useState(0);
  const [duracion, setDuracion] = React.useState(0);
  const alternar = () => {
    const a = ref.current;
    if (!a) return;
    if (sonando) a.pause();
    else void a.play();
    setSonando(!sonando);
  };
  return (
    <div className="flex min-w-[180px] items-center gap-3">
      <audio
        ref={ref}
        src={src}
        preload="metadata"
        onTimeUpdate={() => ref.current && setAvance((ref.current.currentTime / (ref.current.duration || 1)) * 100)}
        onLoadedMetadata={() => ref.current && setDuracion(ref.current.duration)}
        onEnded={() => {
          setSonando(false);
          setAvance(0);
        }}
      />
      <button
        type="button"
        onClick={alternar}
        aria-label={sonando ? t('pausar') : t('reproducir')}
        className={cn('flex size-9 shrink-0 items-center justify-center rounded-full', claro ? 'bg-white/20 text-fg-on-brand' : 'bg-brand text-fg-on-brand')}
      >
        {sonando ? <Pause aria-hidden="true" className="size-4" /> : <Play aria-hidden="true" className="ml-0.5 size-4" />}
      </button>
      <div className="flex-1">
        <div className={cn('h-1 overflow-hidden rounded-full', claro ? 'bg-white/30' : 'bg-line')}>
          <div className={cn('h-full', claro ? 'bg-white' : 'bg-brand')} style={{ width: `${avance}%` }} />
        </div>
        <p className="mt-1 text-xs opacity-80">{duracionGrabacion(duracion || 0)}</p>
      </div>
    </div>
  );
}

/**
 * Contenido de un mensaje: texto (con `[IMG:url]` y **negrilla** que envía la
 * IA), imagen, audio, archivo y tarjetas de producto. Va dentro de `Burbuja`.
 * `claro` = el texto va sobre fondo Azul GO (burbuja del agente).
 */
export function ContenidoMensaje({ mensaje, claro = false }: { mensaje: MensajeContenido; claro?: boolean }) {
  const t = useTranslations('chatUi.burbuja');
  const tipo = mensaje.content_type ?? 'text';
  const meta = mensaje.metadata ?? {};

  let cuerpo: React.ReactNode;
  if (tipo === 'image') {
    cuerpo = (
      <a href={mensaje.content} target="_blank" rel="noopener noreferrer" className="block max-w-[220px]">
        {/* eslint-disable-next-line @next/next/no-img-element -- URL de Storage arbitraria */}
        <img src={mensaje.content} alt={meta.file_name || t('imagen')} className="h-auto max-w-full rounded-lg" loading="lazy" />
      </a>
    );
  } else if (tipo === 'audio') {
    cuerpo = <Audio src={mensaje.content} claro={claro} />;
  } else if (tipo === 'file' || tipo === 'document' || tipo === 'video') {
    cuerpo = (
      <a href={mensaje.content} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 hover:opacity-90">
        <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', claro ? 'bg-white/20' : 'bg-subtle text-fg-secondary')}>
          <FileText aria-hidden="true" className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{meta.file_name || t('archivo')}</span>
          {meta.file_size ? <span className="block text-xs opacity-80">{(meta.file_size / 1024).toFixed(1)} KB</span> : null}
        </span>
        <Download aria-label={t('descargar')} className="size-4 shrink-0 opacity-80" />
      </a>
    );
  } else {
    cuerpo = (
      <span className="whitespace-pre-wrap">
        {partesTexto(mensaje.content ?? '').map((p, i) =>
          p.tipo === 'img' ? (
            // eslint-disable-next-line @next/next/no-img-element -- imagen de producto enviada por la IA
            <img key={i} src={p.url} alt={t('imagen')} className="my-2 block h-auto max-w-[180px] rounded-lg" loading="lazy" />
          ) : p.negrilla ? (
            <strong key={i}>{p.valor}</strong>
          ) : (
            <React.Fragment key={i}>{p.valor}</React.Fragment>
          ),
        )}
      </span>
    );
  }

  const productos = meta.products ?? [];
  return (
    <>
      {cuerpo}
      {productos.length > 0 && (
        <span className="mt-2 block space-y-2">
          {productos.map((p) => (
            <span key={p.id} className={cn('flex items-center gap-2 rounded-lg border p-2', claro ? 'border-white/30 bg-white/10' : 'border-line bg-surface')}>
              {p.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- imagen de producto del catálogo
                <img src={p.imageUrl} alt="" className="size-10 shrink-0 rounded-md object-cover" loading="lazy" />
              ) : null}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium">{p.name}</span>
                <span className="block text-xs font-semibold">${Number(p.price ?? 0).toLocaleString('es-CO')}</span>
              </span>
            </span>
          ))}
        </span>
      )}
    </>
  );
}
