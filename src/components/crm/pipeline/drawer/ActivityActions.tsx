"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/use-toast";
import { opportunitiesService } from "@/components/crm/oportunidades/opportunitiesService";
import { actividadesService } from "@/components/crm/actividades/ActividadesService";
import {
  Phone,
  Mail,
  MessageCircle,
  Calendar as CalendarIcon,
  Loader2,
  Mic,
  Send,
  Plus,
} from "lucide-react";

interface ActivityActionsProps {
  opportunityId?: string;
  customer: {
    id?: string;
    full_name?: string;
    email?: string | null;
    phone?: string | null;
  } | null;
  onActivityLogged?: () => void;
}

type ActionMode = "call" | "email" | "whatsapp" | "meeting" | null;

/**
 * Crea una actividad en CRM. Si hay opportunityId usa opportunitiesService,
 * si no, usa actividadesService directamente (tabla activities con related_type=customer).
 */
async function logActivity(
  opportunityId: string | undefined,
  activityType: string,
  notes: string,
  customerId?: string,
): Promise<void> {
  if (opportunityId) {
    await opportunitiesService.createActivity(opportunityId, activityType as any, notes);
  } else {
    await actividadesService.createActivity({
      activity_type: activityType as any,
      notes,
      related_type: customerId ? "customer" : undefined,
      related_id: customerId,
      occurred_at: new Date().toISOString(),
    } as any);
  }
}

/**
 * Registra contacto en la oportunidad (solo si hay opportunityId).
 */
async function logContact(
  opportunityId: string | undefined,
  channel: string,
  result: string,
): Promise<void> {
  if (opportunityId) {
    await opportunitiesService.registerContact(opportunityId, channel as any, result as any);
  }
}

const RESULT_OPTIONS = [
  { value: "reached", label: "Contactado" },
  { value: "no_answer", label: "Sin respuesta" },
  { value: "left_voicemail", label: "Buzón de voz" },
  { value: "callback_scheduled", label: "Callback agendado" },
  { value: "qualified", label: "Calificado" },
  { value: "not_interested", label: "No interesado" },
  { value: "objection", label: "Objeción" },
];

export function ActivityActions({
  opportunityId,
  customer,
  onActivityLogged,
}: ActivityActionsProps) {
  const [activeMode, setActiveMode] = useState<ActionMode>(null);

  const openModal = (mode: ActionMode) => setActiveMode(mode);
  const closeModal = () => setActiveMode(null);

  const handleLogged = () => {
    onActivityLogged?.();
    closeModal();
  };

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <ActionButton
          icon={<Phone className="h-4 w-4" />}
          label="Llamar"
          onClick={() => openModal("call")}
          color="blue"
        />
        <ActionButton
          icon={<Mail className="h-4 w-4" />}
          label="Email"
          onClick={() => openModal("email")}
          color="green"
          disabled={!customer?.email}
        />
        <ActionButton
          icon={<MessageCircle className="h-4 w-4" />}
          label="WhatsApp"
          onClick={() => openModal("whatsapp")}
          color="emerald"
          disabled={!customer?.phone}
        />
        <ActionButton
          icon={<CalendarIcon className="h-4 w-4" />}
          label="Reunión"
          onClick={() => openModal("meeting")}
          color="purple"
        />
      </div>

      {activeMode === "call" && (
        <CallDialog
          open
          onOpenChange={closeModal}
          opportunityId={opportunityId}
          customer={customer}
          onLogged={handleLogged}
        />
      )}
      {activeMode === "email" && (
        <EmailDialog
          open
          onOpenChange={closeModal}
          opportunityId={opportunityId}
          customer={customer}
          onLogged={handleLogged}
        />
      )}
      {activeMode === "whatsapp" && (
        <WhatsAppDialog
          open
          onOpenChange={closeModal}
          opportunityId={opportunityId}
          customer={customer}
          onLogged={handleLogged}
        />
      )}
      {activeMode === "meeting" && (
        <MeetingDialog
          open
          onOpenChange={closeModal}
          opportunityId={opportunityId}
          customer={customer}
          onLogged={handleLogged}
        />
      )}
    </>
  );
}

