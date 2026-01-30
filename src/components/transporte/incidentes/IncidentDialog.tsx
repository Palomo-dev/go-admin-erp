'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, AlertTriangle, MapPin, DollarSign, FileText } from 'lucide-react';
import type { IncidentWithDetails, CreateIncidentData } from '@/lib/services/incidentsService';
import { INCIDENT_TYPES, SEVERITY_LEVELS, INCIDENT_STATUSES } from '@/lib/services/incidentsService';

interface IncidentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  incident?: IncidentWithDetails | null;
  trips: Array<{ id: string; trip_code: string; departure_datetime: string }>;
  shipments: Array<{ id: string; tracking_number: string; status: string }>;
  employees: Array<{ id: number; full_name: string; email?: string }>;
  onSave: (data: Partial<CreateIncidentData>) => Promise<void>;
  isLoading?: boolean;
}

const initialFormData: Partial<CreateIncidentData> = {
  reference_type: 'trip',
  reference_id: '',
  incident_type: 'delay',
  severity: 'medium',
  title: '',
  description: '',
  status: 'open',
  assigned_to: undefined,
  occurred_at: new Date().toISOString().slice(0, 16),
  sla_hours: 24,
  location_description: '',
  latitude: undefined,
  longitude: undefined,
  estimated_cost: 0,
  actual_cost: 0,
  currency: 'COP',
  notes: '',
};

