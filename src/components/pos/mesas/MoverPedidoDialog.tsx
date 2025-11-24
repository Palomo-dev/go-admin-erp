'use client';

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { MoveRight } from 'lucide-react';
import type { TableWithSession } from './types';

interface MoverPedidoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mesas: TableWithSession[];
  onMover: (sesionId: string, mesaDestinoId: string) => Promise<void>;
}

export function MoverPedidoDialog({
  open,
  onOpenChange,
  mesas,
  onMover,
}: MoverPedidoDialogProps) {
  const [mesaOrigen, setMesaOrigen] = useState<string | null>(null);
  const [mesaDestino, setMesaDestino] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Mesas con sesión activa (origen)
  const mesasConSesion = mesas.filter(
    (m) => m.session && m.session.status === 'active'
  );

  // Mesas libres (destino)
  const mesasLibres = mesas.filter((m) => m.state === 'free');

  const sesionSeleccionada = mesasConSesion.find((m) => m.id === mesaOrigen)
    ?.session;

  const handleSubmit = async () => {
    if (!mesaOrigen || !mesaDestino || !sesionSeleccionada) return;

    setIsSubmitting(true);
    try {
      await onMover(sesionSeleccionada.id, mesaDestino);
      onOpenChange(false);
      setMesaOrigen(null);
      setMesaDestino(null);
    } catch (error) {
      console.error('Error moviendo pedido:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        onOpenChange(isOpen);
        if (!isOpen) {
          setMesaOrigen(null);
          setMesaDestino(null);
        }
      }}
    >
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Mover Pedido</DialogTitle>
          <DialogDescription>
            Mueve el pedido de una mesa a otra. La mesa origen quedará libre.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Mesa Origen */}
          <div className="space-y-2">
            <Label htmlFor="mesa-origen">Mesa Origen</Label>
            <Select
              value={mesaOrigen || ''}
              onValueChange={(value) => setMesaOrigen(value)}
            >
              <SelectTrigger id="mesa-origen">
                <SelectValue placeholder="Seleccionar mesa con pedido" />
              </SelectTrigger>
              <SelectContent>
                {mesasConSesion.map((mesa) => (
                  <SelectItem key={mesa.id} value={mesa.id}>
                    {mesa.name}
                    {mesa.zone && ` - ${mesa.zone}`}
                    {mesa.session && ` (${mesa.session.customers} personas)`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Icono de flecha */}
          <div className="flex justify-center">
            <MoveRight className="h-6 w-6 text-blue-500" />
          </div>

          {/* Mesa Destino */}
          <div className="space-y-2">
            <Label htmlFor="mesa-destino">Mesa Destino</Label>
            <Select
              value={mesaDestino || ''}
              onValueChange={(value) => setMesaDestino(value)}
              disabled={!mesaOrigen}
            >
              <SelectTrigger id="mesa-destino">
                <SelectValue placeholder="Seleccionar mesa libre" />
              </SelectTrigger>
              <SelectContent>
                {mesasLibres
                  .filter((m) => m.id !== mesaOrigen)
                  .map((mesa) => (
                    <SelectItem key={mesa.id} value={mesa.id}>
                      {mesa.name}
                      {mesa.zone && ` - ${mesa.zone}`}
                      {` (Cap: ${mesa.capacity})`}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          {/* Info adicional */}
          {mesaOrigen && mesaDestino && (
            <div className="p-3 bg-blue-50 dark:bg-blue-950/20 rounded-md text-sm">
              <p className="text-blue-900 dark:text-blue-100">
                El pedido será movido y la mesa origen quedará disponible.
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
            disabled={!mesaOrigen || !mesaDestino || isSubmitting}
          >
            {isSubmitting ? 'Moviendo...' : 'Mover Pedido'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
