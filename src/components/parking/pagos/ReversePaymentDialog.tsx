'use client';

import React, { useState } from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2, AlertTriangle } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { formatCurrency } from '@/utils/Utils';
import parkingPaymentService, { type ParkingPayment } from '@/lib/services/parkingPaymentService';

interface ReversePaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payment: ParkingPayment | null;
  onSuccess: () => void;
}

export function ReversePaymentDialog({
  open,
  onOpenChange,
  payment,
  onSuccess,
}: ReversePaymentDialogProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [reason, setReason] = useState('');

  const handleReverse = async () => {
    if (!payment) return;

    setIsLoading(true);
    try {
      await parkingPaymentService.reversePayment(payment.id, reason);

      toast({
        title: 'Pago reversado',
        description: 'El pago ha sido reversado correctamente',
      });

      onSuccess();
      onOpenChange(false);
      setReason('');
    } catch (error) {
      console.error('Error reversing payment:', error);
      toast({
        title: 'Error',
        description: 'No se pudo reversar el pago',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!payment) return null;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="dark:bg-gray-800 dark:border-gray-700">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
            <AlertTriangle className="h-5 w-5" />
            Reversar Pago
          </AlertDialogTitle>
          <AlertDialogDescription className="dark:text-gray-400">
            ¿Está seguro que desea reversar este pago? Esta acción no se puede deshacer.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4 py-4">
          {/* Info del pago */}
          <div className="p-3 rounded-lg bg-gray-100 dark:bg-gray-900/50 space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-gray-500 dark:text-gray-400">Monto:</span>
              <span className="font-semibold text-gray-900 dark:text-white">
                {formatCurrency(payment.amount)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-500 dark:text-gray-400">Método:</span>
              <span className="text-gray-900 dark:text-white">{payment.method}</span>
            </div>
            {payment.reference && (
              <div className="flex justify-between">
                <span className="text-sm text-gray-500 dark:text-gray-400">Referencia:</span>
                <span className="text-gray-900 dark:text-white">{payment.reference}</span>
              </div>
            )}
          </div>

          {/* Razón */}
          <div className="space-y-2">
            <Label className="dark:text-gray-200">Motivo de la reversión *</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ingrese el motivo de la reversión..."
              rows={3}
              className="dark:bg-gray-700 dark:border-gray-600 resize-none"
            />
          </div>
        </div>

        <AlertDialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
            className="dark:border-gray-600"
          >
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={handleReverse}
            disabled={isLoading || !reason.trim()}
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Reversando...
              </>
            ) : (
              'Confirmar Reversión'
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default ReversePaymentDialog;
