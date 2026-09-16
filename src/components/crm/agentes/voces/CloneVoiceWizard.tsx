"use client";

/**
 * «Clonar mi voz» en cuatro pasos (brief UX 6.1): (1) consentimiento explícito,
 * (2) guion en pantalla + grabadora, (3) escuchar y regrabar, (4) nombrar y crear.
 * Llama a `POST /api/crm/voices/clone` (multipart). La validación de cada paso es
 * `validateCloneStep`, pura y probada; los errores del proveedor llegan ya en
 * lenguaje humano desde la ruta.
 *
 * Ronda 2: no roba el foco al montar (R1); el error del paso llega a «Escuchar»
 * y la duración se valida antes de saltar (R4); hasta 5 muestras, grabadas o
 * subidas, con lista y quitar (R6); foco al primer error en todos los pasos (R10);
 * si el plan del proveedor no permite clonar, se avisa antes de empezar.
 * Ronda 3: R1 resiste StrictMode (compara con el paso anterior) y el foco tras
 * «Quitar» va por `flushSync`, no por rAF.
 * Ronda 4: si el plan del proveedor no permite clonar, «Crear mi voz» queda
 * deshabilitado y explicado (antes dejaba hacer los cuatro pasos para un fallo seguro).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "@/components/ui/use-toast";
import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { FadeIn } from "@/components/shared/motion/primitives";
import { fetchJson } from "@/lib/utils/fetchJson";
import { describeError } from "@/lib/utils/errorMessage";
import { MAX_CLONE_SAMPLES, MIN_SAMPLE_SECONDS, summarizeSamples, validateCloneStep } from "@/lib/services/crm/voiceCloneScript";
import { useVoiceRecorder } from "../useVoiceRecorder";
import type { VoiceAccountInfo } from "../useVoiceCatalog";
import { CloneStepConsent } from "./CloneStepConsent";
import { CloneStepRecord } from "./CloneStepRecord";
import { CloneStepReview } from "./CloneStepReview";
import { CloneStepName } from "./CloneStepName";
import { ADD_MORE_ID, sampleRemoveId, type CloneSample } from "./cloneSamples";
import { CLONE_STEP_TITLES as STEP_TITLES, CloneStepIndicator, type CloneStep as Step } from "./CloneStepIndicator";

interface Props {
  onCreated: () => void;
  /** Plan del proveedor según el servidor (`null` si no se sabe). */
  account: VoiceAccountInfo | null;
}

/** Lee la duración de un archivo subido; `null` si el navegador no la conoce. */
function readAudioDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = document.createElement("audio");
    audio.preload = "metadata";
    const done = (value: number | null) => { URL.revokeObjectURL(url); resolve(value); };
    audio.onloadedmetadata = () => done(Number.isFinite(audio.duration) ? audio.duration : null);
    audio.onerror = () => done(null);
    audio.src = url;
  });
}

let sampleSeq = 0;

