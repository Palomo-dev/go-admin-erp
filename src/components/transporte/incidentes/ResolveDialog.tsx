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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, CheckCircle } from 'lucide-react';

interface ResolveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  incidentTitle: string;
  onResolve: (data: { resolution_summary: string; root_cause: string; corrective_actions: string }) => Promise<void>;
  isLoading?: boolean;
}

export function ResolveDialog({
  open,
  onOpenChange,
  incidentTitle,
  onResolve,
  isLoading = false,
}: ResolveDialogProps) {
  const [resolutionSummary, setResolutionSummary] = useState('');
  const [rootCause, setRootCause] = useState('');
  const [correctiveActions, setCorrectiveActions] = useState('');

  const handleSubmit = async () => {
    await onResolve({
      resolution_summary: resolutionSummary,
      root_cause: rootCause,
      corrective_actions: correctiveActions,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-600" />
            Resolver Incidente
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Documentar resolución de: <strong>{incidentTitle}</strong>
          </p>

          <div className="space-y-2">
            <Label htmlFor="resolution_summary">Resumen de resolución *</Label>
            <Textarea
              id="resolution_summary"
              value={resolutionSummary}
              onChange={(e) => setResolutionSummary(e.target.value)}
              placeholder="Describa cómo se resolvió el incidente..."
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="root_cause">Causa raíz</Label>
            <Textarea
              id="root_cause"
              value={rootCause}
              onChange={(e) => setRootCause(e.target.value)}
              placeholder="¿Qué causó el incidente?"
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="corrective_actions">Acciones correctivas</Label>
            <Textarea
              id="corrective_actions"
              value={correctiveActions}
              onChange={(e) => setCorrectiveActions(e.target.value)}
              placeholder="¿Qué se hará para evitar que vuelva a ocurrir?"
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
            disabled={isLoading || !resolutionSummary}
            className="bg-green-600 hover:bg-green-700"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Guardando...
              </>
            ) : (
              <>
                <CheckCircle className="h-4 w-4 mr-2" />
                Marcar como Resuelto
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ResolveDialog;
