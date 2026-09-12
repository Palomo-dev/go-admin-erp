"use client";

/**
 * VoiceRecorderPanel — grabación de muestras de voz desde el micrófono para
 * clonar una voz en ElevenLabs (FASE 06).
 *
 * Se integra dentro de la sección «Clonar mi voz» de `VoicesPanel`. Ofrece dos
 * caminos: grabar aquí mismo (nuevo) o subir archivos (lo que ya existía).
 * Las muestras grabadas se acumulan junto a las subidas y se envían juntas.
 */

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/components/ui/use-toast";
import { Loader2, Mic, MicOff, Upload, Trash2, Square } from "lucide-react";
import { useVoiceRecorder, type RecordedSample } from "./useVoiceRecorder";

interface Props {
  ttsReady: boolean;
  providerBlocked: boolean;
  providerBlockedReason: string;
  onClone: (name: string, files: File[], consent: boolean) => Promise<void>;
}

export function VoiceRecorderPanel({
  ttsReady,
  providerBlocked,
  providerBlockedReason,
  onClone,
}: Props) {
  const recorder = useVoiceRecorder();
  const [cloneName, setCloneName] = useState("");
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [cloneConsent, setCloneConsent] = useState(false);
  const [cloning, setCloning] = useState(false);

  const allSamples: RecordedSample[] = recorder.samples;
  const totalFiles = [...allSamples.map((s) => s.file), ...uploadFiles];

  const cloneVoice = async () => {
    if (!cloneName.trim()) {
      toast({ title: "Ponle un nombre a la voz", variant: "destructive" });
      return;
    }
    if (totalFiles.length === 0) {
      toast({ title: "Graba o sube al menos una muestra de audio", variant: "destructive" });
      return;
    }
    if (!cloneConsent) {
      toast({
        title: "Falta el consentimiento",
        description:
          "Solo se puede clonar la voz propia o la de alguien del equipo que haya dado su consentimiento por escrito.",
        variant: "destructive",
      });
      return;
    }
    setCloning(true);
    try {
      await onClone(cloneName.trim(), totalFiles, cloneConsent);
      setCloneName("");
      setUploadFiles([]);
      setCloneConsent(false);
      recorder.clear();
    } finally {
      setCloning(false);
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadFiles(Array.from(e.target.files ?? []).slice(0, 5));
  };

  return (
    <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
      <h3 className="mb-1 flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-gray-100">
        <Mic className="h-4 w-4" aria-hidden="true" />
        Clonar mi voz
      </h3>
      <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
        Graba una muestra aquí mismo o sube entre 1 y 5 archivos de audio (mp3, wav, m4a, ogg o webm;
        máximo 10 MB cada uno). La voz se crea en ElevenLabs y queda en este catálogo, lista para
        asignársela a un agente.
      </p>

      {/* Grabadora */}
      <div className="mb-3 rounded-md border border-gray-200 p-3 dark:border-gray-700">
        <div className="flex flex-wrap items-center gap-2">
          {!recorder.recording ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void recorder.start()}
              disabled={!recorder.supported || providerBlocked}
              title={!recorder.supported ? "Tu navegador no soporta grabación de audio." : providerBlocked ? providerBlockedReason : undefined}
            >
              <Mic className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Grabar muestra
            </Button>
          ) : (
            <Button type="button" size="sm" variant="destructive" onClick={recorder.stop}>
              <Square className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Detener ({recorder.elapsed}s)
            </Button>
          )}
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {recorder.recording
              ? "Grabando… habla con naturalidad."
              : recorder.supported
                ? "Pulsa para grabar una muestra de tu voz."
                : "Tu navegador no soporta grabación. Sube un archivo abajo."}
          </span>
        </div>
        {recorder.error && (
          <p className="mt-2 text-xs text-red-700 dark:text-red-400" role="alert">
            {recorder.error}
          </p>
        )}
        {allSamples.length > 0 && (
          <ul className="mt-2 space-y-1">
            {allSamples.map((s, i) => (
              <li key={i} className="flex items-center justify-between rounded bg-gray-50 px-2 py-1 text-xs dark:bg-gray-800">
                <span>
                  Muestra {i + 1} · {s.durationSeconds.toFixed(1)}s · {s.file.name}
                </span>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6"
                  aria-label={`Eliminar la muestra grabada ${i + 1}`}
                  onClick={() => recorder.removeSample(i)}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Subida de archivos */}
      <div className="mb-3">
        <Label htmlFor="cv-files" className="text-xs">
          O sube archivos de audio
        </Label>
        <Input
          id="cv-files"
          type="file"
          accept="audio/*"
          multiple
          onChange={onFileChange}
        />
        {uploadFiles.length > 0 && (
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {uploadFiles.length} archivo{uploadFiles.length === 1 ? "" : "s"} seleccionado
            {uploadFiles.length === 1 ? "" : "s"}
          </p>
        )}
      </div>

      {/* Nombre */}
      <div className="mb-3">
        <Label htmlFor="cv-name">Nombre de la voz</Label>
        <Input
          id="cv-name"
          value={cloneName}
          onChange={(e) => setCloneName(e.target.value)}
          placeholder="Mi voz comercial"
        />
      </div>

      {/* Consentimiento */}
      <div className="mb-3 flex items-start gap-2 rounded border border-amber-200 bg-amber-50 p-2 dark:border-amber-900 dark:bg-amber-950">
        <Checkbox
          id="cv-consent"
          checked={cloneConsent}
          onCheckedChange={(v) => setCloneConsent(v === true)}
        />
        <Label
          htmlFor="cv-consent"
          className="cursor-pointer text-xs font-normal text-amber-900 dark:text-amber-100"
        >
          Confirmo que esta es mi voz, o la de una persona del equipo que dio su consentimiento por
          escrito. No es la voz de un tercero (Ley 1581 de 2012 y política de ElevenLabs).
        </Label>
      </div>

      <Button
        onClick={cloneVoice}
        disabled={cloning || providerBlocked}
        title={providerBlocked ? providerBlockedReason : undefined}
      >
        {cloning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
        Clonar voz
      </Button>
      {providerBlocked && (
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
          Desactivado: {providerBlockedReason}
        </p>
      )}
    </div>
  );
}
