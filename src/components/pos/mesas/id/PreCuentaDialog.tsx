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
import { ElectronicInvoiceToggle } from '@/components/finanzas/facturacion-electronica';

interface PreCuentaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preCuenta: PreCuenta | null;
  tableName: string;
  onPrint?: () => void;
  onGenerateBill?: (sendToFactus?: boolean) => void;
  onSplitBill?: () => void;
  customers?: number;
  showEInvoiceOption?: boolean;
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
  showEInvoiceOption = true,
}: PreCuentaDialogProps) {
  const [sendToFactus, setSendToFactus] = React.useState(false);
  
  if (!preCuenta) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-xl lg:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 shrink-0">
              <Receipt className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <span>Pre-Cuenta - {tableName}</span>
              <p className="text-sm font-normal text-gray-500 dark:text-gray-400 mt-0.5">
                {preCuenta.items.length} productos
              </p>
            </div>
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
                <div className="flex justify-between items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 dark:text-gray-100 truncate">
                      {item.product?.name || 'Producto'}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {item.quantity} × {formatCurrency(Number(item.unit_price))}
                    </p>
                    {item.notes && (
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 truncate">
                        📝 {typeof item.notes === 'object' ? (item.notes as any)?.extra : item.notes}
                      </p>
                    )}
                  </div>
                  <p className="font-semibold text-gray-900 dark:text-gray-100 shrink-0 text-right">
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

          {/* Opción de Factura Electrónica */}
          {showEInvoiceOption && (
            <Card className="p-3 bg-gray-50 dark:bg-gray-800/50">
              <ElectronicInvoiceToggle
                checked={sendToFactus}
                onCheckedChange={setSendToFactus}
                showLabel={true}
                showTooltip={true}
                size="md"
              />
            </Card>
          )}
        </div>

        <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-between pt-4">
          <div className="flex flex-wrap gap-2">
            {onPrint && (
              <Button variant="outline" size="sm" onClick={onPrint}>
                <Printer className="h-4 w-4 mr-1.5" />
                Imprimir
              </Button>
            )}
            {onSplitBill && customers > 1 && (
              <Button variant="outline" size="sm" onClick={onSplitBill}>
                <Split className="h-4 w-4 mr-1.5" />
                Dividir Cuenta
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Cerrar
            </Button>
          </div>
          {onGenerateBill && (
            <Button onClick={() => onGenerateBill(sendToFactus)} className="w-full sm:w-auto">
              <Receipt className="h-4 w-4 mr-1.5" />
              Procesar Pago
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
