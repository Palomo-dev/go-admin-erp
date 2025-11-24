'use client';

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { MoveRight } from 'lucide-react';
import { MesasService } from '../mesasService';
import type { TableWithSession } from '../types';
import type { SaleItem } from './types';

interface TransferItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: SaleItem | null;
  currentTableId: string; // UUID
  onTransfer: (itemId: string, toTableId: string, quantity: number) => Promise<void>;
}

export function TransferItemDialog({
  open,
  onOpenChange,
  item,
  currentTableId,
  onTransfer,
}: TransferItemDialogProps) {
  const [mesas, setMesas] = useState<TableWithSession[]>([]);
  const [mesaDestino, setMesaDestino] = useState<string | null>(null);
  const [cantidad, setCantidad] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      cargarMesas();
      if (item) {
        setCantidad(item.quantity);
      }
    }
  }, [open, item]);

  const cargarMesas = async () => {
    try {
      const mesasData = await MesasService.obtenerMesasConSesiones();
      // Filtrar mesas ocupadas (excepto la actual) o libres
      const mesasDisponibles = mesasData.filter(
        (m: TableWithSession) => m.id !== currentTableId && (m.state === 'free' || m.state === 'occupied')
      );
      setMesas(mesasDisponibles);
    } catch (error) {
      console.error('Error cargando mesas:', error);
    }
  };

  const handleSubmit = async () => {
    if (!item || !mesaDestino) return;

    setIsSubmitting(true);
    try {
      await onTransfer(item.id, mesaDestino, cantidad);
      onOpenChange(false);
      setMesaDestino(null);
      setCantidad(1);
    } catch (error) {
      console.error('Error transfiriendo item:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!item) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        onOpenChange(isOpen);
        if (!isOpen) {
          setMesaDestino(null);
          setCantidad(1);
        }
      }}
    >
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Transferir Item</DialogTitle>
          <DialogDescription>
            Mueve este item a otra mesa. Si la mesa destino no tiene pedido
            activo, se creará uno nuevo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Item a transferir */}
          <div className="p-3 border rounded-md bg-gray-50 dark:bg-gray-800">
            <p className="font-medium text-gray-900 dark:text-gray-100">
              {item.product?.name || 'Producto'}
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Cantidad disponible: {item.quantity}
            </p>
          </div>

          {/* Cantidad a transferir */}
          <div className="space-y-2">
            <Label htmlFor="cantidad">Cantidad a Transferir</Label>
            <Input
              id="cantidad"
              type="number"
              min="1"
              max={item.quantity}
              value={cantidad}
              onChange={(e) => setCantidad(parseInt(e.target.value) || 1)}
            />
            {cantidad > item.quantity && (
              <p className="text-sm text-red-600">
                La cantidad no puede ser mayor a {item.quantity}
              </p>
            )}
          </div>

          {/* Icono de flecha */}
          <div className="flex justify-center">
            <MoveRight className="h-6 w-6 text-blue-500" />
          </div>

          {/* Mesa destino */}
          <div className="space-y-2">
            <Label htmlFor="mesa-destino">Mesa Destino</Label>
            <Select
              value={mesaDestino || ''}
              onValueChange={(value) => setMesaDestino(value)}
            >
              <SelectTrigger id="mesa-destino">
                <SelectValue placeholder="Seleccionar mesa" />
              </SelectTrigger>
              <SelectContent>
                {mesas.map((mesa) => (
                  <SelectItem key={mesa.id} value={mesa.id}>
                    {mesa.name}
                    {mesa.zone && ` - ${mesa.zone}`}
                    {mesa.state === 'free' ? ' (Libre)' : ' (Ocupada)'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Advertencia si es transferencia parcial */}
          {cantidad < item.quantity && (
            <div className="p-3 bg-yellow-50 dark:bg-yellow-950/20 rounded-md">
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                ⚠️ Se transferirán {cantidad} de {item.quantity} unidades. Las
                restantes permanecerán en esta mesa.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={
              !mesaDestino ||
              cantidad < 1 ||
              cantidad > item.quantity ||
              isSubmitting
            }
          >
            {isSubmitting ? 'Transfiriendo...' : 'Transferir'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
