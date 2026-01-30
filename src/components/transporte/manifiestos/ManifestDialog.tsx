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
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, ClipboardList, Truck, Calendar } from 'lucide-react';
import type { ManifestWithDetails, ManifestCreateInput } from '@/lib/services/manifestsService';

interface Vehicle {
  id: string;
  plate: string;
  vehicle_type: string;
}

interface Carrier {
  id: string;
  name: string;
  code: string;
}

interface Route {
  id: string;
  name: string;
  code: string;
}

interface ManifestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  manifest?: ManifestWithDetails | null;
  vehicles: Vehicle[];
  carriers: Carrier[];
  routes: Route[];
  onSave: (data: ManifestCreateInput) => Promise<void>;
  isLoading?: boolean;
}

const MANIFEST_TYPES = [
  { value: 'delivery', label: 'Entrega' },
  { value: 'pickup', label: 'Recogida' },
  { value: 'transfer', label: 'Transferencia' },
];

export function ManifestDialog({
  open,
  onOpenChange,
  manifest,
  vehicles,
  carriers,
  routes,
  onSave,
  isLoading = false,
}: ManifestDialogProps) {
  const [formData, setFormData] = useState<ManifestCreateInput>({
    manifest_date: new Date().toISOString().split('T')[0],
    manifest_type: 'delivery',
    carrier_id: undefined,
    vehicle_id: undefined,
    route_id: undefined,
    planned_start: undefined,
    planned_end: undefined,
    notes: undefined,
  });

  useEffect(() => {
    if (open) {
      if (manifest) {
        setFormData({
          manifest_date: manifest.manifest_date,
          manifest_type: manifest.manifest_type,
          carrier_id: manifest.carrier_id || undefined,
          vehicle_id: manifest.vehicle_id || undefined,
          route_id: manifest.route_id || undefined,
          planned_start: manifest.planned_start?.slice(0, 16) || undefined,
          planned_end: manifest.planned_end?.slice(0, 16) || undefined,
          notes: manifest.notes || undefined,
        });
      } else {
        setFormData({
          manifest_date: new Date().toISOString().split('T')[0],
          manifest_type: 'delivery',
          carrier_id: undefined,
          vehicle_id: undefined,
          route_id: undefined,
          planned_start: undefined,
          planned_end: undefined,
          notes: undefined,
        });
      }
    }
  }, [open, manifest]);

  const handleSubmit = async () => {
    if (!formData.manifest_date) return;
    await onSave(formData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-blue-600" />
            {manifest ? 'Editar Manifiesto' : 'Nuevo Manifiesto'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Fecha y Tipo */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="manifest_date" className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Fecha *
              </Label>
              <Input
                id="manifest_date"
                type="date"
                value={formData.manifest_date}
                onChange={(e) => setFormData((p) => ({ ...p, manifest_date: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Tipo de Manifiesto</Label>
              <Select
                value={formData.manifest_type}
                onValueChange={(v) => setFormData((p) => ({ ...p, manifest_type: v as ManifestCreateInput['manifest_type'] }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MANIFEST_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Vehículo */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Truck className="h-4 w-4" />
              Vehículo
            </Label>
            <Select
              value={formData.vehicle_id || '__none__'}
              onValueChange={(v) => setFormData((p) => ({ ...p, vehicle_id: v === '__none__' ? undefined : v }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar vehículo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Sin vehículo asignado</SelectItem>
                {vehicles.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.plate} ({v.vehicle_type})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Transportadora */}
          <div className="space-y-2">
            <Label>Transportadora</Label>
            <Select
              value={formData.carrier_id || '__none__'}
              onValueChange={(v) => setFormData((p) => ({ ...p, carrier_id: v === '__none__' ? undefined : v }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar transportadora" />
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

          {/* Ruta */}
          <div className="space-y-2">
            <Label>Ruta</Label>
            <Select
              value={formData.route_id || '__none__'}
              onValueChange={(v) => setFormData((p) => ({ ...p, route_id: v === '__none__' ? undefined : v }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar ruta" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Sin ruta asignada</SelectItem>
                {routes.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name || r.code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Horario planificado */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Inicio Planificado</Label>
              <Input
                type="datetime-local"
                value={formData.planned_start || ''}
                onChange={(e) => setFormData((p) => ({ ...p, planned_start: e.target.value || undefined }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Fin Planificado</Label>
              <Input
                type="datetime-local"
                value={formData.planned_end || ''}
                onChange={(e) => setFormData((p) => ({ ...p, planned_end: e.target.value || undefined }))}
              />
            </div>
          </div>

          {/* Notas */}
          <div className="space-y-2">
            <Label>Notas</Label>
            <Textarea
              value={formData.notes || ''}
              onChange={(e) => setFormData((p) => ({ ...p, notes: e.target.value || undefined }))}
              placeholder="Instrucciones o notas adicionales..."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isLoading || !formData.manifest_date}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {manifest ? 'Guardar Cambios' : 'Crear Manifiesto'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ManifestDialog;