function ActionButton({
  icon,
  label,
  onClick,
  color,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  color: "blue" | "green" | "emerald" | "purple";
  disabled?: boolean;
}) {
  const colorClasses: Record<string, string> = {
    blue: "border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20",
    green:
      "border-green-200 dark:border-green-800 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20",
    emerald:
      "border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20",
    purple:
      "border-purple-200 dark:border-purple-800 text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20",
  };
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onClick}
      disabled={disabled}
      className={`h-9 text-xs ${colorClasses[color]} ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
    >
      {icon}
      <span className="ml-1.5">{label}</span>
    </Button>
  );
}

// ============== Call Dialog ==============

interface CallDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  opportunityId?: string;
  customer: { id?: string; phone?: string | null; full_name?: string } | null;
  onLogged: () => void;
}

function CallDialog({ open, onOpenChange, opportunityId, customer, onLogged }: CallDialogProps) {
  const [mode, setMode] = useState<"click-to-call" | "manual">("manual");
  const [phone, setPhone] = useState(customer?.phone || "");
  const [result, setResult] = useState("reached");
  const [duration, setDuration] = useState("");
  const [notes, setNotes] = useState("");
  const [transcription, setTranscription] = useState("");
  const [transcribing, setTranscribing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [calling, setCalling] = useState(false);

  const handleTranscribe = async (file?: File) => {
    if (!file) return;
    setTranscribing(true);
    try {
      // Subir audio y disparar transcripción (endpoint unificado)
      const formData = new FormData();
      formData.append("file", file);
      formData.append("opportunity_id", opportunityId || "");
      formData.append("organization_id", String(typeof window !== "undefined" ? localStorage.getItem("orgId") || "" : ""));
      const res = await fetch("/api/crm/transcribe", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error de transcripción");
      setTranscription(data.transcript || data.text || "");
      toast({ title: "Transcripción lista", description: `Proveedor: ${data.provider || "auto"}` });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      toast({ title: "Error transcribiendo", description: msg, variant: "destructive" });
    } finally {
      setTranscribing(false);
    }
  };

  const handleCall = async () => {
    if (!phone) {
      toast({ title: "Sin teléfono", description: "Ingresa un número", variant: "destructive" });
      return;
    }
    setCalling(true);
    try {
      const res = await fetch("/api/integrations/twilio/click-to-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: phone, opportunityId: opportunityId || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error iniciando llamada");
      toast({ title: "Llamada iniciada", description: data.message || "Twilio conectando..." });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      toast({ title: "Error en Click-to-Call", description: msg, variant: "destructive" });
    } finally {
      setCalling(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const notesCombined = [
        notes,
        duration ? `Duración: ${duration}s` : "",
        transcription ? `\nTranscripción:\n${transcription}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      await logActivity(opportunityId, "call", notesCombined || "Llamada registrada", customer?.id);
      await logContact(opportunityId, "call", result);
      toast({ title: "Llamada registrada" });
      onLogged();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5 text-blue-500" />
            Registrar llamada
          </DialogTitle>
          <DialogDescription>
            Click-to-Call Twilio o registro manual. Ambos con transcripción.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Modo */}
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={mode === "manual" ? "default" : "outline"}
              onClick={() => setMode("manual")}
            >
              Registrar + Dialer
            </Button>
            <Button
              type="button"
              size="sm"
              variant={mode === "click-to-call" ? "default" : "outline"}
              onClick={() => setMode("click-to-call")}
            >
              Click-to-Call Twilio
            </Button>
          </div>

          {/* Teléfono */}
          <div className="space-y-1.5">
            <Label className="text-xs">Número</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+57..." />
          </div>

          {mode === "click-to-call" && (
            <Button type="button" onClick={handleCall} disabled={calling || !phone} className="w-full">
              {calling ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Phone className="h-4 w-4 mr-2" />}
              Iniciar llamada
            </Button>
          )}

          {mode === "manual" && (
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => window.open(`tel:${phone}`, "_blank")}
                disabled={!phone}
              >
                <Phone className="h-3.5 w-3.5 mr-1" />
                Abrir dialer
              </Button>
            </div>
          )}

          {/* Resultado */}
          <div className="space-y-1.5">
            <Label className="text-xs">Resultado</Label>
            <Select value={result} onValueChange={setResult}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RESULT_OPTIONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Duración */}
          <div className="space-y-1.5">
            <Label className="text-xs">Duración (segundos, opcional)</Label>
            <Input
              type="number"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder="120"
            />
          </div>

          {/* Notas */}
          <div className="space-y-1.5">
            <Label className="text-xs">Notas de la llamada</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Resumen de la conversación, acuerdos, objeciones..."
              rows={3}
            />
          </div>

          {/* Transcripción — opcional */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs flex items-center gap-1">
                <Mic className="h-3 w-3" />
                Transcripción (opcional)
                <span className="text-gray-400 font-normal">— Gemini / OpenAI</span>
              </Label>
              <label className="cursor-pointer text-xs text-blue-600 hover:underline">
                <input
                  type="file"
                  accept="audio/*"
                  className="hidden"
                  onChange={(e) => handleTranscribe(e.target.files?.[0])}
                />
                {transcribing ? <Loader2 className="h-3 w-3 animate-spin inline" /> : "Subir audio"}
              </label>
            </div>
            <Textarea
              value={transcription}
              onChange={(e) => setTranscription(e.target.value)}
              placeholder="Opcional: sube un audio para transcribir automáticamente, o pega la transcripción manualmente..."
              rows={4}
            />
            <p className="text-[11px] text-gray-400 dark:text-gray-500">
              La transcripción es opcional. Si subes audio, se usa Gemini (mejor en español) con fallback a OpenAI Whisper.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Guardar llamada
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============== Email Dialog ==============

interface EmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  opportunityId?: string;
  customer: { email?: string | null; full_name?: string; id?: string } | null;
  onLogged: () => void;
}

