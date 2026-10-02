'use client';
import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Download } from 'lucide-react';
import { KbdButton } from '@/components/kit/KbdButton';
import { cn } from '@/utils/Utils';

function fmt(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
export function CallPlayerControls({ button, consent, currentMs, durationMs, rate, peaks, onSeek, onRate, onDownload, downloading, className }: {
  button: ReactNode; consent: ReactNode; currentMs: number; durationMs: number; rate: number; peaks: number[];
  onSeek: (ms: number) => void; onRate: () => void; onDownload: () => void; downloading: boolean; className?: string;
}) {
  const t = useTranslations('crm.llamadas.ficha');
  const progress = durationMs > 0 ? Math.min(100, currentMs / durationMs * 100) : 0;
  return <div className={cn('flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface py-2.5 pl-2.5 pr-3', className)}>
    {consent}
    {button}
    <span className="text-xs font-medium tabular-nums text-fg-secondary">{fmt(currentMs)}</span>
    <div className="relative flex h-9 min-w-0 flex-1 items-center">
      <div aria-hidden="true" className="flex h-9 w-full items-center gap-[3px] overflow-hidden">
        {peaks.length ? peaks.map((peak, index) => <span key={index} className={cn('min-w-[3px] flex-1 rounded-sm', index / peaks.length * 100 <= progress ? 'bg-brand-action' : 'bg-line-strong')} style={{ height: `${Math.max(6, Math.round(peak * 36))}px` }} />) :
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-line"><div className="h-full bg-brand-action" style={{ width: `${progress}%` }} /></div>}
      </div>
      <input type="range" min={0} max={Math.max(1, Math.round(durationMs))} value={Math.round(Math.min(currentMs, durationMs || currentMs))}
        aria-label={t('posicion')} disabled={!durationMs} onChange={(event) => onSeek(Number(event.target.value))}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0 focus-visible:opacity-100 focus-visible:accent-brand" />
    </div>
    <span className="text-xs font-medium tabular-nums text-fg-secondary">{durationMs ? fmt(durationMs) : '--:--'}</span>
    <button type="button" onClick={onRate} aria-label={`${t('velocidad')}: ${rate}x`} className="rounded-md bg-subtle px-2 py-1 text-xs font-semibold text-fg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">{rate}x</button>
    <KbdButton patron="button" tamano="sm" variante="fantasma" icono={Download} aria-label={t('descargarAudio')} onClick={onDownload} cargando={downloading} className="w-6 px-0" />
  </div>;
}
