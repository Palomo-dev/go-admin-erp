'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, Package, AlertCircle, Check, Loader2 } from 'lucide-react';
import { serialTrackingService, type SerialNumber } from '@/lib/services/serialTrackingService';

interface SerialSelectorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: number;
  productName: string;
  productSku?: string;
  branchId: number;
  organizationId: number;
  quantity: number;
  onConfirm: (serialIds: number[], serials: SerialNumber[]) => void;
}

export function SerialSelectorDialog({
  open,
  onOpenChange,
  productId,
  productName,
  productSku,
  branchId,
  organizationId,
  quantity,
  onConfirm,
}: SerialSelectorDialogProps) {
  const [availableSerials, setAvailableSerials] = useState<SerialNumber[]>([]);
  const [filteredSerials, setFilteredSerials] = useState<SerialNumber[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const loadSerials = useCallback(async () => {
    if (!productId || !branchId) return;
    setIsLoading(true);
    try {
      const { data } = await serialTrackingService.getSerialsByProduct(productId, branchId, 'in_stock');
      setAvailableSerials(data);
      setFilteredSerials(data);
    } catch (err) {
      console.error('Error cargando seriales:', err);
    } finally {
      setIsLoading(false);
    }
  }, [productId, branchId]);

  useEffect(() => {
    if (open) {
      loadSerials();
      setSelectedIds([]);
      setSearchTerm('');
    }
  }, [open, loadSerials]);

  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredSerials(availableSerials);
    } else {
      const lower = searchTerm.toLowerCase();
      setFilteredSerials(
        availableSerials.filter(s => s.serial.toLowerCase().includes(lower))
      );
    }
  }, [searchTerm, availableSerials]);

  const handleToggleSerial = (serial: SerialNumber) => {
    if (selectedIds.includes(serial.id)) {
      setSelectedIds(selectedIds.filter(id => id !== serial.id));
    } else if (selectedIds.length < quantity) {
      setSelectedIds([...selectedIds, serial.id]);
    }
  };

  const handleConfirm = () => {
    const selected = availableSerials.filter(s => selectedIds.includes(s.id));
    onConfirm(selectedIds, selected);
    onOpenChange(false);
  };

  const remaining = quantity - selectedIds.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-blue-600" />
            Seleccionar Seriales
          </DialogTitle>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {productName} {productSku && `· SKU: ${productSku}`}
          </p>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Badge variant={selectedIds.length === quantity ? 'default' : 'outline'}
              className={selectedIds.length === quantity ? 'bg-green-600' : ''}>
              {selectedIds.length}/{quantity} seleccionados
            </Badge>
            {remaining > 0 && (
              <span className="text-xs text-gray-500">
                Faltan {remaining} por seleccionar
              </span>
            )}
          </div>

          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar serial..."
              className="pl-8"
            />
          </div>

          <ScrollArea className="h-[300px] rounded-md border dark:border-gray-700">
            {isLoading ? (
              <div className="flex items-center justify-center h-full p-8">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              </div>
            ) : filteredSerials.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                <AlertCircle className="h-8 w-8 text-gray-300 mb-2" />
                <p className="text-sm text-gray-500">
                  No hay seriales disponibles en esta sucursal
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  El producto no tiene unidades con serial en stock
                </p>
              </div>
            ) : (
              <div className="divide-y dark:divide-gray-700">
                {filteredSerials.map((serial) => {
                  const isSelected = selectedIds.includes(serial.id);
                  return (
                    <button
                      key={serial.id}
                      onClick={() => handleToggleSerial(serial)}
                      className={`w-full flex items-center justify-between p-3 text-left transition-colors ${
                        isSelected
                          ? 'bg-blue-50 dark:bg-blue-900/20'
                          : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                          isSelected
                            ? 'border-blue-600 bg-blue-600'
                            : 'border-gray-300 dark:border-gray-600'
                        }`}>
                          {isSelected && <Check className="h-3 w-3 text-white" />}
                        </div>
                        <div>
                          <p className="text-sm font-mono font-medium text-gray-900 dark:text-white">
                            {serial.serial}
                          </p>
                          <p className="text-xs text-gray-500">
                            Recibido: {serial.received_date ? new Date(serial.received_date).toLocaleDateString() : 'N/A'}
                          </p>
                        </div>
                      </div>
                      {serial.warranty_end && (
                        <Badge variant="outline" className="text-xs">
                          Garantía: {new Date(serial.warranty_end).toLocaleDateString()}
                        </Badge>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={selectedIds.length !== quantity}
            className="bg-blue-600 hover:bg-blue-700"
          >
            Confirmar ({selectedIds.length}/{quantity})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default SerialSelectorDialog;
