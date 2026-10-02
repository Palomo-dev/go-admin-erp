'use client';
import { useSequenceText } from './useSequenceText';

/**
 * Mini-línea de tiempo de una tarjeta de secuencia (brief UX 6.3): los pasos
 * como iconos de canal en fila, unidos por una línea, con el día acumulado
 * debajo. Un solo texto accesible resume toda la fila.
 */

import { buildTimeline, channelLabel, type TimelineStepInput } from '@/lib/services/crm/sequenceTimeline';
import { ChannelIcon } from './channelMeta';

interface Props {
  steps: TimelineStepInput[];
  /** Cuántos iconos mostrar antes de plegar en «+N». */
  max?: number;
}

export function StepMiniTimeline({ steps, max = 7 }: Props) {
 const tr=useSequenceText();
  const timeline = buildTimeline(steps, tr);
  if (timeline.length === 0) {
    return (
      <p className="text-xs text-fg-muted dark:text-fg-secondary">{tr("Sin pasos todavía")}</p>
    );
  }
  const visible = timeline.slice(0, max);
  const hidden = timeline.length - visible.length;
  const summary = tr("{p0} paso{p1}: ",{p0:timeline.length,p1:timeline.length === 1 ? '' : 's'})
    + timeline.map((e) => tr("{p0} ({p1})",{p0:tr(channelLabel(e.channel)),p1:e.dayLabel.toLowerCase()})).join(', ');

  return (
    <div role="img" aria-label={summary} className="flex items-start">
      {visible.map((entry, i) => (
        <div key={entry.index} className="flex items-start">
          <div className="flex flex-col items-center gap-1">
            <ChannelIcon channel={entry.channel} size="sm" />
            <span className="text-xs leading-none text-fg-muted dark:text-fg-secondary">
              {entry.dayLabel.replace(tr("Día "), 'D')}
            </span>
          </div>
          {(i < visible.length - 1 || hidden > 0) && (
            <span
              className={`mt-3 h-px w-4 sm:w-6 ${entry.isBranch ? 'border-t border-dashed border-amber-400 dark:border-amber-600' : 'bg-gray-300 dark:bg-gray-600'}`}
              aria-hidden="true"
            />
          )}
        </div>
      ))}
      {hidden > 0 && (
        <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-gray-100 px-1.5 text-xs font-medium text-fg-secondary dark:bg-hover dark:text-fg">
          +{hidden}
        </span>
      )}
    </div>
  );
}
