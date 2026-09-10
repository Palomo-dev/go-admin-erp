"use client";

/**
 * Editor de un agente IA de voz (FASE 06).
 * Pestañas: Propósito, Guion, Voz y Herramientas.
 * Los guardarraíles obligatorios (identificarse como IA, aviso de grabación y baja
 * voluntaria) no son configurables: se inyectan siempre en el runtime.
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/use-toast";
import { Loader2, Lock, ShieldCheck, AlertTriangle, Info } from "lucide-react";
import Link from "next/link";
import { ALL_TOOL_NAMES, MANDATORY_TOOLS } from "@/lib/services/crm/voiceAgentTools";
import { PROVIDERS_SETTINGS_HREF, useVoiceCatalog } from "./useVoiceCatalog";

export type AgentDraft = { mode: "create" } | { mode: "edit"; id: string };

/** Valor centinela del selector: sin voz propia, hereda la de la organización. */
const INHERIT_VOICE = "__inherit__";

const PURPOSES: Array<[string, string]> = [
  ["sell_product", "Vender un producto"],
  ["book_meeting", "Agendar una reunión"],
  ["qualify_lead", "Calificar contacto"],
  ["confirm_demo", "Confirmar demo"],
  ["follow_up_proposal", "Seguimiento de propuesta"],
  ["reactivate_cold", "Reactivar contacto frío"],
  ["collect_payment", "Cobro"],
  ["nps_survey", "Encuesta NPS"],
  ["renewal_reminder", "Recordar renovación"],
  ["custom", "Personalizado"],
];

const TOOL_LABELS: Record<string, string> = {
  get_customer_context: "Consultar la ficha del cliente",
  move_opportunity_stage: "Mover de etapa (no puede cerrar)",
  update_opportunity_field: "Actualizar datos de la oportunidad",
  create_task: "Crear tarea de seguimiento",
  book_meeting: "Agendar reunión",
  schedule_callback: "Programar devolución de llamada",
  log_objection: "Registrar objeción",
  send_payment_link: "Preparar enlace de pago",
  log_consent_opt_out: "Registrar baja voluntaria",
  transfer_to_human: "Transferir a una persona",
  end_call: "Terminar la llamada",
};

interface FormState {
  name: string;
  purpose_type: string;
  system_prompt: string;
  first_message: string;
  identity_disclosure: string;
  language: string;
  llm_model: string;
  temperature: number;
  max_turns: number;
  max_duration_seconds: number;
  voice_ref_id: string | null;
  voice_id: string;
  voice_provider: string;
  stt_provider: string;
  allowed_tools: string[];
  is_active: boolean;
}

const EMPTY: FormState = {
  name: "",
  purpose_type: "qualify_lead",
  system_prompt: "",
  first_message: "",
  identity_disclosure: "",
  language: "es-CO",
  llm_model: "gpt-4o-mini",
  temperature: 0.7,
  max_turns: 20,
  max_duration_seconds: 300,
  voice_ref_id: null,
  voice_id: "",
  voice_provider: "elevenlabs",
  stt_provider: "deepgram",
  allowed_tools: ["get_customer_context", "log_consent_opt_out", "end_call"],
  is_active: true,
};

