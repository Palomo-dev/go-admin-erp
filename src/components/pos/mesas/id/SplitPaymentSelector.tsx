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
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  Users, 
  CheckCircle, 
  Clock,
  DollarSign,
  X
} from 'lucide-react';
import { formatCurrency } from '@/utils/Utils';
import type { BillSplit } from './SplitBillDialog';

interface SplitPaymentSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  splits: BillSplit[];
  paidSplits: string[]; // IDs de splits ya pagados
  onSelectSplit: (splitId: string) => void;
  onFinishAndClose: () => void; // Cerrar mesa sin procesar todos
}

export function SplitPaymentSelector({
  open,
  onOpenChange,
  splits,
  paidSplits,
  onSelectSplit,
  onFinishAndClose
}: SplitPaymentSelectorProps) {
  // Filtrar splits válidos (permite división equitativa con items vacíos)
  const validSplits = splits.filter(s => s.total > 0);
  
  const pendingSplits = validSplits.filter(s => !paidSplits.includes(s.id));
  const completedSplits = validSplits.filter(s => paidSplits.includes(s.id));
  
  const totalPaid = completedSplits.reduce((sum, s) => sum + s.total, 0);
  const totalPending = pendingSplits.reduce((sum, s) => sum + s.total, 0);
  const totalAmount = validSplits.reduce((sum, s) => sum + s.total, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Users className="h-6 w-6 text-blue-600" />
            Seleccionar Pago
          </DialogTitle>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Elige qué comensal va a pagar ahora
          </p>
        </DialogHeader>

        {/* Resumen de pagos */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <Card className="p-3 bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <div>
                <p className="text-xs text-green-700 dark:text-green-300">Pagados</p>
                <p className="font-bold text-green-900 dark:text-green-100">
                  {completedSplits.length}
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-3 bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-800">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-orange-600" />
              <div>
                <p className="text-xs text-orange-700 dark:text-orange-300">Pendientes</p>
                <p className="font-bold text-orange-900 dark:text-orange-100">
                  {pendingSplits.length}
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-3 bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-blue-600" />
              <div>
                <p className="text-xs text-blue-700 dark:text-blue-300">Total Pagado</p>
                <p className="font-bold text-blue-900 dark:text-blue-100 text-sm">
                  {formatCurrency(totalPaid)}
                </p>
              </div>
            </div>
          </Card>
        </div>

        <Separator />

        {/* Lista de splits pendientes */}
        <div className="space-y-2 max-h-96 overflow-y-auto">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
            Pendientes de Pago
          </h3>
          
          {pendingSplits.length === 0 ? (
            <div className="text-center py-8">
              <CheckCircle className="h-12 w-12 text-green-600 mx-auto mb-2" />
              <p className="text-gray-600 dark:text-gray-400">
                ¡Todos los pagos completados!
              </p>
            </div>
          ) : (
            pendingSplits.map((split) => (
              <Card 
                key={split.id}
                className="p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer border-2 hover:border-blue-500"
                onClick={() => onSelectSplit(split.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                      <Users className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-gray-900 dark:text-gray-100">
                        {split.name}
                      </h4>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {split.items.length} items
                      </p>
                    </div>
                  </div>

                  <div className="text-right flex items-center gap-3">
                    <div>
                      <p className="text-xl font-bold text-blue-600">
                        {formatCurrency(split.total)}
                      </p>
                      <Badge variant="secondary" className="text-xs">
                        Pendiente
                      </Badge>
                    </div>
                    <Button
                      size="sm"
                      className="bg-blue-600 hover:bg-blue-700"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectSplit(split.id);
                      }}
                    >
                      Procesar
                    </Button>
                  </div>
                </div>

                {/* Lista de items */}
                <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                  <div className="flex flex-wrap gap-1">
                    {split.items.slice(0, 3).map((item, idx) => (
                      <Badge key={idx} variant="outline" className="text-xs">
                        {item.quantity}x {item.item.product?.name || 'Producto'}
                      </Badge>
                    ))}
                    {split.items.length > 3 && (
                      <Badge variant="outline" className="text-xs">
                        +{split.items.length - 3} más
                      </Badge>
                    )}
                  </div>
                </div>
              </Card>
            ))
          )}

          {/* Lista de splits pagados (colapsada) */}
          {completedSplits.length > 0 && (
            <>
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mt-4 mb-2">
                Ya Pagados
              </h3>
              {completedSplits.map((split) => (
                <Card 
                  key={split.id}
                  className="p-3 bg-gray-50 dark:bg-gray-900 opacity-60"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-5 w-5 text-green-600" />
                      <div>
                        <p className="font-medium text-sm text-gray-900 dark:text-gray-100">
                          {split.name}
                        </p>
                        <p className="text-xs text-gray-500">
                          {split.items.length} items
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-gray-700 dark:text-gray-300">
                        {formatCurrency(split.total)}
                      </p>
                      <Badge variant="default" className="text-xs bg-green-600">
                        Pagado
                      </Badge>
                    </div>
                  </div>
                </Card>
              ))}
            </>
          )}
        </div>

        <Separator />

        {/* Totales */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600 dark:text-gray-400">Total pagado:</span>
            <span className="font-semibold text-green-600">
              {formatCurrency(totalPaid)}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600 dark:text-gray-400">Pendiente:</span>
            <span className="font-semibold text-orange-600">
              {formatCurrency(totalPending)}
            </span>
          </div>
          <div className="flex justify-between text-base font-bold">
            <span>Total:</span>
            <span className="text-blue-600">{formatCurrency(totalAmount)}</span>
          </div>
        </div>

        <DialogFooter className="flex justify-between items-center">
          <div className="text-sm text-gray-500 dark:text-gray-400">
            {validSplits.length === 0 ? (
              'No hay comensales con items asignados'
            ) : pendingSplits.length > 0 ? (
              `${pendingSplits.length} pago${pendingSplits.length > 1 ? 's' : ''} pendiente${pendingSplits.length > 1 ? 's' : ''}`
            ) : (
              'Todos los pagos completados'
            )}
          </div>
          
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            
            {completedSplits.length > 0 && (
              <Button
                onClick={onFinishAndClose}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                Cerrar y Liberar Mesa
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
