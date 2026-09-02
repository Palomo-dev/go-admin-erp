"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { Loader2, Trophy, Save } from "lucide-react";

interface ClosedWonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  opportunityId: string;
  opportunityName?: string;
  initialWinData?: Record<string, unknown> | null;
  onConfirmed?: () => void;
}

interface WinForm {
  product: string;
  modules: string;
  users_count: string;
  branches_count: string;
  main_problems: string;
  expectations: string;
  implementation_date: string;
  integrations: string;
  responsible: string;
}

const EMPTY_FORM: WinForm = {
  product: "",
  modules: "",
  users_count: "",
  branches_count: "",
  main_problems: "",
  expectations: "",
  implementation_date: "",
  integrations: "",
  responsible: "",
};

export function ClosedWonDialog({
  open,
  onOpenChange,
  opportunityId,
  opportunityName,
  initialWinData,
  onConfirmed,
}: ClosedWonDialogProps) {
  const [form, setForm] = useState<WinForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (initialWinData && Object.keys(initialWinData).length > 0) {
      setForm({ ...EMPTY_FORM, ...(initialWinData as Partial<WinForm>) });
    } else {
      setForm(EMPTY_FORM);
    }
  }, [initialWinData, open]);

  const update = (field: keyof WinForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!form.product.trim()) {
      toast({ title: "Campo obligatorio", description: "Indica qué compró el cliente", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await opportunitiesService.updateOpportunity(opportunityId, {
        status: "won",
        win_data: form as unknown as Record<string, unknown>,
        closed_at: new Date().toISOString(),
      });
      toast({ title: "Oportunidad ganada", description: "Ficha de cliente guardada" });
      onConfirmed?.();
      onOpenChange(false);
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
            <Trophy className="h-5 w-5 text-green-500" />
            Cerrar como ganada — {opportunityName || "..."}
          </DialogTitle>
          <DialogDescription>
            Registra la ficha de handoff/onboarding del cliente. Obligatorio para cerrar como ganada.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <Field label="Qué compró *" value={form.product} onChange={(v) => update("product", v)} placeholder="Ej: Plan Enterprise anual" />
          <Field label="Módulos" value={form.modules} onChange={(v) => update("modules", v)} placeholder="Ej: POS, Inventario, CRM, Reportes" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="N° usuarios" value={form.users_count} onChange={(v) => update("users_count", v)} placeholder="Ej: 25" />
            <Field label="N° sucursales" value={form.branches_count} onChange={(v) => update("branches_count", v)} placeholder="Ej: 5" />
          </div>
          <Area label="Problemas principales" value={form.main_problems} onChange={(v) => update("main_problems", v)} placeholder="Ej: Control de inventario, facturación manual..." rows={2} />
          <Area label="Expectativas" value={form.expectations} onChange={(v) => update("expectations", v)} placeholder="Ej: Reducir 50% tiempo de cierre..." rows={2} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Fecha implementación" value={form.implementation_date} onChange={(v) => update("implementation_date", v)} placeholder="Ej: 2026-02-01" />
            <Field label="Integraciones" value={form.integrations} onChange={(v) => update("integrations", v)} placeholder="Ej: DIAN, Bancolombia" />
          </div>
          <Field label="Responsable" value={form.responsible} onChange={(v) => update("responsible", v)} placeholder="Ej: Juan Pérez (CSM)" />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving} className="bg-green-600 hover:bg-green-700">
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            Confirmar ganada
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-gray-600 dark:text-gray-400">{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="h-9 text-sm" />
    </div>
  );
}

function Area({
  label,
  value,
  onChange,
  placeholder,
  rows,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-gray-600 dark:text-gray-400">{label}</Label>
      <Textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={rows || 3} />
    </div>
  );
}
