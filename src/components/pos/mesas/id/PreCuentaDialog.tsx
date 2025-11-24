'use client';

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Printer, Receipt, Split } from 'lucide-react';
import { formatCurrency } from '@/utils/Utils';
import type { PreCuenta } from './types';

interface PreCuentaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preCuenta: PreCuenta | null;
  tableName: string;
  onPrint?: () => void;
  onGenerateBill?: () => void;
  onSplitBill?: () => void;
  customers?: number;
}

export function PreCuentaDialog({
  open,
  onOpenChange,
  preCuenta,
  tableName,
  onPrint,
  onGenerateBill,
  onSplitBill,
  customers = 1,
}: PreCuentaDialogProps) {
  if (!preCuenta) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            Pre-Cuenta - {tableName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Items */}
          <div className="space-y-2">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">
              Detalle del Pedido
            </h3>
            {preCuenta.items.map((item) => (
              <Card key={item.id} className="p-3">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <p className="font-medium text-gray-900 dark:text-gray-100">
                      {item.product?.name || 'Producto'}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {item.quantity} × {formatCurrency(Number(item.unit_price))}
                    </p>
                    {item.notes && (
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                        📝 {item.notes}
                      </p>
                    )}
                  </div>
                  <p className="font-semibold text-gray-900 dark:text-gray-100">
                    {formatCurrency(Number(item.total))}
                  </p>
                </div>
              </Card>
            ))}
          </div>

          <Separator />

          {/* Totales */}
          <div className="space-y-3">
            <div className="flex justify-between text-gray-700 dark:text-gray-300">
              <span>Subtotal:</span>
              <span className="font-medium">
                {formatCurrency(preCuenta.subtotal)}
              </span>
            </div>

            {preCuenta.discount_total > 0 && (
              <div className="flex justify-between text-green-600 dark:text-green-400">
                <span>Descuentos:</span>
                <span className="font-medium">
                  -{formatCurrency(preCuenta.discount_total)}
                </span>
              </div>
            )}

            {preCuenta.tax_total > 0 && (
              <div className="flex justify-between text-gray-700 dark:text-gray-300">
                <span>Impuestos:</span>
                <span className="font-medium">
                  {formatCurrency(preCuenta.tax_total)}
                </span>
              </div>
            )}

            <Separator />

            <div className="flex justify-between text-lg font-bold text-gray-900 dark:text-gray-100">
              <span>Total:</span>
              <span className="text-blue-600 dark:text-blue-400">
                {formatCurrency(preCuenta.total)}
              </span>
            </div>
          </div>

          {/* Info adicional */}
          <Card className="p-3 bg-blue-50 dark:bg-blue-950/20">
            <p className="text-sm text-gray-700 dark:text-gray-300">
              📅 {new Date().toLocaleString('es-CO', {
                dateStyle: 'short',
                timeStyle: 'short',
              })}
            </p>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              Esta es una pre-cuenta. El cobro se realizará al cerrar la mesa.
            </p>
          </Card>
        </div>

        <DialogFooter className="flex flex-col sm:flex-row gap-2">
          <div className="flex gap-2 flex-1">
            {onPrint && (
              <Button variant="outline" onClick={onPrint}>
                <Printer className="h-4 w-4 mr-2" />
                Imprimir
              </Button>
            )}
            {onSplitBill && customers > 1 && (
              <Button variant="outline" onClick={onSplitBill}>
                <Split className="h-4 w-4 mr-2" />
                Dividir Cuenta
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            {onGenerateBill && (
              <Button onClick={onGenerateBill}>
                <Receipt className="h-4 w-4 mr-2" />
                Procesar Pago
              </Button>
            )}
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cerrar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
