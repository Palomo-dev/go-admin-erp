'use client';

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Users, 
  Split, 
  DollarSign, 
  Calculator,
  CheckCircle,
  X,
  Percent
} from 'lucide-react';
import { formatCurrency } from '@/utils/Utils';
import type { SaleItem } from './types';

interface SplitBillDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: SaleItem[];
  total: number;
  comensales: number;
  onConfirmSplit: (splits: BillSplit[]) => void;
}

export interface BillSplit {
  id: string;
  name: string;
  items: Array<{
    item: SaleItem;
    quantity: number;
  }>;
  total: number;
}

export function SplitBillDialog({
  open,
  onOpenChange,
  items,
  total,
  comensales,
  onConfirmSplit
}: SplitBillDialogProps) {
  const [splitMode, setSplitMode] = useState<'items' | 'equal' | 'custom'>('items');
  const [splits, setSplits] = useState<BillSplit[]>([]);
  const [currentSplit, setCurrentSplit] = useState(0);
  const [selectedItems, setSelectedItems] = useState<{[key: string]: {[splitId: string]: number}}>({});

  // Inicializar splits basado en comensales
  useEffect(() => {
    if (open) {
      const initialSplits: BillSplit[] = Array.from({ length: comensales }, (_, i) => ({
        id: `split-${i + 1}`,
        name: `Comensal ${i + 1}`,
        items: [],
        total: 0
      }));
      setSplits(initialSplits);
      setSelectedItems({});
      setCurrentSplit(0);
    }
  }, [open, comensales]);

  // Calcular totales de cada split
  useEffect(() => {
    const updatedSplits = splits.map(split => ({
      ...split,
      items: Object.entries(selectedItems)
        .filter(([_, splitQty]) => splitQty[split.id] > 0)
        .map(([itemId, splitQty]) => {
          const item = items.find(i => i.id === itemId);
          return item ? {
            item,
            quantity: splitQty[split.id]
          } : null;
        })
        .filter(Boolean) as Array<{item: SaleItem; quantity: number}>,
      total: Object.entries(selectedItems)
        .filter(([_, splitQty]) => splitQty[split.id] > 0)
        .reduce((sum, [itemId, splitQty]) => {
          const item = items.find(i => i.id === itemId);
          if (!item) return sum;
          const pricePerUnit = Number(item.total) / Number(item.quantity);
          return sum + (pricePerUnit * splitQty[split.id]);
        }, 0)
    }));
    setSplits(updatedSplits);
  }, [selectedItems, items]);

  const handleAssignItem = (itemId: string, quantity: number) => {
    const item = items.find(i => i.id === itemId);
    if (!item) return;

    const currentSplitId = splits[currentSplit].id;
    const totalAssigned = Object.values(selectedItems[itemId] || {}).reduce((sum, qty) => sum + qty, 0);
    const available = Number(item.quantity) - totalAssigned;

    if (quantity > available) {
      quantity = available;
    }

    setSelectedItems(prev => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        [currentSplitId]: quantity
      }
    }));
  };

  const handleSplitEqually = () => {
    const perPerson = total / splits.length;
    const equalSplits: BillSplit[] = splits.map((split, i) => ({
      ...split,
      items: [],
      total: perPerson
    }));
    setSplits(equalSplits);
    setSplitMode('equal');
  };

  const getTotalAssigned = () => {
    return splits.reduce((sum, split) => sum + split.total, 0);
  };

  const getItemAssigned = (itemId: string) => {
    return Object.values(selectedItems[itemId] || {}).reduce((sum, qty) => sum + qty, 0);
  };

  const canConfirm = () => {
    if (splitMode === 'equal') return true;
    if (splitMode === 'items') {
      // Verificar que todos los items estén asignados
      return items.every(item => getItemAssigned(item.id) === Number(item.quantity));
    }
    return true;
  };

  const handleConfirm = () => {
    onConfirmSplit(splits);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Split className="h-6 w-6 text-blue-600" />
            Dividir Cuenta
          </DialogTitle>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Total a dividir: <span className="font-bold text-lg">{formatCurrency(total)}</span>
          </p>
        </DialogHeader>

        <Tabs value={splitMode} onValueChange={(v) => setSplitMode(v as any)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="items">
              <Split className="h-4 w-4 mr-2" />
              Por Items
            </TabsTrigger>
            <TabsTrigger value="equal">
              <Users className="h-4 w-4 mr-2" />
              Equitativo
            </TabsTrigger>
            <TabsTrigger value="custom">
              <Calculator className="h-4 w-4 mr-2" />
              Personalizado
            </TabsTrigger>
          </TabsList>

          {/* MODO: Por Items */}
          <TabsContent value="items" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Lista de Items */}
              <div className="lg:col-span-2 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-lg">Items de la cuenta</h3>
                  <Badge variant="outline">
                    {items.length} productos
                  </Badge>
                </div>

                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {items.map((item) => {
                    const assigned = getItemAssigned(item.id);
                    const remaining = Number(item.quantity) - assigned;

                    return (
                      <Card key={item.id} className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <h4 className="font-medium">{item.product?.name || 'Producto'}</h4>
                            <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                              <span>Cantidad: {item.quantity}</span>
                              <span>•</span>
                              <span>{formatCurrency(Number(item.total))}</span>
                            </div>
                            <div className="mt-2">
                              <div className="flex items-center gap-2">
                                <Badge 
                                  variant={remaining === 0 ? "default" : "secondary"}
                                  className="text-xs"
                                >
                                  Asignado: {assigned}/{item.quantity}
                                </Badge>
                                {remaining === 0 && (
                                  <CheckCircle className="h-4 w-4 text-green-600" />
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              min="0"
                              max={remaining}
                              className="w-20"
                              placeholder="0"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  const value = parseInt((e.target as HTMLInputElement).value) || 0;
                                  handleAssignItem(item.id, value);
                                  (e.target as HTMLInputElement).value = '';
                                }
                              }}
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={remaining === 0}
                              onClick={(e) => {
                                const input = e.currentTarget.parentElement?.querySelector('input');
                                if (input) {
                                  const value = parseInt(input.value) || 0;
                                  handleAssignItem(item.id, value);
                                  input.value = '';
                                }
                              }}
                            >
                              Asignar
                            </Button>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </div>

              {/* Panel de Splits */}
              <div className="space-y-3">
                <h3 className="font-semibold text-lg">Comensales</h3>
                <div className="space-y-2">
                  {splits.map((split, index) => (
                    <Card
                      key={split.id}
                      className={`p-3 cursor-pointer transition-all ${
                        currentSplit === index
                          ? 'ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-950'
                          : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                      }`}
                      onClick={() => setCurrentSplit(index)}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium">{split.name}</h4>
                          <p className="text-sm text-gray-500">
                            {split.items.length} items
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-lg">
                            {formatCurrency(split.total)}
                          </p>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>

                <Card className="p-3 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950 dark:to-emerald-950 border-green-200 dark:border-green-800">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-green-900 dark:text-green-100">
                      Total asignado
                    </span>
                    <span className="font-bold text-lg text-green-900 dark:text-green-100">
                      {formatCurrency(getTotalAssigned())}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-green-700 dark:text-green-300">
                    Falta: {formatCurrency(total - getTotalAssigned())}
                  </div>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* MODO: Equitativo */}
          <TabsContent value="equal" className="space-y-4">
            <div className="text-center py-8">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/30 mb-4">
                <Users className="h-8 w-8 text-blue-600" />
              </div>
              <h3 className="text-xl font-semibold mb-2">División Equitativa</h3>
              <p className="text-gray-500 dark:text-gray-400 mb-6">
                Se dividirá el total entre {splits.length} comensales
              </p>

              <div className="max-w-md mx-auto space-y-3">
                {splits.map((split) => (
                  <Card key={split.id} className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                          <Users className="h-5 w-5 text-blue-600" />
                        </div>
                        <span className="font-medium">{split.name}</span>
                      </div>
                      <span className="text-xl font-bold text-blue-600">
                        {formatCurrency(total / splits.length)}
                      </span>
                    </div>
                  </Card>
                ))}
              </div>

              <Button
                size="lg"
                onClick={handleSplitEqually}
                className="mt-6"
              >
                <Calculator className="h-5 w-5 mr-2" />
                Aplicar División Equitativa
              </Button>
            </div>
          </TabsContent>

          {/* MODO: Personalizado */}
          <TabsContent value="custom" className="space-y-4">
            <div className="text-center py-8">
              <p className="text-gray-500">Función en desarrollo</p>
            </div>
          </TabsContent>
        </Tabs>

        <Separator />

        <DialogFooter className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="text-sm text-gray-500">
              Total original: <span className="font-bold">{formatCurrency(total)}</span>
            </div>
            {splitMode === 'items' && (
              <div className="text-sm">
                <Badge variant={getTotalAssigned() === total ? "default" : "secondary"}>
                  Asignado: {formatCurrency(getTotalAssigned())}
                </Badge>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={!canConfirm()}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              Confirmar División
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
