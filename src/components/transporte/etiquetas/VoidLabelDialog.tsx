'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2, Ban, AlertTriangle } from 'lucide-react';
import type { LabelWithDetails } from '@/lib/services/labelsService';

interface VoidLabelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  label: LabelWithDetails | null;
  onConfirm: (labelId: string, reason: string) => Promise<void>;
  isLoading?: boolean;
}

export function VoidLabelDialog({
  open,
  onOpenChange,
  label,
  onConfirm,
  isLoading = false,
}: VoidLabelDialogProps) {
  const [reason, setReason] = useState('');

  const handleConfirm = async () => {
    if (!label || !reason.trim()) return;
    await onConfirm(label.id, reason);
    setReason('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <Ban className="h-5 w-5" />
            Anular Etiqueta
          </DialogTitle>
          <DialogDescription>
            Esta acción no se puede deshacer. La etiqueta quedará marcada como anulada.
          </DialogDescription>
        </DialogHeader>

        {label && (
          <div className="space-y-4">
            <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-red-800 dark:text-red-300">
                  Etiqueta: {label.label_number}
                </p>
                <p className="text-red-600 dark:text-red-400">
                  Envío: {label.shipments?.shipment_number || 'N/A'}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reason">Razón de anulación *</Label>
              <Textarea
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Indique el motivo de la anulación..."
                rows={3}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={isLoading || !reason.trim()}
          >
            {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Anular Etiqueta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default VoidLabelDialog;
