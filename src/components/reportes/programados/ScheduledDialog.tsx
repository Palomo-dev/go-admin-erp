'use client';

import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import {
  ScheduledReport, ScheduledFormData, SavedReportOption, Recipient,
  FREQUENCY_OPTIONS, FORMAT_OPTIONS,
} from './scheduledReportService';

interface ScheduledDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editItem: ScheduledReport | null;
  savedReports: SavedReportOption[];
  isSaving: boolean;
  onSave: (data: ScheduledFormData) => void;
}

const emptyRecipient = (): Recipient => ({ email: '', name: '', format: 'pdf' });

const emptyForm = (): ScheduledFormData => ({
  name: '',
  saved_report_id: null,
  frequency: 'weekly',
  recipients: [emptyRecipient()],
  is_active: true,
  next_run_at: null,
});

export function ScheduledDialog({
  open, onOpenChange, editItem, savedReports, isSaving, onSave,
}: ScheduledDialogProps) {
  const [form, setForm] = useState<ScheduledFormData>(emptyForm());

  useEffect(() => {
    if (open) {
      if (editItem) {
        setForm({
          name: editItem.name,
          saved_report_id: editItem.saved_report_id,
          frequency: editItem.frequency,
          recipients: editItem.recipients.length > 0 ? editItem.recipients : [emptyRecipient()],
          is_active: editItem.is_active,
          next_run_at: editItem.next_run_at,
        });
      } else {
        setForm(emptyForm());
      }
    }
  }, [open, editItem]);

  const updateField = <K extends keyof ScheduledFormData>(key: K, value: ScheduledFormData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateRecipient = (idx: number, field: keyof Recipient, value: string) => {
    setForm((prev) => {
      const updated = [...prev.recipients];
      updated[idx] = { ...updated[idx], [field]: value };
      return { ...prev, recipients: updated };
    });
  };

  const addRecipient = () => {
    setForm((prev) => ({ ...prev, recipients: [...prev.recipients, emptyRecipient()] }));
  };

  const removeRecipient = (idx: number) => {
    setForm((prev) => ({
      ...prev,
      recipients: prev.recipients.filter((_, i) => i !== idx),
    }));
  };

  const isValid = form.name.trim().length > 0 && form.recipients.some((r) => r.email.trim().length > 0);

  const handleSubmit = () => {
    if (!isValid) return;
    // Filtrar recipients vacíos
    const cleanedData: ScheduledFormData = {
      ...form,
      recipients: form.recipients.filter((r) => r.email.trim().length > 0),
    };
    onSave(cleanedData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="dark:bg-gray-800 dark:border-gray-700 sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="dark:text-gray-100">
            {editItem ? 'Editar programación' : 'Nueva programación'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Nombre */}
          <div className="space-y-1.5">
            <Label className="text-sm text-gray-700 dark:text-gray-300">Nombre *</Label>
            <Input
              value={form.name}
              onChange={(e) => updateField('name', e.target.value)}
              placeholder="Ej: Reporte semanal de ventas"
              className="bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600"
            />
          </div>

          {/* Reporte base */}
          <div className="space-y-1.5">
            <Label className="text-sm text-gray-700 dark:text-gray-300">Reporte guardado (opcional)</Label>
            <Select
              value={form.saved_report_id || '_none'}
              onValueChange={(v) => updateField('saved_report_id', v === '_none' ? null : v)}
            >
              <SelectTrigger className="bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600">
                <SelectValue placeholder="Seleccionar reporte..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">Sin reporte base</SelectItem>
                {savedReports.map((sr) => (
                  <SelectItem key={sr.id} value={sr.id}>
                    {sr.name} ({sr.module})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Frecuencia */}
          <div className="space-y-1.5">
            <Label className="text-sm text-gray-700 dark:text-gray-300">Frecuencia</Label>
            <Select value={form.frequency} onValueChange={(v) => updateField('frequency', v)}>
              <SelectTrigger className="bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FREQUENCY_OPTIONS.map((f) => (
                  <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Activo */}
          <div className="flex items-center justify-between">
            <Label className="text-sm text-gray-700 dark:text-gray-300">Activo</Label>
            <Switch checked={form.is_active} onCheckedChange={(v) => updateField('is_active', v)} />
          </div>

          {/* Destinatarios */}
          <div className="space-y-2">
            <Label className="text-sm text-gray-700 dark:text-gray-300">Destinatarios *</Label>
            {form.recipients.map((r, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <Input
                  value={r.email}
                  onChange={(e) => updateRecipient(idx, 'email', e.target.value)}
                  placeholder="correo@ejemplo.com"
                  type="email"
                  className="flex-1 bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-sm"
                />
                <Input
                  value={r.name || ''}
                  onChange={(e) => updateRecipient(idx, 'name', e.target.value)}
                  placeholder="Nombre"
                  className="w-28 bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-sm"
                />
                <Select
                  value={r.format || 'pdf'}
                  onValueChange={(v) => updateRecipient(idx, 'format', v)}
                >
                  <SelectTrigger className="w-24 bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FORMAT_OPTIONS.map((f) => (
                      <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.recipients.length > 1 && (
                  <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0" onClick={() => removeRecipient(idx)}>
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                )}
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={addRecipient} className="border-gray-300 dark:border-gray-600">
              <Plus className="h-4 w-4 mr-1" /> Agregar destinatario
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-gray-300 dark:border-gray-600">
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={!isValid || isSaving} className="bg-blue-600 hover:bg-blue-700 text-white">
            {isSaving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Guardando...</> : (editItem ? 'Actualizar' : 'Crear')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
