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
import { RichTextEditor } from '@/components/shared/RichTextEditor';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, AlertTriangle } from 'lucide-react';
import { tripsService } from '@/lib/services/tripsService';
import { SEVERIDAD_DE_GRAVEDAD } from '@/lib/transporte/ajustesTransporte';
import { useMotivosNovedad } from '@/components/transporte/ajustes/useMotivosNovedad';

interface ReportIncidentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tripId: string;
  organizationId: number;
  onSuccess: () => void;
}

const SEVERITY_OPTIONS = [
  { value: 'low', label: 'Baja', description: 'No afecta la operación' },
  { value: 'medium', label: 'Media', description: 'Requiere atención' },
  { value: 'high', label: 'Alta', description: 'Afecta significativamente' },
  { value: 'critical', label: 'Crítica', description: 'Emergencia' },
];

export function ReportIncidentDialog({
  open,
  onOpenChange,
  tripId,
  organizationId,
  onSuccess,
}: ReportIncidentDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Una sola lista de motivos (Configuración › Transporte). `incident_type` del formulario guarda
  // el id del motivo; a la base va su `tipo` (los códigos viejos de esta lista, como
  // «mechanical», no pasaban el CHECK de transport_incidents) y el id en metadata.motivo.
  const motivos = useMotivosNovedad(open);
  const [formData, setFormData] = useState({
    incident_type: '',
    severity: 'medium',
    title: '',
    description: '',
    location_description: '',
  });

  useEffect(() => {
    if (open) {
      setFormData({
        incident_type: '',
        severity: 'medium',
        title: '',
        description: '',
        location_description: '',
      });
    }
  }, [open]);

  const handleSubmit = async () => {
    if (!formData.incident_type || !formData.title) return;

    setIsSubmitting(true);
    try {
      const motivo = motivos.find((m) => m.id === formData.incident_type);
      await tripsService.createIncident({
        organization_id: organizationId,
        reference_type: 'trip',
        reference_id: tripId,
        incident_type: motivo?.tipo ?? 'other',
        metadata: motivo ? { motivo: motivo.id, bloquea_vehiculo: motivo.bloqueaVehiculo } : undefined,
        severity: formData.severity,
        title: formData.title,
        description: formData.description || undefined,
      });

      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error('Error creating incident:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-300" />
            Reportar Incidente
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 sm:space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:gap-4">
            <div className="space-y-2">
              <Label htmlFor="incident_type">Tipo de Incidente *</Label>
              <Select
                value={formData.incident_type}
                onValueChange={(v) => {
                  const motivo = motivos.find((m) => m.id === v);
                  setFormData((p) => ({
                    ...p,
                    incident_type: v,
                    severity: motivo ? SEVERIDAD_DE_GRAVEDAD[motivo.gravedad] : p.severity,
                    title: p.title || motivo?.etiqueta || '',
                  }));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar tipo" />
                </SelectTrigger>
                <SelectContent>
                  {motivos.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.etiqueta}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="severity">Severidad *</Label>
              <Select
                value={formData.severity}
                onValueChange={(v) => setFormData((p) => ({ ...p, severity: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SEVERITY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <div>
                        <span className="font-medium">{opt.label}</span>
                        <span className="text-xs text-gray-500 ml-2 dark:text-gray-400">
                          - {opt.description}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="title">Título del Incidente *</Label>
            <Input
              id="title"
              placeholder="Ej: Retraso por tráfico en vía principal"
              value={formData.title}
              onChange={(e) => setFormData((p) => ({ ...p, title: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="location">Ubicación (opcional)</Label>
            <Input
              id="location"
              placeholder="Ej: Km 45, cerca de peaje La Calera"
              value={formData.location_description}
              onChange={(e) => setFormData((p) => ({ ...p, location_description: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Descripción Detallada</Label>
            <RichTextEditor
              placeholder="Describe qué ocurrió, qué acciones se tomaron, y cualquier otra información relevante..."
              value={formData.description || ''}
              onChange={(html) => setFormData((p) => ({ ...p, description: html }))}
              minHeight={60}
            />
          </div>

          {formData.severity === 'critical' && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm text-red-700 dark:text-red-400 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Los incidentes críticos serán notificados inmediatamente al equipo de operaciones.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !formData.incident_type || !formData.title}
            className="bg-red-600 hover:bg-red-700"
          >
            {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Reportar Incidente
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
