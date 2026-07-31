'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Package, Search, MapPin, Weight } from 'lucide-react';

interface AvailableShipment {
  id: string;
  shipment_number: string;
  tracking_number?: string;
  delivery_address?: string;
  delivery_city?: string;
  weight_kg?: number;
}

interface AddShipmentsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  availableShipments: AvailableShipment[];
  onAdd: (shipmentIds: string[]) => Promise<void>;
  isLoading?: boolean;
}

export function AddShipmentsDialog({
  open,
  onOpenChange,
  availableShipments,
  onAdd,
  isLoading = false,
}: AddShipmentsDialogProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (open) {
      setSelectedIds(new Set());
      setSearchTerm('');
    }
  }, [open]);

  const filteredShipments = availableShipments.filter((s) => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      s.shipment_number?.toLowerCase().includes(search) ||
      s.tracking_number?.toLowerCase().includes(search) ||
      s.delivery_city?.toLowerCase().includes(search) ||
      s.delivery_address?.toLowerCase().includes(search)
    );
  });

  const toggleSelection = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const toggleAll = () => {
    if (selectedIds.size === filteredShipments.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredShipments.map((s) => s.id)));
    }
  };

  const handleAdd = async () => {
    if (selectedIds.size === 0) return;
    await onAdd(Array.from(selectedIds));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-blue-600" />
            Agregar Envíos al Manifiesto
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Búsqueda */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Buscar por número, tracking, ciudad..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Seleccionar todos */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Checkbox
                checked={selectedIds.size === filteredShipments.length && filteredShipments.length > 0}
                onCheckedChange={toggleAll}
              />
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {selectedIds.size > 0
                  ? `${selectedIds.size} seleccionado(s)`
                  : 'Seleccionar todos'}
              </span>
            </div>
            <Badge variant="outline">
              {filteredShipments.length} disponibles
            </Badge>
          </div>

          {/* Lista de envíos */}
          <ScrollArea className="h-[300px] border rounded-lg">
            {filteredShipments.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No hay envíos disponibles</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {filteredShipments.map((shipment) => (
                  <div
                    key={shipment.id}
                    className={`p-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer ${
                      selectedIds.has(shipment.id) ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                    }`}
                    onClick={() => toggleSelection(shipment.id)}
                  >
                    <Checkbox
                      checked={selectedIds.has(shipment.id)}
                      onCheckedChange={() => toggleSelection(shipment.id)}
                    />
                    <div className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800">
                      <Package className="h-4 w-4 text-gray-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-gray-900 dark:text-white">
                          {shipment.shipment_number}
                        </p>
                        {shipment.tracking_number && (
                          <Badge variant="outline" className="text-xs">
                            {shipment.tracking_number}
                          </Badge>
                        )}
                      </div>
                      {shipment.delivery_address && (
                        <p className="text-sm text-gray-500 truncate flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {shipment.delivery_address}
                          {shipment.delivery_city && `, ${shipment.delivery_city}`}
                        </p>
                      )}
                    </div>
                    {shipment.weight_kg && (
                      <Badge variant="secondary" className="flex items-center gap-1">
                        <Weight className="h-3 w-3" />
                        {shipment.weight_kg} kg
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleAdd}
            disabled={isLoading || selectedIds.size === 0}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Agregar {selectedIds.size > 0 ? `(${selectedIds.size})` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default AddShipmentsDialog;
