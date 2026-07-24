'use client';

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Truck, ArrowRight } from 'lucide-react';
import { TransferenciasService } from '../transferencias/TransferenciasService';
import { Branch } from '../transferencias/types';
import { productionOrderService, type ProductionOrder } from '@/lib/services/productionOrderService';
import { useToast } from '@/components/ui/use-toast';

interface CrearTransferenciaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function CrearTransferenciaDialog({
  open,
  onOpenChange,
  onSaved,
}: CrearTransferenciaDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [sucursales, setSucursales] = useState<Branch[]>([]);
  const [ordenesCompletadas, setOrdenesCompletadas] = useState<ProductionOrder[]>([]);
  const [ordenSeleccionada, setOrdenSeleccionada] = useState<string>('');
  const [destinoId, setDestinoId] = useState<string>('');
  const [cantidad, setCantidad] = useState<number>(0);
  const [notas, setNotas] = useState('');
  const [maxCantidad, setMaxCantidad] = useState<number>(0);

  useEffect(() => {
    if (open) {
      cargarDatos();
    }
  }, [open]);

  useEffect(() => {
    if (ordenSeleccionada) {
      const orden = ordenesCompletadas.find((o) => o.id === parseInt(ordenSeleccionada));
      if (orden) {
        setMaxCantidad(orden.produced_qty || orden.qty_to_produce);
        setCantidad(orden.produced_qty || orden.qty_to_produce);
      }
    }
  }, [ordenSeleccionada]);

  const cargarDatos = async () => {
    try {
      setLoading(true);
      const [sucursalesData, ordenesData] = await Promise.all([
        TransferenciasService.obtenerSucursales(),
        productionOrderService.getOrders(
          parseInt(localStorage.getItem('currentOrgId') || '0'),
          { status: 'completed' }
        ),
      ]);
      setSucursales(sucursalesData);
      setOrdenesCompletadas(ordenesData);
    } catch (error) {
      console.error('Error cargando datos:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los datos',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleGuardar = async () => {
    if (!ordenSeleccionada || !destinoId) {
      toast({
        title: 'Error',
        description: 'Seleccione una orden de producción y sucursal destino',
        variant: 'destructive',
      });
      return;
    }

    if (cantidad <= 0) {
      toast({
        title: 'Error',
        description: 'La cantidad debe ser mayor a 0',
        variant: 'destructive',
      });
      return;
    }

    if (cantidad > maxCantidad) {
      toast({
        title: 'Stock insuficiente',
        description: `Solo hay ${maxCantidad} unidades disponibles`,
        variant: 'destructive',
      });
      return;
    }

    const orden = ordenesCompletadas.find((o) => o.id === parseInt(ordenSeleccionada));
    if (!orden) return;

    try {
      setLoading(true);
      await TransferenciasService.crearTransferencia({
        origin_branch_id: orden.branch_id,
        dest_branch_id: parseInt(destinoId),
        notes: notas || `Transferencia desde orden de producción #${orden.id}`,
        items: [
          {
            product_id: orden.product_id,
            quantity: cantidad,
            lot_id: null,
          },
        ],
      });

      toast({
        title: 'Transferencia creada',
        description: 'La transferencia de distribución ha sido creada exitosamente',
      });

      handleReset();
      onSaved();
      onOpenChange(false);
    } catch (error) {
      console.error('Error creando transferencia:', error);
      toast({
        title: 'Error',
        description: 'No se pudo crear la transferencia',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setOrdenSeleccionada('');
    setDestinoId('');
    setCantidad(0);
    setNotas('');
    setMaxCantidad(0);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] dark:bg-gray-800 dark:border-gray-700">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 dark:text-white">
            <Truck className="h-5 w-5 text-blue-600" />
            Nueva Transferencia de Distribución
          </DialogTitle>
          <DialogDescription className="dark:text-gray-400">
            Cree una transferencia desde una orden de producción completada hacia otra sucursal.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label className="dark:text-gray-300">Orden de Producción Completada</Label>
            <Select value={ordenSeleccionada} onValueChange={setOrdenSeleccionada}>
              <SelectTrigger className="dark:bg-gray-800 dark:border-gray-600 dark:text-white">
                <SelectValue placeholder="Seleccione una orden completada" />
              </SelectTrigger>
              <SelectContent className="dark:bg-gray-800 dark:border-gray-600">
                {ordenesCompletadas.length === 0 ? (
                  <SelectItem value="_empty" disabled>
                    No hay órdenes completadas
                  </SelectItem>
                ) : (
                  ordenesCompletadas.map((o) => (
                    <SelectItem key={o.id} value={o.id.toString()}>
                      #{o.id} - {o.product?.name || 'Producto'} ({o.produced_qty || o.qty_to_produce} und.)
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {ordenSeleccionada && (
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-gray-600 dark:text-gray-400">Sucursal origen:</span>
                <span className="font-medium dark:text-white">
                  {sucursales.find((s) => s.id === ordenesCompletadas.find((o) => o.id === parseInt(ordenSeleccionada))?.branch_id)?.name || 'N/A'}
                </span>
                <ArrowRight className="h-3 w-3 text-gray-400" />
                <span className="text-gray-600 dark:text-gray-400">Producto:</span>
                <span className="font-medium dark:text-white">
                  {ordenesCompletadas.find((o) => o.id === parseInt(ordenSeleccionada))?.product?.name}
                </span>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label className="dark:text-gray-300">Sucursal Destino</Label>
            <Select value={destinoId} onValueChange={setDestinoId}>
              <SelectTrigger className="dark:bg-gray-800 dark:border-gray-600 dark:text-white">
                <SelectValue placeholder="Seleccione sucursal destino" />
              </SelectTrigger>
              <SelectContent className="dark:bg-gray-800 dark:border-gray-600">
                {sucursales
                  .filter((s) => {
                    const orden = ordenesCompletadas.find((o) => o.id === parseInt(ordenSeleccionada));
                    return !orden || s.id !== orden.branch_id;
                  })
                  .map((s) => (
                    <SelectItem key={s.id} value={s.id.toString()}>
                      {s.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="dark:text-gray-300">
              Cantidad a Transferir (máx: {maxCantidad})
            </Label>
            <Input
              type="number"
              min={1}
              max={maxCantidad}
              value={cantidad}
              onChange={(e) => setCantidad(parseFloat(e.target.value) || 0)}
              className="dark:bg-gray-800 dark:border-gray-600 dark:text-white"
            />
          </div>

          <div className="space-y-2">
            <Label className="dark:text-gray-300">Notas (opcional)</Label>
            <Textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Notas adicionales sobre la transferencia..."
              rows={2}
              className="dark:bg-gray-800 dark:border-gray-600 dark:text-white"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="dark:border-gray-600 dark:text-gray-300">
            Cancelar
          </Button>
          <Button
            onClick={handleGuardar}
            disabled={loading || !ordenSeleccionada || !destinoId}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creando...
              </>
            ) : (
              <>
                <Truck className="h-4 w-4 mr-2" />
                Crear Transferencia
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
