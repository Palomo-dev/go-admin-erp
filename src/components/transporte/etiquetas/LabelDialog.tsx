'use client';

import { useState, useEffect } from 'react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Tag, Package } from 'lucide-react';
import type { LabelWithDetails, LabelCreateInput } from '@/lib/services/labelsService';

interface Shipment {
  id: string;
  shipment_number: string;
  tracking_number?: string;
}

interface Carrier {
  id: string;
  name: string;
  code: string;
}

interface LabelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  label?: LabelWithDetails | null;
  shipments: Shipment[];
  carriers: Carrier[];
  onSave: (data: LabelCreateInput) => Promise<void>;
  isLoading?: boolean;
}

const LABEL_TYPES = [
  { value: 'shipping', label: 'Envío' },
  { value: 'return', label: 'Devolución' },
  { value: 'customs', label: 'Aduanas' },
];

const FORMATS = [
  { value: 'pdf', label: 'PDF' },
  { value: 'png', label: 'PNG' },
  { value: 'zpl', label: 'ZPL (Zebra)' },
  { value: 'epl', label: 'EPL' },
];

const BARCODE_TYPES = [
  { value: 'code128', label: 'Code 128' },
  { value: 'code39', label: 'Code 39' },
  { value: 'qrcode', label: 'QR Code' },
  { value: 'datamatrix', label: 'Data Matrix' },
];

export function LabelDialog({
  open,
  onOpenChange,
  label,
  shipments,
  carriers,
  onSave,
  isLoading = false,
}: LabelDialogProps) {
  const [formData, setFormData] = useState<LabelCreateInput>({
    shipment_id: '',
    label_type: 'shipping',
    format: 'pdf',
    carrier_id: undefined,
    width_mm: 100,
    height_mm: 150,
    barcode_type: 'code128',
  });

  useEffect(() => {
    if (open) {
      if (label) {
        setFormData({
          shipment_id: label.shipment_id,
          label_type: label.label_type,
          format: label.format,
          carrier_id: label.carrier_id || undefined,
          width_mm: label.width_mm || 100,
          height_mm: label.height_mm || 150,
          barcode_type: label.barcode_type || 'code128',
        });
      } else {
        setFormData({
          shipment_id: shipments[0]?.id || '',
          label_type: 'shipping',
          format: 'pdf',
          carrier_id: undefined,
          width_mm: 100,
          height_mm: 150,
          barcode_type: 'code128',
        });
      }
    }
  }, [open, label, shipments]);

  const handleSubmit = async () => {
    if (!formData.shipment_id) return;
    await onSave(formData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="h-5 w-5 text-blue-600" />
            {label ? 'Editar Etiqueta' : 'Nueva Etiqueta'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Envío */}
          <div className="space-y-2">
            <Label htmlFor="shipment" className="flex items-center gap-2">
              <Package className="h-4 w-4" />
              Envío *
            </Label>
            <Select
              value={formData.shipment_id}
              onValueChange={(v) => setFormData((p) => ({ ...p, shipment_id: v }))}
              disabled={!!label}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar envío" />
              </SelectTrigger>
              <SelectContent>
                {shipments.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.shipment_number}
                    {s.tracking_number && ` (${s.tracking_number})`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Tipo y Formato */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Tipo de Etiqueta</Label>
              <Select
                value={formData.label_type}
                onValueChange={(v) => setFormData((p) => ({ ...p, label_type: v as LabelCreateInput['label_type'] }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LABEL_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Formato</Label>
              <Select
                value={formData.format}
                onValueChange={(v) => setFormData((p) => ({ ...p, format: v as LabelCreateInput['format'] }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FORMATS.map((f) => (
                    <SelectItem key={f.value} value={f.value}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Carrier */}
          <div className="space-y-2">
            <Label>Transportadora (opcional)</Label>
            <Select
              value={formData.carrier_id || '__none__'}
              onValueChange={(v) => setFormData((p) => ({ ...p, carrier_id: v === '__none__' ? undefined : v }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Sin transportadora" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Sin transportadora</SelectItem>
                {carriers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} ({c.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Dimensiones */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Ancho (mm)</Label>
              <Input
                type="number"
                value={formData.width_mm}
                onChange={(e) => setFormData((p) => ({ ...p, width_mm: Number(e.target.value) || 100 }))}
                min={50}
                max={300}
              />
            </div>
            <div className="space-y-2">
              <Label>Alto (mm)</Label>
              <Input
                type="number"
                value={formData.height_mm}
                onChange={(e) => setFormData((p) => ({ ...p, height_mm: Number(e.target.value) || 150 }))}
                min={50}
                max={300}
              />
            </div>
          </div>

          {/* Tipo de código de barras */}
          <div className="space-y-2">
            <Label>Tipo de Código de Barras</Label>
            <Select
              value={formData.barcode_type}
              onValueChange={(v) => setFormData((p) => ({ ...p, barcode_type: v as LabelCreateInput['barcode_type'] }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BARCODE_TYPES.map((b) => (
                  <SelectItem key={b.value} value={b.value}>
                    {b.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isLoading || !formData.shipment_id}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {label ? 'Guardar Cambios' : 'Crear Etiqueta'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default LabelDialog;