export function IncidentDialog({
  open,
  onOpenChange,
  incident,
  trips,
  shipments,
  employees,
  onSave,
  isLoading = false,
}: IncidentDialogProps) {
  const [formData, setFormData] = useState<Partial<CreateIncidentData>>(initialFormData);
  const [activeTab, setActiveTab] = useState('general');

  useEffect(() => {
    if (incident) {
      setFormData({
        reference_type: incident.reference_type,
        reference_id: incident.reference_id,
        incident_type: incident.incident_type,
        severity: incident.severity,
        title: incident.title,
        description: incident.description || '',
        status: incident.status,
        assigned_to: incident.assigned_to,
        occurred_at: incident.occurred_at ? incident.occurred_at.slice(0, 16) : '',
        sla_hours: incident.sla_hours,
        location_description: incident.location_description || '',
        latitude: incident.latitude,
        longitude: incident.longitude,
        estimated_cost: incident.estimated_cost || 0,
        actual_cost: incident.actual_cost || 0,
        currency: incident.currency || 'COP',
        notes: incident.notes || '',
      });
    } else {
      setFormData(initialFormData);
    }
    setActiveTab('general');
  }, [incident, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSave(formData);
  };

  const handleChange = (field: keyof CreateIncidentData, value: unknown) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const references = formData.reference_type === 'trip' ? trips : shipments;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-orange-600" />
            {incident ? 'Editar Incidente' : 'Nuevo Incidente'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="ubicacion">Ubicación</TabsTrigger>
              <TabsTrigger value="costos">Costos</TabsTrigger>
              <TabsTrigger value="notas">Notas</TabsTrigger>
            </TabsList>

            {/* Tab General */}
            <TabsContent value="general" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Título del incidente *</Label>
                <Input
                  id="title"
                  value={formData.title || ''}
                  onChange={(e) => handleChange('title', e.target.value)}
                  placeholder="Descripción breve del incidente"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Tipo de referencia *</Label>
                  <Select
                    value={formData.reference_type}
                    onValueChange={(v) => {
                      handleChange('reference_type', v);
                      handleChange('reference_id', '');
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="trip">Viaje</SelectItem>
                      <SelectItem value="shipment">Envío</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>
                    {formData.reference_type === 'trip' ? 'Viaje' : 'Envío'} *
                  </Label>
                  <Select
                    value={formData.reference_id || 'none'}
                    onValueChange={(v) => handleChange('reference_id', v === 'none' ? '' : v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Seleccionar...</SelectItem>
                      {formData.reference_type === 'trip' ? (
                        trips.map((trip) => (
                          <SelectItem key={trip.id} value={trip.id}>
                            {trip.trip_code}
                          </SelectItem>
                        ))
                      ) : (
                        shipments.map((shipment) => (
                          <SelectItem key={shipment.id} value={shipment.id}>
                            {shipment.tracking_number}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Tipo de incidente *</Label>
                  <Select
                    value={formData.incident_type || 'delay'}
                    onValueChange={(v) => handleChange('incident_type', v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
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
                  <Label>Severidad *</Label>
                  <Select
                    value={formData.severity || 'medium'}
                    onValueChange={(v) => handleChange('severity', v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SEVERITY_LEVELS.map((level) => (
                        <SelectItem key={level.value} value={level.value}>
                          {level.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Estado</Label>
                  <Select
                    value={formData.status || 'open'}
                    onValueChange={(v) => handleChange('status', v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {INCIDENT_STATUSES.map((status) => (
                        <SelectItem key={status.value} value={status.value}>
                          {status.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Responsable</Label>
                  <Select
                    value={formData.assigned_to?.toString() || 'none'}
                    onValueChange={(v) => handleChange('assigned_to', v === 'none' ? undefined : parseInt(v))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Sin asignar" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sin asignar</SelectItem>
                      {employees.map((emp) => (
                        <SelectItem key={emp.id} value={emp.id.toString()}>
                          {emp.full_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="occurred_at">Fecha y hora del incidente</Label>
                  <Input
                    id="occurred_at"
                    type="datetime-local"
                    value={formData.occurred_at || ''}
                    onChange={(e) => handleChange('occurred_at', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sla_hours">SLA (horas)</Label>
                  <Input
                    id="sla_hours"
                    type="number"
                    min="1"
                    value={formData.sla_hours || ''}
                    onChange={(e) => handleChange('sla_hours', e.target.value ? parseInt(e.target.value) : undefined)}
                    placeholder="Ej: 24"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Descripción</Label>
                <Textarea
                  id="description"
                  value={formData.description || ''}
                  onChange={(e) => handleChange('description', e.target.value)}
                  placeholder="Detalle del incidente..."
                  rows={3}
                />
              </div>
            </TabsContent>

            {/* Tab Ubicación */}
            <TabsContent value="ubicacion" className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 mb-4">
                <MapPin className="h-4 w-4" />
                Ubicación del incidente
              </div>

              <div className="space-y-2">
                <Label htmlFor="location_description">Descripción de ubicación</Label>
                <Input
                  id="location_description"
                  value={formData.location_description || ''}
                  onChange={(e) => handleChange('location_description', e.target.value)}
                  placeholder="Ej: Km 45, Autopista Norte"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="latitude">Latitud</Label>
                  <Input
                    id="latitude"
                    type="number"
                    step="any"
                    value={formData.latitude || ''}
                    onChange={(e) => handleChange('latitude', e.target.value ? parseFloat(e.target.value) : undefined)}
                    placeholder="Ej: 4.7110"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="longitude">Longitud</Label>
                  <Input
                    id="longitude"
                    type="number"
                    step="any"
                    value={formData.longitude || ''}
                    onChange={(e) => handleChange('longitude', e.target.value ? parseFloat(e.target.value) : undefined)}
                    placeholder="Ej: -74.0721"
                  />
                </div>
              </div>
            </TabsContent>

            {/* Tab Costos */}
            <TabsContent value="costos" className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 mb-4">
                <DollarSign className="h-4 w-4" />
                Costos asociados al incidente
              </div>

              <div className="space-y-2">
                <Label>Moneda</Label>
                <Select
                  value={formData.currency || 'COP'}
                  onValueChange={(v) => handleChange('currency', v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="COP">COP - Peso Colombiano</SelectItem>
                    <SelectItem value="USD">USD - Dólar</SelectItem>
                    <SelectItem value="EUR">EUR - Euro</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="estimated_cost">Costo estimado</Label>
                  <Input
                    id="estimated_cost"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.estimated_cost || 0}
                    onChange={(e) => handleChange('estimated_cost', parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="actual_cost">Costo real</Label>
                  <Input
                    id="actual_cost"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.actual_cost || 0}
                    onChange={(e) => handleChange('actual_cost', parseFloat(e.target.value) || 0)}
                  />
                </div>
              </div>
            </TabsContent>

            {/* Tab Notas */}
            <TabsContent value="notas" className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 mb-4">
                <FileText className="h-4 w-4" />
                Notas y observaciones
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notas</Label>
                <Textarea
                  id="notes"
                  value={formData.notes || ''}
                  onChange={(e) => handleChange('notes', e.target.value)}
                  placeholder="Notas adicionales, evidencias, seguimiento..."
                  rows={6}
                />
              </div>
            </TabsContent>
          </Tabs>

          <div className="flex justify-end gap-3 pt-4 border-t dark:border-gray-700">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading || !formData.title || !formData.reference_id}>
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Guardando...
                </>
              ) : (
                incident ? 'Guardar cambios' : 'Crear incidente'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default IncidentDialog;
