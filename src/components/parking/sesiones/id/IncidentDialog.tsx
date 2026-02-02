'use client';

import React, { useState } from 'react';
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

interface IncidentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  vehiclePlate: string;
  onSubmit: (data: {
    type: string;
    description: string;
    severity: string;
  }) => Promise<void>;
}

const incidentTypes = [
  { value: 'damage', label: 'Daño al vehículo' },
  { value: 'theft', label: 'Robo/Hurto' },
  { value: 'accident', label: 'Accidente' },
  { value: 'dispute', label: 'Disputa de cobro' },
  { value: 'lost_ticket', label: 'Ticket perdido' },
  { value: 'overstay', label: 'Exceso de tiempo' },
  { value: 'unauthorized', label: 'Vehículo no autorizado' },
  { value: 'other', label: 'Otro' },
];

const severityLevels = [
  { value: 'low', label: 'Baja', color: 'text-green-600' },
  { value: 'medium', label: 'Media', color: 'text-yellow-600' },
  { value: 'high', label: 'Alta', color: 'text-orange-600' },
  { value: 'critical', label: 'Crítica', color: 'text-red-600' },
];

export function IncidentDialog({
  open,
  onOpenChange,
  sessionId,
  vehiclePlate,
  onSubmit,
}: IncidentDialogProps) {
  const [type, setType] = useState('other');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState('medium');
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async () => {
    if (!description.trim()) return;

    setIsSaving(true);
    try {
      await onSubmit({
        type,
        description: description.trim(),
        severity,
      });
      onOpenChange(false);
      setType('other');
      setDescription('');
      setSeverity('medium');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-600" />
            Reportar Incidente
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
            <p className="text-sm text-gray-600 dark:text-gray-400">Vehículo</p>
            <p className="font-bold text-gray-900 dark:text-white">{vehiclePlate}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Sesión: {sessionId.substring(0, 8)}...
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="type">Tipo de Incidente</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {incidentTypes.map((it) => (
                  <SelectItem key={it.value} value={it.value}>
                    {it.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="severity">Severidad</Label>
            <Select value={severity} onValueChange={setSeverity}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {severityLevels.map((sl) => (
                  <SelectItem key={sl.value} value={sl.value}>
                    <span className={sl.color}>{sl.label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Descripción</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe el incidente con detalle..."
              className="min-h-[100px]"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSaving || !description.trim()}
            className="bg-yellow-600 hover:bg-yellow-700"
          >
            {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Reportar Incidente
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
