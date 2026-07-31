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
import { Loader2, CheckCircle, Package } from 'lucide-react';

interface DeliveryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shipment: {
    id: string;
    shipment_number: string;
    delivery_contact_name?: string;
  } | null;
  onConfirm: (data: {
    recipient_name: string;
    recipient_doc_type?: string;
    recipient_doc_number?: string;
    recipient_relationship?: string;
    notes?: string;
  }) => Promise<void>;
  isLoading?: boolean;
}

const DOC_TYPES = [
  { value: 'cc', label: 'Cédula de Ciudadanía' },
  { value: 'ce', label: 'Cédula de Extranjería' },
  { value: 'nit', label: 'NIT' },
  { value: 'passport', label: 'Pasaporte' },
  { value: 'other', label: 'Otro' },
];

const RELATIONSHIPS = [
  { value: 'recipient', label: 'Destinatario' },
  { value: 'family', label: 'Familiar' },
  { value: 'employee', label: 'Empleado' },
  { value: 'neighbor', label: 'Vecino' },
  { value: 'security', label: 'Vigilante/Portero' },
  { value: 'other', label: 'Otro' },
];

export function DeliveryDialog({
  open,
  onOpenChange,
  shipment,
  onConfirm,
  isLoading = false,
}: DeliveryDialogProps) {
  const [formData, setFormData] = useState({
    recipient_name: '',
    recipient_doc_type: '',
    recipient_doc_number: '',
    recipient_relationship: 'recipient',
    notes: '',
  });

  const handleSubmit = async () => {
    if (!formData.recipient_name.trim()) return;
    await onConfirm({
      recipient_name: formData.recipient_name,
      recipient_doc_type: formData.recipient_doc_type || undefined,
      recipient_doc_number: formData.recipient_doc_number || undefined,
      recipient_relationship: formData.recipient_relationship || undefined,
      notes: formData.notes || undefined,
    });
    setFormData({
      recipient_name: '',
      recipient_doc_type: '',
      recipient_doc_number: '',
      recipient_relationship: 'recipient',
      notes: '',
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-600" />
            Confirmar Entrega
          </DialogTitle>
        </DialogHeader>

        {shipment && (
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 mb-4">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-gray-500" />
              <span className="font-medium">{shipment.shipment_number}</span>
            </div>
            {shipment.delivery_contact_name && (
              <p className="text-sm text-gray-500 mt-1">
                Destinatario esperado: {shipment.delivery_contact_name}
              </p>
            )}
          </div>
        )}

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="recipient_name">Nombre de quien recibe *</Label>
            <Input
              id="recipient_name"
              value={formData.recipient_name}
              onChange={(e) => setFormData((p) => ({ ...p, recipient_name: e.target.value }))}
              placeholder="Nombre completo"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Tipo de documento</Label>
              <Select
                value={formData.recipient_doc_type}
                onValueChange={(v) => setFormData((p) => ({ ...p, recipient_doc_type: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar" />
                </SelectTrigger>
                <SelectContent>
                  {DOC_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Número de documento</Label>
              <Input
                value={formData.recipient_doc_number}
                onChange={(e) => setFormData((p) => ({ ...p, recipient_doc_number: e.target.value }))}
                placeholder="Número"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Relación con el destinatario</Label>
            <Select
              value={formData.recipient_relationship}
              onValueChange={(v) => setFormData((p) => ({ ...p, recipient_relationship: v }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RELATIONSHIPS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Notas de entrega</Label>
            <Textarea
              value={formData.notes}
              onChange={(e) => setFormData((p) => ({ ...p, notes: e.target.value }))}
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
            disabled={isLoading || !formData.recipient_name.trim()}
            className="bg-green-600 hover:bg-green-700"
          >
            {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Confirmar Entrega
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default DeliveryDialog;
