"use client";

import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users } from "lucide-react";
import { TableView } from "./table-view";

export interface TableData {
  id: number;
  name: string;
  zone: string;
  capacity: number;
  state: 'free' | 'occupied' | 'reserved' | 'bill_requested';
  timeOccupied?: string;
  customers?: number;
  server_name?: string;
}

interface TableActionsModalProps {
  open: boolean;
  onClose: () => void;
  actionType: 'open' | 'combine' | 'split' | 'move';
  table: TableData;
  availableTables?: TableData[];
  onConfirm: (data: any) => void;
}

export const TableActionsModal = ({
  open,
  onClose,
  actionType,
  table,
  availableTables = [],
  onConfirm,
}: TableActionsModalProps) => {
  // Estados para los diferentes formularios
  const [customerCount, setCustomerCount] = useState<number>(table.customers || 1);
  const [selectedTableIds, setSelectedTableIds] = useState<number[]>([]);
  const [splitItems, setSplitItems] = useState<{
    table1: number;
    table2: number;
  }>({ table1: 50, table2: 50 });

  // Obtener título del modal según la acción
  const getModalTitle = () => {
    switch (actionType) {
      case 'open': return `Abrir sesión para mesa ${table.name}`;
      case 'combine': return `Combinar mesa ${table.name} con otra mesa`;
      case 'split': return `Dividir cuenta de mesa ${table.name}`;
      case 'move': return `Mover pedido de mesa ${table.name} a otra mesa`;
      default: return "Acción de mesa";
    }
  };

  // Manejo de la selección de mesas para combinar o mover
  const toggleTableSelection = (tableId: number) => {
    if (selectedTableIds.includes(tableId)) {
      setSelectedTableIds(selectedTableIds.filter(id => id !== tableId));
    } else {
      // Para combinar o mover solo permitimos seleccionar una mesa adicional
      setSelectedTableIds([tableId]);
    }
  };

  // Manejar confirmación según el tipo de acción
  const handleConfirm = () => {
    switch (actionType) {
      case 'open':
        onConfirm({ customerCount });
        break;
      case 'combine':
        if (selectedTableIds.length > 0) {
          onConfirm({ targetTableId: selectedTableIds[0] });
        }
        break;
      case 'split':
        onConfirm({ splitPercentage: splitItems });
        break;
      case 'move':
        if (selectedTableIds.length > 0) {
          onConfirm({ targetTableId: selectedTableIds[0] });
        }
        break;
    }
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md md:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-blue-600 dark:text-blue-400">{getModalTitle()}</DialogTitle>
        </DialogHeader>

        <div className="py-4">
          {/* Contenido según tipo de acción */}
          {actionType === 'open' && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-1/3">
                  <TableView
                    {...table}
                    onOpenSession={() => {}}
                    onRequestBill={() => {}}
                    onCloseSession={() => {}}
                    onCancelReservation={() => {}}
                    interactive={false}
                    size="sm"
                  />
                </div>
                <div className="flex-1">
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="customerCount">Número de comensales</Label>
                      <div className="flex items-center mt-2">
                        <Users className="mr-2 h-4 w-4 text-blue-500 dark:text-blue-400" />
                        <Input
                          id="customerCount"
                          type="number"
                          value={customerCount}
                          onChange={(e) => setCustomerCount(parseInt(e.target.value) || 1)}
                          min={1}
                          max={table.capacity || 20}
                          className="w-20"
                        />
                        <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">
                          (Capacidad: {table.capacity})
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {(actionType === 'combine' || actionType === 'move') && (
            <div className="space-y-4">
              <div className="flex flex-col">
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                  Seleccione la mesa de destino:
                </p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 max-h-[300px] overflow-y-auto p-2">
                  {availableTables.length === 0 ? (
                    <p className="text-sm text-gray-500 col-span-3 text-center py-4">
                      No hay mesas disponibles para esta acción
                    </p>
                  ) : (
                    availableTables
                      .filter(t => t.id !== table.id) // Excluir la mesa actual
                      .map((availableTable) => (
                        <div
                          key={availableTable.id}
                          className={`border rounded-md p-2 cursor-pointer transition-all ${
                            selectedTableIds.includes(availableTable.id)
                              ? 'border-blue-500 dark:border-blue-400 bg-blue-50 dark:bg-blue-900/20'
                              : 'border-gray-200 dark:border-gray-700'
                          }`}
                          onClick={() => toggleTableSelection(availableTable.id)}
                        >
                          <TableView
                            {...availableTable}
                            onOpenSession={() => {}}
                            onRequestBill={() => {}}
                            onCloseSession={() => {}}
                            onCancelReservation={() => {}}
                            interactive={false}
                            size="sm"
                          />
                        </div>
                      ))
                  )}
                </div>
              </div>
            </div>
          )}

          {actionType === 'split' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Defina cómo dividir la cuenta:
              </p>
              <div className="flex items-center gap-4">
                <div className="flex-1 space-y-4">
                  <Tabs defaultValue="percentage" className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="percentage">Porcentaje</TabsTrigger>
                      <TabsTrigger value="items">Por ítems</TabsTrigger>
                    </TabsList>
                    <TabsContent value="percentage">
                      <div className="py-4 space-y-4">
                        <div>
                          <div className="flex justify-between mb-2">
                            <Label htmlFor="split1">Parte 1 ({splitItems.table1}%)</Label>
                            <Label htmlFor="split2">Parte 2 ({splitItems.table2}%)</Label>
                          </div>
                          <div className="relative">
                            <Input
                              id="splitRange"
                              type="range"
                              min="10"
                              max="90"
                              step="10"
                              value={splitItems.table1}
                              onChange={(e) => {
                                const value = parseInt(e.target.value);
                                setSplitItems({
                                  table1: value,
                                  table2: 100 - value,
                                });
                              }}
                              className="w-full"
                            />
                            <div className="w-full flex justify-between text-xs text-gray-500 dark:text-gray-400 px-1 mt-1">
                              <span>10%</span>
                              <span>50%</span>
                              <span>90%</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </TabsContent>
                    <TabsContent value="items">
                      <div className="py-4">
                        <p className="text-center text-sm text-gray-500 dark:text-gray-400">
                          Funcionalidad de división por ítems disponible próximamente
                        </p>
                      </div>
                    </TabsContent>
                  </Tabs>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={
              (actionType === 'combine' || actionType === 'move') && selectedTableIds.length === 0
            }
          >
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
