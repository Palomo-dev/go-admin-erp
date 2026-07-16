'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Receipt, Send, Clock, Split, DollarSign, UserCircle } from 'lucide-react';
import { formatCurrency } from '@/utils/Utils';
import { CustomerSelector, type OccupiedSpace } from '@/components/pos/CustomerSelector';
import type { Customer } from '@/components/pos/types';
import type { BillSplit } from '@/components/pos/mesas/id/SplitBillDialog';
import { MesaTaxBreakdown } from './MesaTaxBreakdown';
import type { MesaTaxItem } from '@/hooks/useMesaTaxes';

interface MesaActionsSidebarProps {
  selectedCustomer?: Customer;
  selectedRoom?: OccupiedSpace;
  onCustomerSelect: (customer?: Customer, room?: OccupiedSpace) => void;

  subtotal: number;
  taxes: number;
  total: number;

  itemsCount: number;
  sessionStatus?: string;
  customers: number;

  billSplits: BillSplit[] | null;
  unassignedItemsCount: number;
  unassignedItemsTotal: number;

  taxItems: MesaTaxItem[];
  onTaxTotalsChange?: (totals: { subtotal: number; taxTotal: number; total: number; taxIncluded: boolean }) => void;

  onEnviarComanda: () => void;
  onGenerarPreCuenta: () => void;
  onSolicitarCuenta: () => void;
  onOpenSplitBill: () => void;
  onCancelSplit: () => void;
  onCheckout: () => void;
}

export function MesaActionsSidebar({
  selectedCustomer,
  selectedRoom,
  onCustomerSelect,
  subtotal,
  taxes,
  total,
  itemsCount,
  sessionStatus,
  customers,
  billSplits,
  unassignedItemsCount,
  unassignedItemsTotal,
  taxItems,
  onTaxTotalsChange,
  onEnviarComanda,
  onGenerarPreCuenta,
  onSolicitarCuenta,
  onOpenSplitBill,
  onCancelSplit,
  onCheckout,
}: MesaActionsSidebarProps) {
  return (
    <div className="lg:col-span-1 space-y-4">
      {/* Cliente */}
      <Card className="overflow-hidden">
        <div className="bg-gradient-to-r from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 px-4 py-3 border-b border-purple-200 dark:border-purple-800">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <UserCircle className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            Cliente
          </h3>
        </div>
        <div className="p-2 sm:p-3 pt-0">
          <CustomerSelector
            onCustomerSelect={onCustomerSelect}
            selectedCustomer={selectedCustomer}
            selectedRoom={selectedRoom}
          />
        </div>
      </Card>

      {/* Resumen de Cuenta */}
      <Card className="overflow-hidden lg:sticky lg:top-24">
        <div className="bg-gradient-to-r from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 px-4 py-3 border-b border-blue-200 dark:border-blue-800">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Receipt className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            Resumen de Cuenta
          </h3>
        </div>
        <div className="p-4 space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">Subtotal</span>
              <span className="font-medium text-gray-900 dark:text-gray-100">
                {formatCurrency(subtotal)}
              </span>
            </div>
            <MesaTaxBreakdown
              items={taxItems}
              onTotalsChange={onTaxTotalsChange}
            />
            <Separator />
            <div className="flex justify-between text-lg font-bold">
              <span className="text-gray-900 dark:text-gray-100">Total</span>
              <span className="text-blue-600 dark:text-blue-400">
                {formatCurrency(total)}
              </span>
            </div>
          </div>

          <Separator />

          {/* Acciones */}
          <div className="space-y-2">
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={onEnviarComanda}
              disabled={!itemsCount}
            >
              <Send className="h-4 w-4 mr-2" />
              Enviar a Cocina
            </Button>

            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={onGenerarPreCuenta}
              disabled={!itemsCount}
            >
              <Receipt className="h-4 w-4 mr-2" />
              Ver Pre-Cuenta
            </Button>

            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={onSolicitarCuenta}
              disabled={sessionStatus === 'bill_requested' || !itemsCount}
            >
              <Clock className="h-4 w-4 mr-2" />
              Solicitar Cuenta
            </Button>

            <Separator />

            {/* Dividir Cuenta */}
            {!billSplits ? (
              <Button
                variant="outline"
                className="w-full justify-start border-blue-300 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950"
                onClick={onOpenSplitBill}
                disabled={!itemsCount || customers < 2}
              >
                <Split className="h-4 w-4 mr-2" />
                Dividir Cuenta ({customers} comensales)
              </Button>
            ) : (
              <div className="space-y-2">
                <div className="p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-blue-900 dark:text-blue-100">
                      ✓ Cuenta dividida en {billSplits.filter((s) => s.total > 0).length} partes
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={onCancelSplit}
                      className="h-7 text-xs"
                    >
                      Cancelar división
                    </Button>
                  </div>
                  {billSplits
                    .filter((split) => split.total > 0)
                    .map((split) => (
                      <div key={split.id} className="flex justify-between text-sm py-1">
                        <span className="text-gray-700 dark:text-gray-300">{split.name}:</span>
                        <span className="font-semibold text-blue-600">{formatCurrency(split.total)}</span>
                      </div>
                    ))}
                </div>

                {/* Alerta de items sin asignar */}
                {unassignedItemsCount > 0 && (
                  <div className="p-3 bg-orange-50 dark:bg-orange-950/30 border border-orange-300 dark:border-orange-800 rounded-lg">
                    <div className="flex items-start gap-2">
                      <div className="text-orange-600 dark:text-orange-400 mt-0.5">⚠️</div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-orange-900 dark:text-orange-100">
                          {unassignedItemsCount} producto(s) sin asignar
                        </p>
                        <p className="text-xs text-orange-700 dark:text-orange-300 mt-1">
                          Total: {formatCurrency(unassignedItemsTotal)}
                        </p>
                        <p className="text-xs text-orange-600 dark:text-orange-400 mt-1">
                          Divide la cuenta nuevamente para incluirlos
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <Button
                  variant={unassignedItemsCount > 0 ? 'default' : 'outline'}
                  size="sm"
                  onClick={onOpenSplitBill}
                  className={`w-full text-xs ${unassignedItemsCount > 0 ? 'bg-orange-600 hover:bg-orange-700 text-white animate-pulse' : ''}`}
                >
                  {unassignedItemsCount > 0
                    ? '⚠️ Dividir de Nuevo (REQUERIDO)'
                    : 'Modificar división'}
                </Button>
              </div>
            )}

            <Separator />

            <Button
              onClick={onCheckout}
              disabled={!itemsCount || (!!billSplits && unassignedItemsCount > 0)}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold text-base py-6 disabled:opacity-50"
              size="lg"
            >
              <DollarSign className="h-5 w-5 mr-2" />
              {billSplits
                ? unassignedItemsCount > 0
                  ? 'Divide de Nuevo para Continuar'
                  : 'Procesar Pagos Divididos'
                : 'Procesar Pago'}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
