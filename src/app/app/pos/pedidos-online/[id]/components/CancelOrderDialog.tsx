'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import type { WebOrderStatus } from '@/lib/services/webOrdersService';

interface CancelOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderStatus: WebOrderStatus;
  reason: string;
  onReasonChange: (reason: string) => void;
  onConfirm: () => void;
  isLoading?: boolean;
}

export function CancelOrderDialog({
  open,
  onOpenChange,
  orderStatus,
  reason,
  onReasonChange,
  onConfirm,
  isLoading = false,
}: CancelOrderDialogProps) {
  const isReject = orderStatus === 'pending';
  const title = isReject ? 'Rechazar pedido' : 'Cancelar pedido';
  const buttonText = isReject ? 'Rechazar' : 'Cancelar pedido';

  const handleClose = () => {
    onReasonChange('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Indica el motivo. El cliente será notificado automáticamente.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Label htmlFor="cancel-reason">Motivo</Label>
          <Textarea
            id="cancel-reason"
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
            placeholder="Ej: Producto agotado, fuera de horario de entrega..."
            className="mt-2"
            rows={3}
          />
          <p className="text-sm text-muted-foreground mt-2">
            Este motivo se mostrará al cliente en su notificación.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Volver
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={isLoading || !reason.trim()}
          >
            {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {buttonText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