export function CloneVoiceWizard({ onCreated, account }: Props) {
  const recorder = useVoiceRecorder();
  const [step, setStep] = useState<Step>(1);
  const [consent, setConsent] = useState(false);
  const [consentAt, setConsentAt] = useState<string | null>(null);
  const [samples, setSamples] = useState<CloneSample[]>([]);
  const [name, setName] = useState("");
  const [makeDefault, setMakeDefault] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ name: string; requiresVerification: boolean } | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const consentRef = useRef<HTMLButtonElement | null>(null);
  const recordRef = useRef<HTMLButtonElement | null>(null);
  const nameRef = useRef<HTMLInputElement | null>(null);
  const seenRecordings = useRef(0);
  const prevStep = useRef<Step>(step);
  // Ronda 4: con el plan sin clonación no se llama al proveedor (fallaría seguro).
  const cloneBlocked = account !== null && !account.can_clone;

  // Cada grabación terminada entra en la lista (hasta el máximo); no se salta de paso solo.
  useEffect(() => {
    if (recorder.samples.length > seenRecordings.current) {
      const fresh = recorder.samples.slice(seenRecordings.current);
      setSamples((prev) =>
        [...prev, ...fresh.map((r) => ({ id: `rec-${++sampleSeq}`, file: r.file, durationSeconds: r.durationSeconds, source: "recording" as const }))].slice(0, MAX_CLONE_SAMPLES)
      );
      setStepError(null);
    }
    seenRecordings.current = recorder.samples.length;
  }, [recorder.samples]);

  // R1: al cambiar de paso se anuncia el título; en el primer render NO (el foco
  // sigue en la pestaña «Clonar mi voz» y el usuario de teclado no queda atrapado).
  // Se compara con el paso anterior, no con un guard de montaje: con
  // `reactStrictMode` el efecto corre dos veces al montar y el guard robaba el foco.
  useEffect(() => {
    if (prevStep.current !== step) {
      prevStep.current = step;
      headingRef.current?.focus();
    }
  }, [step]);

  const summary = useMemo(
    () => summarizeSamples(samples.map((s) => ({ durationSeconds: s.durationUnknown ? MIN_SAMPLE_SECONDS : s.durationSeconds, bytes: s.file.size }))),
    [samples]
  );
  const totalSeconds = samples.reduce((acc, s) => acc + (s.durationUnknown ? 0 : s.durationSeconds), 0);
  const flowState = useMemo(() => ({ consent, sample: summary, name }), [consent, summary, name]);

  const focusFirstError = useCallback((at: Step) => {
    if (at === 1) consentRef.current?.focus();
    else if (at === 2) recordRef.current?.focus();
    else if (at === 4) nameRef.current?.focus();
  }, []);

  const next = useCallback(() => {
    const errors = validateCloneStep(step, flowState);
    if (errors.length > 0) {
      setStepError(errors[0]);
      focusFirstError(step);
      return;
    }
    setStepError(null);
    setStep((s) => (s < 4 ? ((s + 1) as Step) : s));
  }, [step, flowState, focusFirstError]);

  const back = useCallback(() => {
    setStepError(null);
    setStep((s) => (s > 1 ? ((s - 1) as Step) : s));
  }, []);

  const onConsentChange = (value: boolean) => {
    setConsent(value);
    setConsentAt(value ? new Date().toISOString() : null);
    if (value) setStepError(null);
  };

  const onFilesPicked = async (files: File[]) => {
    if (files.length === 0) return;
    const room = MAX_CLONE_SAMPLES - samples.length;
    if (files.length > room) setStepError(`Como máximo ${MAX_CLONE_SAMPLES} muestras: se tomaron las ${room} primeras.`);
    else setStepError(null);
    const picked: CloneSample[] = [];
    for (const file of files.slice(0, Math.max(0, room))) {
      const duration = await readAudioDuration(file);
      picked.push({ id: `file-${++sampleSeq}`, file, durationSeconds: duration ?? 0, durationUnknown: duration === null, source: "file" });
    }
    setSamples((prev) => [...prev, ...picked].slice(0, MAX_CLONE_SAMPLES));
  };

  const removeSample = (id: string) => {
    const idx = samples.findIndex((s) => s.id === id);
    const nextList = samples.filter((s) => s.id !== id);
    // El botón «Quitar» desaparece: se pinta el nuevo estado de forma síncrona y el
    // foco pasa al de la muestra vecina o al botón de grabar. Sin rAF: con la
    // ventana oculta no dispara y el foco caía al body.
    flushSync(() => {
      setSamples(nextList);
      setStepError(null);
      // Sin muestras no hay nada que escuchar: se vuelve a la grabadora.
      if (nextList.length === 0 && step === 3) setStep(2);
    });
    const neighbour = nextList[idx] ?? nextList[idx - 1];
    const target = (neighbour && document.getElementById(sampleRemoveId(neighbour.id))) || (step === 3 && nextList.length > 0 ? document.getElementById(ADD_MORE_ID) : recordRef.current);
    target?.focus();
  };

  const reset = () => {
    setDone(null); setStep(1); setConsent(false); setConsentAt(null); setSamples([]); setName(""); setStepError(null); recorder.clear();
  };

  const submit = async () => {
    if (cloneBlocked) return;
    const errors = validateCloneStep(4, flowState);
    if (errors.length > 0 || samples.length === 0) {
      setStepError(errors[0] ?? "Falta la muestra de audio.");
      nameRef.current?.focus();
      return;
    }
    setSubmitting(true);
    setServerError(null);
    try {
      const body = new FormData();
      body.append("name", name.trim());
      body.append("consent", "true");
      if (consentAt) body.append("consent_at", consentAt);
      body.append("duration_seconds", String(totalSeconds));
      for (const s of samples) body.append("samples", s.file, s.file.name);
      if (makeDefault) body.append("is_default", "true");
      const json = await fetchJson<{ success?: boolean; error?: string; data?: { requires_verification?: boolean } }>(
        "/api/crm/voices/clone",
        { method: "POST", body, timeoutMs: 120_000 }
      );
      if (!json?.success) throw new Error(json?.error || "La respuesta no indicó éxito");
      setDone({ name: name.trim(), requiresVerification: json.data?.requires_verification === true });
      toast({ title: `Voz «${name.trim()}» creada` });
      onCreated();
    } catch (err) {
      setServerError(describeError(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <FadeIn className="mx-auto max-w-xl rounded-xl border border-green-200 bg-green-50 p-8 text-center dark:border-green-900 dark:bg-green-950">
        <CheckCircle2 className="mx-auto h-10 w-10 text-green-600 dark:text-green-300" aria-hidden="true" />
        <h2 ref={headingRef} tabIndex={-1} className="mt-3 text-lg font-semibold text-green-900 outline-none dark:text-green-100">
          «{done.name}» ya está en tus voces
        </h2>
        <p className="mt-1 text-sm text-green-900/80 dark:text-green-100/80">
          {done.requiresVerification
            ? "ElevenLabs pide verificar la voz antes de usarla en llamadas."
            : "Escúchala en Mis voces, márcala por defecto o asígnala a un agente."}
        </p>
        <Button className="mt-5 bg-blue-600 text-white hover:bg-blue-700" onClick={reset}>Clonar otra voz</Button>
      </FadeIn>
    );
  }

  return (
    <div className="space-y-5">
      {account && !account.can_clone && (
        <Alert role="status" className="border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          <AlertTitle>El plan actual de ElevenLabs ({account.tier}) no permite clonar voces</AlertTitle>
          <AlertDescription>
            Puedes grabar y escuchar la muestra, pero «Crear mi voz» quedará deshabilitado: hace falta al menos el plan
            Starter en la cuenta cuya clave está configurada.
          </AlertDescription>
        </Alert>
      )}

      <CloneStepIndicator step={step} />

      <h2 ref={headingRef} tabIndex={-1} className="flex items-center gap-2 text-base font-semibold text-gray-900 outline-none dark:text-gray-100">
        <Sparkles className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
        Paso {step} de 4 · {STEP_TITLES[step]}
      </h2>

      {serverError && (
        <Alert variant="destructive" role="alert">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          <AlertTitle>No se pudo crear la voz</AlertTitle>
          <AlertDescription>{serverError} Puedes intentarlo de nuevo; las muestras siguen aquí.</AlertDescription>
        </Alert>
      )}

      {/* Solo animación de entrada: el paso anterior desaparece al instante y el nuevo aparece. */}
      <FadeIn key={step} transition={{ duration: 0.18 }}>
        {step === 1 && <CloneStepConsent consent={consent} onConsentChange={onConsentChange} error={stepError} checkboxRef={consentRef} />}
        {step === 2 && (
          <CloneStepRecord recorder={recorder} samples={samples} totalSeconds={totalSeconds} onFilesPicked={(f) => void onFilesPicked(f)} onRemove={removeSample} error={stepError} recordButtonRef={recordRef} />
        )}
        {step === 3 && <CloneStepReview samples={samples} totalSeconds={totalSeconds} onRemove={removeSample} onAddMore={back} error={stepError} />}
        {step === 4 && (
          <CloneStepName name={name} onNameChange={(v) => { setName(v); if (stepError) setStepError(null); }} makeDefault={makeDefault} onMakeDefaultChange={setMakeDefault} summary={{ count: samples.length, durationSeconds: totalSeconds }} error={stepError} inputRef={nameRef} />
        )}
      </FadeIn>

      <div className="flex items-center justify-between gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
        <Button type="button" variant="ghost" onClick={back} disabled={step === 1 || submitting || recorder.recording} className="gap-1.5">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />Atrás
        </Button>
        {step < 4 ? (
          <Button type="button" onClick={next} disabled={recorder.recording} className="gap-1.5 bg-blue-600 text-white hover:bg-blue-700">
            Continuar<ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        ) : (
          <div className="flex flex-col items-end gap-1">
            <Button
              type="button"
              onClick={() => void submit()}
              disabled={submitting || cloneBlocked}
              aria-describedby={cloneBlocked ? "clone-blocked-reason" : undefined}
              className="gap-1.5 bg-blue-600 text-white hover:bg-blue-700"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Sparkles className="h-4 w-4" aria-hidden="true" />}
              {submitting ? "Creando la voz…" : "Crear mi voz"}
            </Button>
            {cloneBlocked && (
              <p id="clone-blocked-reason" className="text-xs text-amber-900 dark:text-amber-100">
                El plan actual de ElevenLabs ({account?.tier}) no permite clonar voces.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
