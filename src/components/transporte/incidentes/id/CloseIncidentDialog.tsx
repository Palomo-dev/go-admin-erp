'use client';

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, XCircle, Bell } from 'lucide-react';
import { IncidentWithDetails } from '@/lib/services/incidentsService';

interface CloseIncidentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  incident: IncidentWithDetails;
  onClose: (closureData: {
    resolution_summary?: string;
    root_cause?: string;
    corrective_actions?: string;
    notify: boolean;
  }) => Promise<void>;
}

export function CloseIncidentDialog({
  open,
  onOpenChange,
  incident,
  onClose,
}: CloseIncidentDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resolutionSummary, setResolutionSummary] = useState(incident.resolution_summary || '');
  const [rootCause, setRootCause] = useState(incident.root_cause || '');
  const [correctiveActions, setCorrectiveActions] = useState(incident.corrective_actions || '');
  const [notify, setNotify] = useState(true);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      await onClose({
        resolution_summary: resolutionSummary.trim() || undefined,
        root_cause: rootCause.trim() || undefined,
        corrective_actions: correctiveActions.trim() || undefined,
        notify,
      });
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <XCircle className="h-5 w-5 text-gray-600" />
            Cerrar Incidente
          </DialogTitle>
          <DialogDescription>
            Complete la información de cierre del incidente &quot;{incident.title}&quot;
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Resumen de resolución */}
          <div className="space-y-2">
            <Label htmlFor="resolution_summary">Resumen de resolución</Label>
            <Textarea
              id="resolution_summary"
              value={resolutionSummary}
              onChange={(e) => setResolutionSummary(e.target.value)}
              placeholder="Describe cómo se resolvió el incidente..."
              rows={3}
            />
          </div>

          {/* Causa raíz */}
          <div className="space-y-2">
            <Label htmlFor="root_cause">Causa raíz</Label>
            <Textarea
              id="root_cause"
              value={rootCause}
              onChange={(e) => setRootCause(e.target.value)}
              placeholder="¿Cuál fue la causa principal del incidente?"
              rows={2}
            />
          </div>

          {/* Acciones correctivas */}
          <div className="space-y-2">
            <Label htmlFor="corrective_actions">Acciones correctivas</Label>
            <Textarea
              id="corrective_actions"
              value={correctiveActions}
              onChange={(e) => setCorrectiveActions(e.target.value)}
              placeholder="¿Qué acciones se tomarán para prevenir incidentes similares?"
              rows={2}
            />
          </div>

          {/* Notificación */}
          <div className="flex items-center space-x-2 pt-2">
            <Checkbox
              id="notify"
              checked={notify}
              onCheckedChange={(checked) => setNotify(checked as boolean)}
            />
            <Label htmlFor="notify" className="flex items-center gap-2 cursor-pointer">
              <Bell className="h-4 w-4 text-gray-500" />
              Notificar al responsable asignado
            </Label>
          </div>

          {incident.assigned_user && notify && (
            <p className="text-sm text-gray-500 dark:text-gray-400 ml-6">
              Se notificará a: {incident.assigned_user.full_name}
              {incident.assigned_user.email && ` (${incident.assigned_user.email})`}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Cerrando...
              </>
            ) : (
              'Cerrar incidente'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
