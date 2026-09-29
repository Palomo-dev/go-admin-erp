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
import { MoveRight, AlertTriangle } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Tarjeta } from '@/components/kit';
import { MesasService } from '../mesasService';
import type { TableWithSession } from '../types';
import type { SaleItem } from './types';
import { textoCantidadParcialValido } from '@/components/kit/cartLineLogica';
import { decimalesLinea, formatoCantidadLinea, leerCantidadLinea, validarTraslado } from './cantidadMesa';

/** Cantidad inicial del campo: toda la línea, con coma decimal si la tiene. */
function textoInicial(item: SaleItem | null): string {
  return item ? String(Number(item.quantity)).replace('.', ',') : '1';
}

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
  const tAvisos = useTranslations('posMesas.avisos');
  const tPeso = useTranslations('posPeso.mesa');
  const locale = useLocale();
  const [mesas, setMesas] = useState<TableWithSession[]>([]);
  const [mesaDestino, setMesaDestino] = useState<string | null>(null);
  // Texto del campo: una línea por peso admite decimales («0,250» de 0,735 kg).
  const [texto, setTexto] = useState('1');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const decimales = decimalesLinea(item);
  const cantidad = leerCantidadLinea(texto, decimales);
  const disponible = Number(item?.quantity) || 0;
  const errorCantidad = validarTraslado(cantidad, disponible, decimales);
  const fmt = (n: number) => formatoCantidadLinea(n, item, locale);

  useEffect(() => {
    if (open) {
      cargarMesas();
      if (item) {
        setTexto(textoInicial(item));
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
    if (!item || !mesaDestino || cantidad === null || errorCantidad) return;

    setIsSubmitting(true);
    try {
      await onTransfer(item.id, mesaDestino, cantidad);
      onOpenChange(false);
      setMesaDestino(null);
      setTexto('1');
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
          setTexto('1');
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
              Cantidad disponible: {fmt(disponible)}
            </p>
          </div>

          {/* Cantidad a transferir */}
          <div className="space-y-2">
            <Label htmlFor="cantidad">Cantidad a Transferir</Label>
            <Input
              id="cantidad"
              type="text"
              inputMode={decimales > 0 ? 'decimal' : 'numeric'}
              autoComplete="off"
              value={texto}
              aria-invalid={texto !== '' && errorCantidad ? true : undefined}
              onChange={(e) => {
                if (textoCantidadParcialValido(e.target.value, decimales)) setTexto(e.target.value);
              }}
            />
            {errorCantidad === 'excede' && (
              <p className="text-sm text-red-600">
                La cantidad no puede ser mayor a {fmt(disponible)}
              </p>
            )}
            {errorCantidad === 'invalida' && texto !== '' && (
              <p className="text-sm text-red-600">{tPeso('cantidadInvalida', { decimales })}</p>
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
          {cantidad !== null && !errorCantidad && cantidad < disponible && (
            <Tarjeta
              tono="advertencia"
              icono={AlertTriangle}
              titulo={decimales > 0
                ? tPeso('transferenciaParcial', { cantidad: fmt(cantidad), total: fmt(disponible) })
                : tAvisos('transferenciaParcial', { cantidad, total: disponible })}
              descripcion={tAvisos('transferenciaParcialDescripcion')}
            />
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
              !!errorCantidad ||
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
