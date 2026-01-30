'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AlertTriangle, Loader2 } from 'lucide-react';

interface IncidentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (incident: {
    incident_type: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    title: string;
    description?: string;
    location_description?: string;
  }) => Promise<void>;
}

const INCIDENT_TYPES = [
  { value: 'damage', label: 'Daño en paquete' },
  { value: 'loss', label: 'Pérdida/Extravío' },
  { value: 'delay', label: 'Retraso significativo' },
  { value: 'theft', label: 'Robo' },
  { value: 'wrong_delivery', label: 'Entrega incorrecta' },
  { value: 'customer_complaint', label: 'Queja de cliente' },
  { value: 'vehicle_issue', label: 'Problema con vehículo' },
  { value: 'documentation', label: 'Problema de documentación' },
  { value: 'other', label: 'Otro' },
];

const SEVERITY_CONFIG = {
  low: { label: 'Baja', color: 'bg-blue-100 text-blue-800' },
  medium: { label: 'Media', color: 'bg-yellow-100 text-yellow-800' },
  high: { label: 'Alta', color: 'bg-orange-100 text-orange-800' },
  critical: { label: 'Crítica', color: 'bg-red-100 text-red-800' },
};

export function IncidentDialog({ open, onOpenChange, onSubmit }: IncidentDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    incident_type: 'damage',
    severity: 'medium' as 'low' | 'medium' | 'high' | 'critical',
    title: '',
    description: '',
    location_description: '',
  });

  const handleSubmit = async () => {
    if (!formData.title) return;

    setIsSubmitting(true);
    try {
      await onSubmit(formData);
      onOpenChange(false);
      setFormData({
        incident_type: 'damage',
        severity: 'medium',
        title: '',
        description: '',
        location_description: '',
      });
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
            <AlertTriangle className="h-5 w-5 text-red-600" />
            Reportar Incidente
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Tipo de Incidente</Label>
            <Select
              value={formData.incident_type}
              onValueChange={(v) => setFormData((p) => ({ ...p, incident_type: v }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INCIDENT_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Severidad</Label>
            <Select
              value={formData.severity}
              onValueChange={(v) => setFormData((p) => ({ ...p, severity: v as typeof formData.severity }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(SEVERITY_CONFIG).map(([value, config]) => (
                  <SelectItem key={value} value={value}>
                    <div className="flex items-center gap-2">
                      <Badge className={config.color}>{config.label}</Badge>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Título del incidente *</Label>
            <Input
              value={formData.title}
              onChange={(e) => setFormData((p) => ({ ...p, title: e.target.value }))}
              placeholder="Resumen breve del incidente"
            />
          </div>

          <div className="space-y-2">
            <Label>Descripción</Label>
            <Textarea
              value={formData.description}
              onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
              placeholder="Descripción detallada del incidente..."
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label>Ubicación (opcional)</Label>
            <Input
              value={formData.location_description}
              onChange={(e) => setFormData((p) => ({ ...p, location_description: e.target.value }))}
              placeholder="¿Dónde ocurrió el incidente?"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button 
            onClick={handleSubmit} 
            disabled={isSubmitting || !formData.title}
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
