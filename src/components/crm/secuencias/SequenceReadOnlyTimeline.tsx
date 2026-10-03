"use client";

import { Clock } from "lucide-react";
import {
  buildTimeline,
  summarizeStep,
} from "@/lib/services/crm/sequenceTimeline";
import { channelMeta } from "./channelMeta";
import { StepBranch } from "./StepBranch";
import type { SequenceStepView } from "./useSequences";
import { useSequenceText } from "./useSequenceText";

/** Muestra los pasos guardados; la edición de secuencias inscritas sigue bloqueada. */
export function SequenceReadOnlyTimeline({
  steps,
  templates,
}: {
  steps: SequenceStepView[];
  templates: { id: string; name: string }[];
}) {
  const tr = useSequenceText();
  const timeline = buildTimeline(steps, tr);
  return (
    <ol aria-label={tr("Pasos de la secuencia")} className="space-y-2">
      {timeline.map((entry) => {
        const step = steps[entry.index];
        const templateName =
          templates.find((template) => template.id === step.template_id)
            ?.name ?? null;
        const Icono = channelMeta(step.channel).icon;
        const waiting = step.channel === "wait";
        const waitLabel = summarizeStep(step, templateName, tr);
        return (
          <li key={step.id ?? entry.index}>
            {(waiting ||
              step.delay_days > 0 ||
              (step.delay_hours ?? 0) > 0) && (
              <div className="ml-6 flex min-h-8 items-center border-l-2 border-line-strong pl-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs text-fg-secondary">
                  <Clock className="size-3.5" strokeWidth={1.5} aria-hidden />
                  {waiting ? waitLabel : entry.delayLabel}
                </span>
              </div>
            )}
            {!waiting && (
              <div
                className={
                  entry.isBranch
                    ? "rounded-xl bg-purple-50 p-3 dark:bg-purple-950/30"
                    : "flex min-h-[68px] items-start gap-3 rounded-xl border border-line bg-surface p-4"
                }
              >
                {!entry.isBranch ? (
                  <>
                    <span
                      aria-hidden
                      className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-tint text-brand"
                    >
                      <Icono className="size-4" strokeWidth={1.5} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium leading-5 text-fg">
                        {entry.index + 1}. {tr(channelMeta(step.channel).label)}{" "}
                        · {summarizeStep(step, templateName, tr)}
                      </p>
                      <p className="mt-0.5 text-[13px] leading-[18px] text-fg-secondary">
                        {entry.dayLabel}
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="mb-2 flex items-center gap-2 text-sm font-medium text-fg">
                      <Icono
                        className="size-4 text-purple-600"
                        strokeWidth={1.5}
                        aria-hidden
                      />
                      {entry.index + 1}. {tr("Condición")}
                    </p>
                    <StepBranch
                      value={step.condition}
                      stepNumber={entry.index + 1}
                      isLast={entry.index === timeline.length - 1}
                      disabled
                      onChange={() => {}}
                    />
                  </>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
