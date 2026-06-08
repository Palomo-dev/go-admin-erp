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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';

interface ConfirmOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  estimatedMinutes: number;
  onEstimatedMinutesChange: (minutes: number) => void;
  onConfirm: () => void;
  isLoading?: boolean;
}

export function ConfirmOrderDialog({
  open,
  onOpenChange,
  estimatedMinutes,
  onEstimatedMinutesChange,
  onConfirm,
  isLoading = false,
}: ConfirmOrderDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="dark:text-gray-100">Confirmar pedido</DialogTitle>
          <DialogDescription className="dark:text-gray-400">
            Indica el tiempo estimado de preparación para notificar al cliente.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Label htmlFor="estimated-time" className="dark:text-gray-200">Tiempo estimado (minutos)</Label>
          <Input
            id="estimated-time"
            type="number"
            value={estimatedMinutes}
            onChange={(e) => onEstimatedMinutesChange(Number(e.target.value))}
            min={5}
            max={120}
            className="mt-2"
          />
          <p className="text-sm text-muted-foreground dark:text-gray-400 mt-2">
            El cliente recibirá una notificación con este tiempo estimado.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="dark:border-gray-600">
            Cancelar
          </Button>
          <Button onClick={onConfirm} disabled={isLoading}>
            {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Confirmar pedido
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