export function AgentEditorDialog({
  draft,
  onClose,
  onSaved,
}: {
  draft: AgentDraft;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<FormState>(EMPTY);
  // Mismo catálogo (y mismo estado de credencial) que la pestaña «Voces».
  const { voices, defaultVoice, loading: voicesLoading, error: voicesError, tts, reload: reloadVoices } = useVoiceCatalog();
  const [loading, setLoading] = useState(draft.mode === "edit");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      if (draft.mode === "edit") {
        const res = await fetch(`/api/crm/voice-agents/${draft.id}`, { cache: "no-store" });
        const json = await res.json();
        if (!res.ok || !json?.success) throw new Error(json?.error || `Error ${res.status}`);
        const d = json.data;
        setForm({
          name: d.name ?? "",
          purpose_type: d.purpose_type ?? "custom",
          system_prompt: d.system_prompt ?? "",
          first_message: d.first_message ?? "",
          identity_disclosure: d.identity_disclosure ?? "",
          language: d.language ?? "es-CO",
          llm_model: d.llm_model ?? "gpt-4o-mini",
          temperature: Number(d.temperature ?? 0.7),
          max_turns: d.max_turns ?? 20,
          max_duration_seconds: d.max_duration_seconds ?? 300,
          voice_ref_id: d.voice_ref_id ?? null,
          voice_id: d.voice_id ?? "",
          voice_provider: d.voice_provider ?? "elevenlabs",
          stt_provider: d.stt_provider ?? "deepgram",
          allowed_tools: d.allowed_tools ?? [],
          is_active: d.is_active !== false,
        });
      }
    } catch (err) {
      toast({
        title: "No se pudo cargar el agente",
        description: err instanceof Error ? err.message : "Error desconocido",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [draft]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!form.name.trim()) {
      toast({ title: "El agente necesita un nombre", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const url = draft.mode === "edit" ? `/api/crm/voice-agents/${draft.id}` : "/api/crm/voice-agents";
      const res = await fetch(url, {
        method: draft.mode === "edit" ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, voice_id: form.voice_id || null }),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error || `Error ${res.status}`);
      toast({ title: draft.mode === "edit" ? "Agente actualizado" : "Agente creado" });
      onSaved();
    } catch (err) {
      toast({
        title: "No se pudo guardar",
        description: err instanceof Error ? err.message : "Error desconocido",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  // F-NEW-7 (D9 · Ley 1581): registrar una baja voluntaria y poder colgar no son
  // opcionales. La casilla se muestra marcada y bloqueada; el runtime las añade
  // igualmente aunque alguien las quite por otro camino.
  const isMandatoryTool = (tool: string) => (MANDATORY_TOOLS as readonly string[]).includes(tool);

  const toggleTool = (tool: string, on: boolean) => {
    if (isMandatoryTool(tool)) return;
    setForm((f) => ({
      ...f,
      allowed_tools: on ? [...new Set([...f.allowed_tools, tool])] : f.allowed_tools.filter((t) => t !== tool),
    }));
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[620px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{draft.mode === "edit" ? "Editar agente IA" : "Nuevo agente IA"}</DialogTitle>
          <DialogDescription>
            Define cómo habla el agente. Lo que debe conseguir en cada etapa se configura en el embudo.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10 text-gray-500 dark:text-gray-400">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            Cargando…
          </div>
        ) : (
          <Tabs defaultValue="proposito">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="proposito">Propósito</TabsTrigger>
              <TabsTrigger value="guion">Guion</TabsTrigger>
              <TabsTrigger value="voz">Voz</TabsTrigger>
              <TabsTrigger value="tools">Herramientas</TabsTrigger>
            </TabsList>

            <TabsContent value="proposito" className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="ag-name">Nombre</Label>
                <Input
                  id="ag-name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Ej. Ana, asistente comercial"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ag-purpose">Propósito</Label>
                <Select
                  value={form.purpose_type}
                  onValueChange={(v) => setForm((f) => ({ ...f, purpose_type: v }))}
                >
                  <SelectTrigger id="ag-purpose">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PURPOSES.map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="ag-model">Modelo</Label>
                  <Input
                    id="ag-model"
                    value={form.llm_model}
                    onChange={(e) => setForm((f) => ({ ...f, llm_model: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ag-turns">Máx. turnos</Label>
                  <Input
                    id="ag-turns"
                    type="number"
                    min={1}
                    value={form.max_turns}
                    onChange={(e) => setForm((f) => ({ ...f, max_turns: Number(e.target.value) }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ag-dur">Máx. segundos</Label>
                  <Input
                    id="ag-dur"
                    type="number"
                    min={30}
                    value={form.max_duration_seconds}
                    onChange={(e) => setForm((f) => ({ ...f, max_duration_seconds: Number(e.target.value) }))}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                <Label htmlFor="ag-active" className="cursor-pointer text-sm">
                  Agente activo
                </Label>
                <Switch
                  id="ag-active"
                  checked={form.is_active}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
                />
              </div>
            </TabsContent>

            <TabsContent value="guion" className="space-y-4 pt-4">
              <div className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-xs text-green-900 dark:border-green-900 dark:bg-green-950 dark:text-green-100">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <p>
                  Sea cual sea este guion, el agente siempre se identifica como asistente virtual, avisa de
                  la grabación, respeta la baja voluntaria y no cierra ventas por su cuenta.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ag-first">Primera frase</Label>
                <Textarea
                  id="ag-first"
                  rows={2}
                  value={form.first_message}
                  onChange={(e) => setForm((f) => ({ ...f, first_message: e.target.value }))}
                  placeholder="Le llamo de {{org}} por su solicitud. ¿Tiene un minuto?"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ag-identity">Cómo se identifica como IA</Label>
                <Input
                  id="ag-identity"
                  value={form.identity_disclosure}
                  onChange={(e) => setForm((f) => ({ ...f, identity_disclosure: e.target.value }))}
                  placeholder="Le atiende un asistente virtual con inteligencia artificial."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ag-prompt">Instrucciones del agente</Label>
                <Textarea
                  id="ag-prompt"
                  rows={6}
                  value={form.system_prompt}
                  onChange={(e) => setForm((f) => ({ ...f, system_prompt: e.target.value }))}
                />
              </div>
            </TabsContent>

            <TabsContent value="voz" className="space-y-4 pt-4">
              <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-100">
                <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <p>
                  Si eliges una voz aquí, este agente habla con ella. Si dejas «Voz por defecto de la
                  organización», usa{" "}
                  <strong>{defaultVoice ? `«${defaultVoice.name}»` : "la voz estándar de Google, porque no hay ninguna marcada por defecto"}</strong>.
                  El catálogo se administra en la pestaña «Voces» de esta misma pantalla.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="ag-voiceref">Voz de este agente</Label>
                {voicesLoading ? (
                  <p className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    Cargando el catálogo de voces…
                  </p>
                ) : voicesError ? (
                  <div
                    role="alert"
                    className="flex items-start justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
                  >
                    <span>No se pudo cargar el catálogo de voces: {voicesError}</span>
                    <Button type="button" size="sm" variant="outline" onClick={() => void reloadVoices()}>
                      Reintentar
                    </Button>
                  </div>
                ) : (
                  <Select
                    value={form.voice_ref_id ?? INHERIT_VOICE}
                    onValueChange={(v) =>
                      setForm((f) => ({ ...f, voice_ref_id: v === INHERIT_VOICE ? null : v }))
                    }
                  >
                    <SelectTrigger id="ag-voiceref">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={INHERIT_VOICE}>
                        Voz por defecto de la organización
                        {defaultVoice ? ` (${defaultVoice.name})` : " (ninguna: voz estándar)"}
                      </SelectItem>
                      {voices.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.name} {v.kind === "cloned" ? "(clonada)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {!voicesLoading && !voicesError && voices.length === 0 && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <div>
                      <p className="font-medium">No hay ninguna voz en el catálogo, así que no hay nada que elegir.</p>
                      <p>
                        {tts.ready
                          ? "Ve a la pestaña «Voces» e importa el catálogo de ElevenLabs o registra una voz por su identificador."
                          : (
                            <>
                              Falta la clave de voz sintética (TTS): sin ella no se puede importar ni clonar
                              ninguna voz. Guárdala en{" "}
                              <Link href={PROVIDERS_SETTINGS_HREF} className="underline">
                                Configuración › CRM › Proveedores e IA
                              </Link>{" "}
                              y luego importa el catálogo desde la pestaña «Voces».
                            </>
                          )}
                      </p>
                      <p className="mt-1">Mientras tanto, este agente llamará con la voz estándar de Google.</p>
                    </div>
                  </div>
                )}

                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Una voz clonada exige consentimiento registrado de su propietario (Ley 1581 de 2012).
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="ag-lang">Idioma</Label>
                  <Input
                    id="ag-lang"
                    value={form.language}
                    onChange={(e) => setForm((f) => ({ ...f, language: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ag-stt">Transcripción</Label>
                  <Select
                    value={form.stt_provider}
                    onValueChange={(v) => setForm((f) => ({ ...f, stt_provider: v }))}
                  >
                    <SelectTrigger id="ag-stt">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="deepgram">Deepgram nova-3</SelectItem>
                      <SelectItem value="twilio">Por defecto de Twilio</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ag-voiceid">Identificador de voz suelto (opcional)</Label>
                <Input
                  id="ag-voiceid"
                  value={form.voice_id}
                  onChange={(e) => setForm((f) => ({ ...f, voice_id: e.target.value }))}
                  placeholder="Ej. 6xftrpatV0jGmFHxDjUv"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Salida de emergencia: un identificador de ElevenLabs que no está en el catálogo. Solo entra en
                  juego cuando la selección de arriba no resuelve a ninguna voz activa (no hay voz elegida y
                  tampoco hay una por defecto, o la voz elegida quedó inactiva).
                </p>
              </div>
            </TabsContent>

            <TabsContent value="tools" className="space-y-3 pt-4">
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Qué puede hacer el agente durante la llamada. Cada etapa del embudo puede acotar más esta
                lista.
              </p>
              <ul className="space-y-2">
                {ALL_TOOL_NAMES.map((tool) => {
                  const obligatoria = isMandatoryTool(tool);
                  return (
                    <li key={tool} className="flex items-center gap-2">
                      <Checkbox
                        id={`tool-${tool}`}
                        checked={obligatoria || form.allowed_tools.includes(tool)}
                        disabled={obligatoria}
                        aria-describedby={obligatoria ? `tool-${tool}-obligatoria` : undefined}
                        onCheckedChange={(v) => toggleTool(tool, v === true)}
                      />
                      <Label
                        htmlFor={`tool-${tool}`}
                        className={
                          obligatoria
                            ? "text-sm font-normal text-gray-700 dark:text-gray-300"
                            : "cursor-pointer text-sm font-normal"
                        }
                      >
                        {TOOL_LABELS[tool] ?? tool}
                      </Label>
                      {obligatoria && (
                        <span
                          id={`tool-${tool}-obligatoria`}
                          className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200"
                        >
                          <Lock className="h-3 w-3" aria-hidden="true" />
                          Obligatoria por ley
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Registrar un «no me vuelva a llamar» y poder colgar son obligatorias (Ley 1581 de
                2012). No se pueden desactivar ni acotar desde la etapa del embudo.
              </p>
            </TabsContent>
          </Tabs>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="button" onClick={save} disabled={saving || loading}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                Guardando…
              </>
            ) : (
              "Guardar agente"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
