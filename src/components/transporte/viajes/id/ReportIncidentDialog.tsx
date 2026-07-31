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
import { Loader2, AlertTriangle } from 'lucide-react';
import { tripsService } from '@/lib/services/tripsService';

interface ReportIncidentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tripId: string;
  organizationId: number;
  onSuccess: () => void;
}

const INCIDENT_TYPES = [
  { value: 'mechanical', label: 'Falla Mecánica' },
  { value: 'accident', label: 'Accidente' },
  { value: 'delay', label: 'Retraso Significativo' },
  { value: 'passenger_issue', label: 'Problema con Pasajero' },
  { value: 'driver_issue', label: 'Problema con Conductor' },
  { value: 'route_deviation', label: 'Desvío de Ruta' },
  { value: 'weather', label: 'Condiciones Climáticas' },
  { value: 'traffic', label: 'Tráfico / Bloqueo' },
  { value: 'security', label: 'Seguridad' },
  { value: 'other', label: 'Otro' },
];

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
      await tripsService.createIncident({
        organization_id: organizationId,
        reference_type: 'trip',
        reference_id: tripId,
        incident_type: formData.incident_type,
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

  const selectedType = INCIDENT_TYPES.find((t) => t.value === formData.incident_type);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            Reportar Incidente
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="incident_type">Tipo de Incidente *</Label>
              <Select
                value={formData.incident_type}
                onValueChange={(v) => {
                  const type = INCIDENT_TYPES.find((t) => t.value === v);
                  setFormData((p) => ({
                    ...p,
                    incident_type: v,
                    title: p.title || type?.label || '',
                  }));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar tipo" />
                </SelectTrigger>
                <SelectContent>
                  {INCIDENT_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
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
                        <span className="text-xs text-gray-500 ml-2">
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
            <Textarea
              id="description"
              placeholder="Describe qué ocurrió, qué acciones se tomaron, y cualquier otra información relevante..."
              value={formData.description}
              onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
              rows={4}
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
