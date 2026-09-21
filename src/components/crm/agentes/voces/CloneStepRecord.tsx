"use client";

/**
 * Paso 2 de «Clonar mi voz»: el guion exacto en pantalla (60–90 s, español
 * neutro, fonemas variados), grabador con medidor de nivel y contador, o
 * archivos de audio como alternativa. Se admiten hasta 5 muestras (R6): más
 * muestras, mejor clon; la lista se ve aquí y cada una se puede quitar.
 */

import React, { useId } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Mic, Square, Trash2, Upload } from "lucide-react";
import { LevelMeter } from "@/components/shared/motion";
import { CLONE_SCRIPT_ES, MAX_CLONE_SAMPLES, estimateReadingSeconds } from "@/lib/services/crm/voiceCloneScript";
import type { VoiceRecorderState } from "../useVoiceRecorder";
import { describeRecordHint, describeSample, formatClock, sampleRemoveId, type CloneSample } from "./cloneSamples";

interface Props {
  recorder: VoiceRecorderState;
  samples: CloneSample[];
  totalSeconds: number;
  onFilesPicked: (files: File[]) => void;
  onRemove: (id: string) => void;
  error?: string | null;
  errorId?: string;
  /** Botón Grabar/Detener: el asistente lo enfoca cuando el paso no puede avanzar (R10). */
  recordButtonRef?: React.Ref<HTMLButtonElement>;
}

const TARGET_SECONDS = estimateReadingSeconds(CLONE_SCRIPT_ES);
const PARAGRAPHS = CLONE_SCRIPT_ES.split("\n\n");

export function CloneStepRecord({ recorder, samples, totalSeconds, onFilesPicked, onRemove, error, errorId = "clone-record-error", recordButtonRef }: Props) {
  const fileId = useId();
  const pct = Math.min(100, Math.round((recorder.elapsed / TARGET_SECONDS) * 100));
  const full = samples.length >= MAX_CLONE_SAMPLES;
  const hint = describeRecordHint({
    recording: recorder.recording,
    elapsed: recorder.elapsed,
    count: samples.length,
    totalSeconds,
    unknownDuration: samples.some((s) => s.durationUnknown === true),
  });

  return (
    <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
      <section aria-labelledby="clone-script-title" className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/60">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 id="clone-script-title" className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Lee este guion en voz alta
          </h3>
          <span className="text-xs text-gray-500 dark:text-gray-400">≈ {formatClock(TARGET_SECONDS)} min · habla natural, sin prisa</span>
        </div>
        <div className="mt-3 space-y-3 text-base leading-relaxed text-gray-800 dark:text-gray-100">
          {PARAGRAPHS.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      </section>

      <section aria-labelledby="clone-recorder-title" className="flex flex-col gap-4 rounded-lg border border-gray-200 p-4 dark:border-gray-700">
        <h3 id="clone-recorder-title" className="text-sm font-semibold text-gray-900 dark:text-gray-100">Grabadora</h3>

        <div className="flex items-center justify-between gap-3">
          <span
            className="font-mono text-3xl tabular-nums text-gray-900 dark:text-gray-100"
            role="timer"
            aria-live="off"
            aria-label={`Tiempo grabado ${formatClock(recorder.elapsed)}`}
          >
            {formatClock(recorder.elapsed)}
          </span>
          <LevelMeter level={recorder.recording ? recorder.level : 0} />
        </div>

        <div>
          <Progress value={pct} aria-label="Avance respecto a la duración recomendada" />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400" aria-live="polite">{hint}</p>
        </div>

        {/* Un solo botón que alterna Grabar/Detener: si fueran dos elementos, el foco caería al body al detener. */}
        <Button
          ref={recordButtonRef}
          type="button"
          variant={recorder.recording ? "destructive" : "default"}
          className={`w-full gap-2 ${recorder.recording ? "" : "bg-blue-600 text-white hover:bg-blue-700"}`}
          onClick={() => (recorder.recording ? recorder.stop() : void recorder.start())}
          disabled={!recorder.supported || (!recorder.recording && full)}
          aria-describedby={error && !recorder.recording ? errorId : undefined}
        >
          {recorder.recording ? <Square className="h-4 w-4" aria-hidden="true" /> : <Mic className="h-4 w-4" aria-hidden="true" />}
          {recorder.recording ? "Detener" : samples.length > 0 ? "Grabar otra muestra" : "Grabar"}
        </Button>

        {recorder.error && (
          <p role="alert" className="text-xs font-medium text-red-700 dark:text-red-300">{recorder.error}</p>
        )}
        {error && !recorder.recording && (
          <p id={errorId} role="alert" className="text-xs font-medium text-red-700 dark:text-red-300">{error}</p>
        )}

        {samples.length > 0 && (
          <ul className="space-y-1" aria-label="Muestras listas para enviar">
            {samples.map((s, i) => (
              <li key={s.id} className="flex items-center justify-between gap-2 rounded bg-gray-50 px-2 py-1 text-xs text-gray-700 dark:bg-gray-800 dark:text-gray-200">
                <span className="min-w-0 truncate">Muestra {i + 1} · {describeSample(s)}</span>
                <Button id={sampleRemoveId(s.id)} type="button" size="icon" variant="ghost" className="h-6 w-6 shrink-0 text-gray-500 hover:text-red-600 dark:text-gray-400" onClick={() => onRemove(s.id)} aria-label={`Quitar la muestra ${i + 1}`}>
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-auto border-t border-gray-200 pt-3 dark:border-gray-700">
          <Label htmlFor={fileId} className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
            <Upload className="h-3.5 w-3.5" aria-hidden="true" />
            ¿Sin micrófono? Sube hasta {MAX_CLONE_SAMPLES} archivos de audio (mp3, wav, m4a, ogg o webm; máximo 10 MB cada uno)
          </Label>
          <Input
            id={fileId}
            type="file"
            accept="audio/*"
            multiple
            className="mt-1.5 text-xs"
            disabled={recorder.recording || full}
            onChange={(e) => {
              onFilesPicked(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
        </div>
      </section>
    </div>
  );
}
