'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, XCircle, Package, CalendarDays } from 'lucide-react';

interface FailureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shipment: {
    id: string;
    shipment_number: string;
    delivery_address?: string;
  } | null;
  onConfirm: (data: {
    failure_reason_code: string;
    failure_reason_text: string;
    driver_notes?: string;
    reschedule_date?: string;
  }) => Promise<void>;
  isLoading?: boolean;
}

const FAILURE_REASONS = [
  { code: 'not_home', text: 'Destinatario ausente' },
  { code: 'wrong_address', text: 'Dirección incorrecta' },
  { code: 'refused', text: 'Rechazado por el destinatario' },
  { code: 'damaged', text: 'Paquete dañado' },
  { code: 'inaccessible', text: 'Zona inaccesible' },
  { code: 'closed', text: 'Local/Empresa cerrada' },
  { code: 'no_money', text: 'Sin dinero para COD' },
  { code: 'security', text: 'Problemas de seguridad' },
  { code: 'weather', text: 'Condiciones climáticas' },
  { code: 'other', text: 'Otro motivo' },
];

export function FailureDialog({
  open,
  onOpenChange,
  shipment,
  onConfirm,
  isLoading = false,
}: FailureDialogProps) {
  const [formData, setFormData] = useState({
    failure_reason_code: '',
    failure_reason_text: '',
    driver_notes: '',
    reschedule_date: '',
  });

  const handleReasonChange = (code: string) => {
    const reason = FAILURE_REASONS.find((r) => r.code === code);
    setFormData((p) => ({
      ...p,
      failure_reason_code: code,
      failure_reason_text: reason?.text || '',
    }));
  };

  const handleSubmit = async () => {
    if (!formData.failure_reason_code || !formData.failure_reason_text) return;
    await onConfirm({
      failure_reason_code: formData.failure_reason_code,
      failure_reason_text: formData.failure_reason_text,
      driver_notes: formData.driver_notes || undefined,
      reschedule_date: formData.reschedule_date || undefined,
    });
    setFormData({
      failure_reason_code: '',
      failure_reason_text: '',
      driver_notes: '',
      reschedule_date: '',
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <XCircle className="h-5 w-5 text-red-600" />
            Registrar Entrega Fallida
          </DialogTitle>
        </DialogHeader>

        {shipment && (
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 mb-4">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-gray-500" />
              <span className="font-medium">{shipment.shipment_number}</span>
            </div>
            {shipment.delivery_address && (
              <p className="text-sm text-gray-500 mt-1 truncate">
                {shipment.delivery_address}
              </p>
            )}
          </div>
        )}

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Motivo del fallo *</Label>
            <Select
              value={formData.failure_reason_code}
              onValueChange={handleReasonChange}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar motivo" />
              </SelectTrigger>
              <SelectContent>
                {FAILURE_REASONS.map((r) => (
                  <SelectItem key={r.code} value={r.code}>
                    {r.text}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {formData.failure_reason_code === 'other' && (
            <div className="space-y-2">
              <Label>Descripción del motivo *</Label>
              <Input
                value={formData.failure_reason_text}
                onChange={(e) => setFormData((p) => ({ ...p, failure_reason_text: e.target.value }))}
                placeholder="Describa el motivo"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4" />
              Reprogramar para
            </Label>
            <Input
              type="date"
              value={formData.reschedule_date}
              onChange={(e) => setFormData((p) => ({ ...p, reschedule_date: e.target.value }))}
              min={new Date().toISOString().split('T')[0]}
            />
          </div>

          <div className="space-y-2">
            <Label>Notas del conductor</Label>
            <Textarea
              value={formData.driver_notes}
              onChange={(e) => setFormData((p) => ({ ...p, driver_notes: e.target.value }))}
              placeholder="Observaciones adicionales..."
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isLoading || !formData.failure_reason_code || !formData.failure_reason_text}
            variant="destructive"
          >
            {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Registrar Fallo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default FailureDialog;
