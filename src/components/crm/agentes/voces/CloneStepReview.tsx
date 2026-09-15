"use client";

/**
 * Paso 3 de «Clonar mi voz»: escuchar cada muestra antes de enviarla, quitar
 * la que salió mal y volver a grabar si hace falta. Recibe el error del paso
 * (R4): si «Continuar» no puede avanzar, aquí se ve por qué.
 */

import React, { useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Mic, Trash2 } from "lucide-react";
import { ADD_MORE_ID, describeSample, formatClock, sampleRemoveId, type CloneSample } from "./cloneSamples";

interface Props {
  samples: CloneSample[];
  totalSeconds: number;
  onRemove: (id: string) => void;
  onAddMore: () => void;
  error?: string | null;
  errorId?: string;
}

function SamplePlayer({ sample, index, onRemove }: { sample: CloneSample; index: number; onRemove: (id: string) => void }) {
  const url = useMemo(() => URL.createObjectURL(sample.file), [sample.file]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  const label = `Muestra ${index + 1}`;
  return (
    <li className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
          {label} <span className="font-normal text-gray-500 dark:text-gray-400">· {describeSample(sample)}</span>
        </p>
        <Button id={sampleRemoveId(sample.id)} type="button" size="sm" variant="ghost" className="gap-1 text-gray-600 hover:text-red-600 dark:text-gray-300" onClick={() => onRemove(sample.id)} aria-label={`Quitar la ${label.toLowerCase()}`}>
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          Quitar
        </Button>
      </div>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption -- es una muestra de voz sin diálogo que subtitular */}
      <audio controls src={url} className="w-full" aria-label={`${label}, muestra grabada de tu voz`} preload="metadata" />
    </li>
  );
}

export function CloneStepReview({ samples, totalSeconds, onRemove, onAddMore, error, errorId = "clone-review-error" }: Props) {
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-900 dark:border-green-900 dark:bg-green-950 dark:text-green-100">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <div>
          <p className="font-medium">
            {samples.length === 1 ? "Una muestra lista" : `${samples.length} muestras listas`} · {formatClock(totalSeconds)} min en total
          </p>
          <p className="text-xs">
            Si se oye ruido de fondo, cortes o la lectura salió apresurada, quítala y graba de nuevo: la voz clonada
            copiará exactamente lo que oigas aquí. Con dos o tres muestras el clon sale mejor.
          </p>
        </div>
      </div>

      {error && (
        <p id={errorId} role="alert" className="text-xs font-medium text-red-700 dark:text-red-300">{error}</p>
      )}

      <ul className="space-y-3" aria-label="Muestras grabadas">
        {samples.map((s, i) => (
          <SamplePlayer key={s.id} sample={s} index={i} onRemove={onRemove} />
        ))}
      </ul>

      <div className="flex justify-center">
        <Button id={ADD_MORE_ID} type="button" variant="outline" className="gap-2" onClick={onAddMore}>
          <Mic className="h-4 w-4" aria-hidden="true" />
          Grabar otra muestra
        </Button>
      </div>
    </div>
  );
}
