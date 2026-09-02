"use client";

import { useState, useEffect } from "react";
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
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/use-toast";
import { opportunitiesService } from "@/components/crm/oportunidades/opportunitiesService";
import { Loader2, Save, Clock, Calendar, Thermometer, Target } from "lucide-react";

interface FollowupSectionProps {
  opportunityId: string;
  initialData?: {
    last_contact_at?: string | null;
    next_contact_at?: string | null;
    contact_channel?: string | null;
    contact_result?: string | null;
    temperature?: string | null;
    next_action?: string | null;
    objection_id?: string | null;
  };
  onUpdated?: () => void;
}

const CHANNEL_OPTIONS = [
  { value: "call", label: "Llamada" },
  { value: "email", label: "Correo" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "meeting", label: "Reunión" },
  { value: "visit", label: "Visita" },
];

const RESULT_OPTIONS = [
  { value: "reached", label: "Contactado" },
  { value: "no_answer", label: "Sin respuesta" },
  { value: "left_voicemail", label: "Buzón de voz" },
  { value: "callback_scheduled", label: "Callback agendado" },
  { value: "qualified", label: "Calificado" },
  { value: "not_interested", label: "No interesado" },
  { value: "objection", label: "Objeción" },
];

const TEMPERATURE_OPTIONS = [
  { value: "hot", label: "Caliente", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  { value: "warm", label: "Tibio", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" },
  { value: "cold", label: "Frío", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
];

const formatDateTimeInput = (iso?: string | null) => {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const off = d.getTimezoneOffset();
    const local = new Date(d.getTime() - off * 60000);
    return local.toISOString().slice(0, 16);
  } catch {
    return "";
  }
};

export function FollowupSection({ opportunityId, initialData, onUpdated }: FollowupSectionProps) {
  const [nextContactAt, setNextContactAt] = useState(formatDateTimeInput(initialData?.next_contact_at));
  const [channel, setChannel] = useState(initialData?.contact_channel || "");
  const [result, setResult] = useState(initialData?.contact_result || "");
  const [temperature, setTemperature] = useState(initialData?.temperature || "");
  const [nextAction, setNextAction] = useState(initialData?.next_action || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setNextContactAt(formatDateTimeInput(initialData?.next_contact_at));
    setChannel(initialData?.contact_channel || "");
    setResult(initialData?.contact_result || "");
    setTemperature(initialData?.temperature || "");
    setNextAction(initialData?.next_action || "");
  }, [initialData, opportunityId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await opportunitiesService.updateOpportunity(opportunityId, {
        next_contact_at: nextContactAt ? new Date(nextContactAt).toISOString() : undefined,
        contact_channel: channel || undefined,
        contact_result: result || undefined,
        temperature: temperature || undefined,
        next_action: nextAction || undefined,
      });
      toast({ title: "Seguimiento actualizado" });
      onUpdated?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const lastContact = initialData?.last_contact_at;
  const tempBadge = TEMPERATURE_OPTIONS.find((t) => t.value === temperature);

  return (
    <div className="space-y-3">
      {/* Resumen rápido */}
      <div className="flex flex-wrap gap-2 text-xs">
        {lastContact && (
          <Badge variant="outline" className="text-xs">
            <Clock className="h-3 w-3 mr-1" />
            Último: {new Date(lastContact).toLocaleDateString("es-ES")}
          </Badge>
        )}
        {initialData?.contact_channel && (
          <Badge variant="outline" className="text-xs">
            Canal: {CHANNEL_OPTIONS.find((c) => c.value === initialData.contact_channel)?.label || initialData.contact_channel}
          </Badge>
        )}
        {tempBadge && <Badge className={`text-xs ${tempBadge.color}`}><Thermometer className="h-3 w-3 mr-1" />{tempBadge.label}</Badge>}
      </div>

      {/* Formulario editable */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            Próximo contacto
          </Label>
          <Input
            type="datetime-local"
            value={nextContactAt}
            onChange={(e) => setNextContactAt(e.target.value)}
            className="h-9 text-sm"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Canal</Label>
          <Select value={channel} onValueChange={setChannel}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Seleccionar..." />
            </SelectTrigger>
            <SelectContent>
              {CHANNEL_OPTIONS.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Resultado</Label>
          <Select value={result} onValueChange={setResult}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Seleccionar..." />
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

        <div className="space-y-1.5">
          <Label className="text-xs flex items-center gap-1">
            <Thermometer className="h-3 w-3" />
            Temperatura
          </Label>
          <Select value={temperature} onValueChange={setTemperature}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Seleccionar..." />
            </SelectTrigger>
            <SelectContent>
              {TEMPERATURE_OPTIONS.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs flex items-center gap-1">
          <Target className="h-3 w-3" />
          Próxima acción
        </Label>
        <Textarea
          value={nextAction}
          onChange={(e) => setNextAction(e.target.value)}
          placeholder="Ej: Enviar propuesta, llamar al decisor, agendar demo..."
          rows={2}
          className="text-sm"
        />
      </div>

      <Button size="sm" onClick={handleSave} disabled={saving} className="w-full h-8 text-xs">
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Save className="h-3.5 w-3.5 mr-1" />}
        Guardar seguimiento
      </Button>
    </div>
  );
}
