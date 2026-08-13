'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Package, AlertCircle, CheckCircle2, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { serialTrackingService, type SerialNumber } from '@/lib/services/serialTrackingService';
import type { CartItem } from '@/components/pos/types';

interface SerialSelectorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: CartItem[];
  organizationId: number;
  branchId: number;
  onConfirm: (selections: Record<number, number[]>) => void;
}

interface ProductSerialState {
  available: SerialNumber[];
  selected: number[];
  loading: boolean;
  error: string;
}

export function SerialSelectorDialog({
  open,
  onOpenChange,
  items,
  organizationId,
  branchId,
  onConfirm,
}: SerialSelectorDialogProps) {
  const [serialStates, setSerialStates] = useState<Record<number, ProductSerialState>>({});
  const [searchTerm, setSearchTerm] = useState<string>('');

  const serializedItems = items.filter(
    (item) => item.product?.track_serial === true
  );

  const loadSerials = useCallback(async () => {
    const newStates: Record<number, ProductSerialState> = {};
    for (const item of serializedItems) {
      newStates[item.product_id] = {
        available: [],
        selected: [],
        loading: true,
        error: '',
      };
    }
    setSerialStates(newStates);

    for (const item of serializedItems) {
      try {
        const serials = await serialTrackingService.getAvailableSerials(
          item.product_id,
          organizationId,
          branchId
        );
        setSerialStates((prev) => ({
          ...prev,
          [item.product_id]: {
            available: serials,
            selected: [],
            loading: false,
            error: '',
          },
        }));
      } catch (err: any) {
        setSerialStates((prev) => ({
          ...prev,
          [item.product_id]: {
            available: [],
            selected: [],
            loading: false,
            error: err?.message || 'Error cargando seriales',
          },
        }));
      }
    }
  }, [serializedItems, organizationId, branchId]);

  useEffect(() => {
    if (open && serializedItems.length > 0) {
      loadSerials();
    }
  }, [open]);

  const handleToggleSerial = (productId: number, serialId: number, requiredQty: number) => {
    setSerialStates((prev) => {
      const state = prev[productId];
      if (!state) return prev;

      const isSelected = state.selected.includes(serialId);
      let newSelected: number[];

      if (isSelected) {
        newSelected = state.selected.filter((id) => id !== serialId);
      } else {
        if (state.selected.length >= requiredQty) return prev;
        newSelected = [...state.selected, serialId];
      }

      return {
        ...prev,
        [productId]: {
          ...state,
          selected: newSelected,
        },
      };
    });
  };

  const handleConfirm = () => {
    const selections: Record<number, number[]> = {};
    for (const item of serializedItems) {
      const state = serialStates[item.product_id];
      if (state && state.selected.length === item.quantity) {
        selections[item.product_id] = state.selected;
      }
    }
    onConfirm(selections);
    onOpenChange(false);
  };

  const allComplete = serializedItems.every(
    (item) =>
      serialStates[item.product_id]?.selected.length === item.quantity
  );

  if (serializedItems.length === 0) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white dark:bg-gray-800 border dark:border-gray-700 max-w-2xl">
        <DialogHeader>
          <DialogTitle className="dark:text-white flex items-center gap-2">
            <Package className="h-5 w-5 text-blue-600" />
            Selección de Seriales
          </DialogTitle>
          <DialogDescription className="dark:text-gray-400">
            Selecciona los seriales para los productos que requieren tracking individual.
            Total: {serializedItems.length} producto(s) serializado(s).
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[500px] pr-4">
          <div className="space-y-4">
            {serializedItems.map((item) => {
              const state = serialStates[item.product_id];
              const requiredQty = item.quantity;
              const selectedCount = state?.selected.length ?? 0;
              const isComplete = selectedCount === requiredQty;

              return (
                <div
                  key={item.id}
                  className={`p-4 rounded-lg border transition-colors ${
                    isComplete
                      ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20'
                      : 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 dark:text-white break-words">
                        {item.product?.name}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        SKU: {item.product?.sku} · Cantidad: {requiredQty}
                      </p>
                    </div>
                    <Badge
                      className={
                        isComplete
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400'
                      }
                    >
                      {selectedCount}/{requiredQty}
                    </Badge>
                  </div>

                  {state?.loading && (
                    <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 py-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Cargando seriales disponibles...
                    </div>
                  )}

                  {state?.error && (
                    <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 py-2">
                      <AlertCircle className="h-4 w-4" />
                      {state.error}
                    </div>
                  )}

                  {!state?.loading && !state?.error && state && (
                    <>
                      {state.available.length === 0 ? (
                        <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 py-2">
                          <AlertCircle className="h-4 w-4" />
                          No hay seriales disponibles en stock para este producto.
                        </div>
                      ) : (
                        <>
                          <div className="relative mb-2">
                            <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
                            <Input
                              placeholder="Buscar serial..."
                              value={searchTerm}
                              onChange={(e) => setSearchTerm(e.target.value)}
                              className="pl-8 h-9 dark:bg-gray-800 dark:border-gray-700"
                            />
                          </div>
                          <div className="space-y-1 max-h-[200px] overflow-y-auto">
                            {state.available
                              .filter((s) =>
                                searchTerm
                                  ? s.serial.toLowerCase().includes(searchTerm.toLowerCase())
                                  : true
                              )
                              .map((serial) => {
                                const isSelected = state.selected.includes(serial.id);
                                return (
                                  <div
                                    key={serial.id}
                                    onClick={() =>
                                      handleToggleSerial(item.product_id, serial.id, requiredQty)
                                    }
                                    className={`flex items-center gap-3 p-2 rounded-md cursor-pointer transition-colors ${
                                      isSelected
                                        ? 'bg-blue-100 dark:bg-blue-900/30 border border-blue-300 dark:border-blue-700'
                                        : 'hover:bg-gray-100 dark:hover:bg-gray-800 border border-transparent'
                                    }`}
                                  >
                                    <div
                                      className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 ${
                                        isSelected
                                          ? 'bg-blue-600 border-blue-600'
                                          : 'border-gray-300 dark:border-gray-600'
                                      }`}
                                    >
                                      {isSelected && (
                                        <CheckCircle2 className="h-4 w-4 text-white" />
                                      )}
                                    </div>
                                    <span className="text-sm font-mono text-gray-900 dark:text-white">
                                      {serial.serial}
                                    </span>
                                    {serial.warranty_end && (
                                      <Badge variant="outline" className="text-xs ml-auto">
                                        Garantía hasta: {serial.warranty_end}
                                      </Badge>
                                    )}
                                  </div>
                                );
                              })}
                          </div>
                          {state.available.length < requiredQty && (
                            <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 mt-2">
                              <AlertCircle className="h-4 w-4" />
                              Solo hay {state.available.length} serial(es) disponible(s) pero se
                              requieren {requiredQty}.
                            </div>
                          )}
                        </>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>

        <DialogFooter className="border-t dark:border-gray-700 pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!allComplete}
            className="bg-blue-600 hover:bg-blue-700"
          >
            Confirmar Seriales
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