function EmailDialog({ open, onOpenChange, opportunityId, customer, onLogged }: EmailDialogProps) {
  const [to, setTo] = useState(customer?.email || "");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [templates, setTemplates] = useState<Array<{ id: string; name: string; subject?: string }>>([]);
  const [sending, setSending] = useState(false);

  // Cargar plantillas disponibles
  useState(() => {
    (async () => {
      try {
        const res = await fetch("/api/email/templates");
        const data = await res.json();
        if (res.ok && Array.isArray(data)) {
          setTemplates(data);
        }
      } catch {
        // Sin plantillas — flujo manual
      }
    })();
  });

  const handleTemplateChange = async (id: string) => {
    setTemplateId(id);
    const tpl = templates.find((t) => t.id === id);
    if (tpl?.subject) setSubject(tpl.subject);
  };

  const handleSend = async () => {
    if (!to || !subject) {
      toast({ title: "Faltan campos", description: "Destinatario y asunto son obligatorios", variant: "destructive" });
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to,
          subject,
          html: body || undefined,
          template_id: templateId || undefined,
          to_customer_id: customer?.id,
          related_type: opportunityId ? "opportunity" : "customer",
          related_id: opportunityId || customer?.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error enviando email");

      // Registrar actividad
      await logActivity(opportunityId, "email", `Email enviado a ${to} — Asunto: ${subject}`, customer?.id);
      await logContact(opportunityId, "email", "sent");
      toast({ title: "Email enviado" });
      onLogged();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      toast({ title: "Error enviando email", description: msg, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-green-500" />
            Enviar email
          </DialogTitle>
          <DialogDescription>Envío real vía Resend. Registra actividad en CRM.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {templates.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs">Plantilla (opcional)</Label>
              <Select value={templateId} onValueChange={handleTemplateChange}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Sin plantilla" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">Para *</Label>
            <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="cliente@ejemplo.com" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Asunto *</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Asunto del correo" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Mensaje (HTML)</Label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="<p>Hola...</p>"
              rows={6}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSend} disabled={sending || !to || !subject}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
            Enviar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============== WhatsApp Dialog ==============

interface WhatsAppDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  opportunityId?: string;
  customer: { id?: string; phone?: string | null; full_name?: string } | null;
  onLogged: () => void;
}

function WhatsAppDialog({ open, onOpenChange, opportunityId, customer, onLogged }: WhatsAppDialogProps) {
  const [to, setTo] = useState(customer?.phone || "");
  const [message, setMessage] = useState("");
  const [channel, setChannel] = useState<"cloud" | "twilio">("cloud");
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!to || !message) {
      toast({ title: "Faltan campos", description: "Número y mensaje son obligatorios", variant: "destructive" });
      return;
    }
    setSending(true);
    try {
      const endpoint =
        channel === "cloud"
          ? "/api/integrations/whatsapp/send"
          : "/api/integrations/twilio/send-whatsapp";

      const body =
        channel === "cloud"
          ? { to, type: "text", text: message, conversation_id: opportunityId }
          : { to, message, module: "crm" };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error enviando WhatsApp");

      await logActivity(opportunityId, "whatsapp", `WhatsApp enviado a ${to}: ${message.substring(0, 100)}`, customer?.id);
      await logContact(opportunityId, "whatsapp", "sent");
      toast({ title: "WhatsApp enviado" });
      onLogged();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      toast({ title: "Error enviando WhatsApp", description: msg, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-emerald-500" />
            Enviar WhatsApp
          </DialogTitle>
          <DialogDescription>Envío real vía WhatsApp Cloud API o Twilio.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={channel === "cloud" ? "default" : "outline"}
              onClick={() => setChannel("cloud")}
            >
              Cloud API
            </Button>
            <Button
              type="button"
              size="sm"
              variant={channel === "twilio" ? "default" : "outline"}
              onClick={() => setChannel("twilio")}
            >
              Twilio
            </Button>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Número *</Label>
            <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="+57..." />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Mensaje *</Label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Hola, te contacto desde..."
              rows={4}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSend} disabled={sending || !to || !message}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
            Enviar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============== Meeting Dialog ==============

interface MeetingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  opportunityId?: string;
  customer: { id?: string; full_name?: string } | null;
  onLogged: () => void;
}

function MeetingDialog({ open, onOpenChange, opportunityId, customer, onLogged }: MeetingDialogProps) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [duration, setDuration] = useState("60");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!title || !date || !time) {
      toast({ title: "Faltan campos", description: "Título, fecha y hora son obligatorios", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      // Combinar fecha + hora
      const startAt = new Date(`${date}T${time}`).toISOString();
      const endAt = new Date(new Date(startAt).getTime() + (parseInt(duration) || 60) * 60000).toISOString();

      // Insertar en calendar_events (módulo calendario existente)
      const { supabase } = await import("@/lib/supabase/config");
      const { getOrganizationId } = await import("@/lib/hooks/useOrganization");
      const orgId = getOrganizationId();

      const { data: userData } = await supabase.auth.getUser();

      const { error } = await supabase.from("calendar_events").insert({
        organization_id: orgId,
        title,
        description: notes || null,
        location: location || null,
        start_at: startAt,
        end_at: endAt,
        all_day: false,
        event_type: "meeting",
        customer_id: customer?.id || null,
        assigned_to: userData.user?.id || null,
        status: "confirmed",
        metadata: { opportunity_id: opportunityId || null, source: "crm" },
      });

      if (error) throw error;

      // Registrar actividad en CRM
      await logActivity(
        opportunityId,
        "meeting",
        `Reunión agendada: ${title} — ${date} ${time} (${duration}min)${location ? ` @ ${location}` : ""}`,
        customer?.id,
      );
      await logContact(opportunityId, "meeting", "scheduled");
      toast({ title: "Reunión agendada", description: "Visible en /app/calendario" });
      onLogged();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      toast({ title: "Error agendando reunión", description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5 text-purple-500" />
            Agendar reunión
          </DialogTitle>
          <DialogDescription>Se agenda en el módulo /app/calendario existente.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Título *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Reunión con cliente" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Fecha *</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Hora *</Label>
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Duración (min)</Label>
              <Input type="number" value={duration} onChange={(e) => setDuration(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Ubicación</Label>
              <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Oficina / Zoom" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Notas</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Agenda de la reunión..."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || !title || !date || !time}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
            Agendar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
