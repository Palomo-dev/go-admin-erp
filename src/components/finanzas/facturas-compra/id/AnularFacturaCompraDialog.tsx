'use client';

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, AlertTriangle } from 'lucide-react';
import { formatCurrency } from '@/utils/Utils';
import { FacturasCompraService } from '../FacturasCompraService';
import { InvoicePurchase } from '../types';

interface AnularFacturaCompraDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  factura: InvoicePurchase | null;
  onSuccess?: () => void;
}

/**
 * Diálogo para anular una factura de compra.
 *
 * Ejecuta el RPC `fn_void_purchase_invoice`, que:
 * - Bloquea si la factura tiene pagos registrados.
 * - Reversa el inventario recibido (salida de stock) si status='received'.
 * - Salda la cuenta por pagar (balance = 0).
 * - Crea asiento de reversa (débito 2105 / crédito 1405) solo si existe asiento de compra.
 * - Marca la factura como anulada (status='void').
 */
export function AnularFacturaCompraDialog({
  open,
  onOpenChange,
  factura,
  onSuccess,
}: AnularFacturaCompraDialogProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [motivo, setMotivo] = useState('');

  const total = Number(factura?.total) || 0;
  const balance = Number(factura?.balance) || 0;
  const tienePagos = total > 0 && balance < total;

  const handleSubmit = async () => {
    if (!factura) return;
    if (!motivo.trim()) {
      toast({
        title: 'Error',
        description: 'Debe ingresar un motivo para la anulación',
        variant: 'destructive',
      });
      return;
    }
    if (tienePagos) {
      toast({
        title: 'No se puede anular',
        description: 'La factura ya tiene pagos registrados.',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    try {
      await FacturasCompraService.anularFactura(factura.id, motivo.trim());
      toast({
        title: 'Factura anulada',
        description: `La factura ${factura.number_ext} fue anulada correctamente.`,
      });
      onOpenChange(false);
      setMotivo('');
      if (onSuccess) onSuccess();
    } catch (error: any) {
      console.error('Error al anular la factura de compra:', error);
      toast({
        title: 'Error',
        description: `No se pudo anular la factura: ${error?.message || 'Error desconocido'}`,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-gray-900 dark:text-gray-100">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            Anular Factura {factura?.number_ext}
          </DialogTitle>
          <DialogDescription className="dark:text-gray-400">
            Esta acción marca la factura como anulada, reversa el inventario recibido y salda la cuenta por pagar. No se puede deshacer.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-2">
          {tienePagos && (
            <div className="rounded-md border border-yellow-300 bg-yellow-50 dark:border-yellow-700 dark:bg-yellow-900/30 p-3 text-sm text-yellow-800 dark:text-yellow-200">
              La factura ya tiene pagos registrados ({formatCurrency(total - balance)}). No puede anularse.
            </div>
          )}

          <div className="grid gap-1.5">
            <Label htmlFor="motivoAnulacionCompra" className="text-gray-700 dark:text-gray-300">
              Motivo de la anulación
            </Label>
            <Textarea
              id="motivoAnulacionCompra"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Explica por qué se anula esta factura..."
              rows={3}
              className="dark:bg-gray-900 dark:border-gray-600"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
            className="dark:border-gray-600 dark:text-gray-300"
          >
            Cancelar
          </Button>
          <Button variant="destructive" onClick={handleSubmit} disabled={isLoading || tienePagos}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Anular Factura
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
