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
import { supabase } from '@/lib/supabase/config';

interface AnularFacturaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  factura: any;
  onSuccess?: () => void;
}

/**
 * Diálogo para anular una factura de venta directamente (sin nota de crédito).
 *
 * - Fija status='voided' para que el trigger fn_auto_journal_void genere el
 *   asiento de reversión contable (solo si la factura tiene valor > 0).
 * - Salda accounts_receivable de la factura.
 * - Bloquea la anulación si la factura ya tiene pagos aplicados (en ese caso
 *   debe usarse una Nota de Crédito).
 */
export function AnularFacturaDialog({ open, onOpenChange, factura, onSuccess }: AnularFacturaDialogProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [motivo, setMotivo] = useState('');

  const total = Number(factura?.total) || 0;
  const balance = Number(factura?.balance) || 0;
  const tienePagos = total > 0 && balance < total;

  const handleSubmit = async () => {
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
        description: 'La factura ya tiene pagos aplicados. Usa una Nota de Crédito en su lugar.',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);

    try {
      const notaAnulacion = factura.notes
        ? `${factura.notes}\n\nANULADA: ${motivo}`
        : `ANULADA: ${motivo}`;

      // 1. Anular la factura (status='void' dispara la reversión contable si total > 0)
      const { error: invoiceError } = await supabase
        .from('invoice_sales')
        .update({
          status: 'void',
          balance: 0,
          notes: notaAnulacion,
          updated_at: new Date().toISOString(),
        })
        .eq('id', factura.id);

      if (invoiceError) throw invoiceError;

      // 2. Saldar cuentas por cobrar asociadas (si existen)
      const { error: arError } = await supabase
        .from('accounts_receivable')
        .update({
          balance: 0,
          status: 'paid',
          updated_at: new Date().toISOString(),
        })
        .eq('invoice_id', factura.id);

      if (arError) {
        console.error('Error al saldar cuentas por cobrar:', arError);
      }

      toast({
        title: 'Factura anulada',
        description: `La factura ${factura.number} fue anulada correctamente.`,
      });

      onOpenChange(false);
      setMotivo('');
      if (onSuccess) onSuccess();
    } catch (error: any) {
      console.error('Error al anular la factura:', error);
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
            Anular Factura {factura?.number}
          </DialogTitle>
          <DialogDescription className="dark:text-gray-400">
            Esta acción marca la factura como anulada y revierte su efecto contable y de cartera. No se puede deshacer.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-2">
          {tienePagos && (
            <div className="rounded-md border border-yellow-300 bg-yellow-50 dark:border-yellow-700 dark:bg-yellow-900/30 p-3 text-sm text-yellow-800 dark:text-yellow-200">
              La factura ya tiene pagos aplicados ({formatCurrency(total - balance)}). No puede anularse directamente; usa una Nota de Crédito.
            </div>
          )}

          <div className="grid gap-1.5">
            <Label htmlFor="motivoAnulacion" className="text-gray-700 dark:text-gray-300">
              Motivo de la anulación
            </Label>
            <Textarea
              id="motivoAnulacion"
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
          <Button
            variant="destructive"
            onClick={handleSubmit}
            disabled={isLoading || tienePagos}
          >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Anular Factura
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
