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
      <DialogContent className="max-w-[100vw] sm:max-w-xl lg:max-w-2xl max-h-[95vh] sm:max-h-[90vh] overflow-y-auto p-3 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 sm:gap-3">
            <div className="flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 shrink-0">
              <Receipt className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-sm sm:text-lg truncate block">Pre-Cuenta - {tableName}</span>
              <p className="text-xs sm:text-sm font-normal text-gray-500 dark:text-gray-400 mt-0.5">
                {preCuenta.items.length} productos
              </p>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 sm:space-y-4">
          {/* Items */}
          <div className="space-y-1.5 sm:space-y-2">
            <h3 className="font-semibold text-sm sm:text-base text-gray-900 dark:text-gray-100">
              Detalle del Pedido
            </h3>
            {preCuenta.items.map((item) => (
              <div key={item.id} className="p-2 sm:p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                <div className="flex justify-between items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-gray-900 dark:text-gray-100 line-clamp-2">
                      {item.product?.name || 'Producto'}
                    </p>
                    <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                      {item.quantity} × {formatCurrency(Number(item.unit_price))}
                    </p>
                    {typeof item.notes === 'object' && (item.notes as any)?.guest_number && (
                      <p className="text-xs text-purple-700 dark:text-purple-400 mt-1">
                        👤 Comensal {(item.notes as any).guest_number}
                      </p>
                    )}
                    {(typeof item.notes === 'object' ? (item.notes as any)?.extra : item.notes) && (
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">
                        📝 {typeof item.notes === 'object' ? (item.notes as any)?.extra : item.notes}
                      </p>
                    )}
                  </div>
                  <p className="font-semibold text-sm text-gray-900 dark:text-gray-100 shrink-0 text-right whitespace-nowrap">
                    {formatCurrency(Number(item.total))}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <Separator />

          {/* Totales */}
          <div className="space-y-2 sm:space-y-3 px-1">
            <div className="flex justify-between text-sm text-gray-700 dark:text-gray-300">
              <span>Subtotal:</span>
              <span className="font-medium">
                {formatCurrency(preCuenta.subtotal)}
              </span>
            </div>

            {preCuenta.discount_total > 0 && (
              <div className="flex justify-between text-sm text-green-600 dark:text-green-400">
                <span>Descuentos:</span>
                <span className="font-medium">
                  -{formatCurrency(preCuenta.discount_total)}
                </span>
              </div>
            )}

            {preCuenta.tax_total > 0 && (
              <div className="flex justify-between text-sm text-gray-700 dark:text-gray-300">
                <span>Impuestos:</span>
                <span className="font-medium">
                  {formatCurrency(preCuenta.tax_total)}
                </span>
              </div>
            )}

            <Separator />

            <div className="flex justify-between text-base sm:text-lg font-bold text-gray-900 dark:text-gray-100">
              <span>Total:</span>
              <span className="text-blue-600 dark:text-blue-400">
                {formatCurrency(preCuenta.total)}
              </span>
            </div>
          </div>

          {/* Info adicional */}
          <div className="p-2 sm:p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20">
            <p className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">
              📅 {new Date().toLocaleString('es-CO', {
                dateStyle: 'short',
                timeStyle: 'short',
              })}
            </p>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              Esta es una pre-cuenta. El cobro se realizará al cerrar la mesa.
            </p>
          </div>

          {/* Opción de Factura Electrónica */}
          {showEInvoiceOption && (
            <div className="p-2 sm:p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50">
              <ElectronicInvoiceToggle
                checked={sendToFactus}
                onCheckedChange={setSendToFactus}
                showLabel={true}
                showTooltip={true}
                size="md"
              />
            </div>
          )}
        </div>

        <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-between pt-3 sm:pt-4">
          <div className="flex flex-wrap gap-2">
            {onPrint && (
              <Button variant="outline" size="sm" onClick={onPrint} className="text-xs h-8 sm:h-9">
                <Printer className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5" />
                Imprimir
              </Button>
            )}
            {onSplitBill && customers > 1 && (
              <Button variant="outline" size="sm" onClick={onSplitBill} className="text-xs h-8 sm:h-9">
                <Split className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5" />
                Dividir Cuenta
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} className="text-xs h-8 sm:h-9">
              Cerrar
            </Button>
          </div>
          {onGenerateBill && (
            <Button onClick={() => onGenerateBill(sendToFactus)} className="w-full sm:w-auto text-sm h-9 sm:h-10">
              <Receipt className="h-4 w-4 mr-1.5" />
              Procesar Pago
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
