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
import { useTranslations } from 'next-intl';

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
  const t = useTranslations('pedidoWeb');
  const isReject = orderStatus === 'pending';
  const title = isReject ? t('cancelOrderDialog.rechazarPedido') : t('cancelOrderDialog.cancelarPedido');
  const buttonText = isReject ? t('cancelOrderDialog.rechazar') : t('cancelOrderDialog.cancelarPedido');

  const handleClose = () => {
    onReasonChange('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="dark:text-gray-100">{title}</DialogTitle>
          <DialogDescription className="dark:text-gray-400">
            {t('cancelOrderDialog.indicaMotivoClienteSera')}
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Label htmlFor="cancel-reason" className="dark:text-gray-200">{t('cancelOrderDialog.motivo')}</Label>
          <Textarea
            id="cancel-reason"
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
            placeholder={t('cancelOrderDialog.ejProductoAgotadoFuera')}
            className="mt-2"
            rows={3}
          />
          <p className="text-sm text-muted-foreground dark:text-gray-400 mt-2">
            {t('cancelOrderDialog.esteMotivoMostraraCliente')}
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose} className="dark:border-gray-600">
            {t('detalle.volver')}
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
