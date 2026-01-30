'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { 
  ArrowLeft, 
  ArrowRight, 
  Truck, 
  PackageCheck, 
  XCircle,
  MapPin,
  Calendar,
  User,
  FileText,
  Loader2,
  CheckCircle2
} from 'lucide-react';
import { TransferenciasService } from '../TransferenciasService';
import { InventoryTransfer, TransferItem } from '../types';
import { formatDate } from '@/utils/Utils';
import { useToast } from '@/components/ui/use-toast';

interface TransferenciaDetalleProps {
  transferenciaId: number;
}

const estadoConfig: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
  draft: { 
    label: 'Borrador', 
    className: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
    icon: <FileText className="h-4 w-4" />
  },
  pending: { 
    label: 'Pendiente', 
    className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
    icon: <FileText className="h-4 w-4" />
  },
  in_transit: { 
    label: 'En Tránsito', 
    className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    icon: <Truck className="h-4 w-4" />
  },
  partial: { 
    label: 'Recepción Parcial', 
    className: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
    icon: <PackageCheck className="h-4 w-4" />
  },
  complete: { 
    label: 'Completa', 
    className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    icon: <CheckCircle2 className="h-4 w-4" />
  },
  cancelled: { 
    label: 'Cancelada', 
    className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    icon: <XCircle className="h-4 w-4" />
  }
};

export function TransferenciaDetalle({ transferenciaId }: TransferenciaDetalleProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [transferencia, setTransferencia] = useState<InventoryTransfer | null>(null);
  const [loading, setLoading] = useState(true);
  const [procesando, setProcesando] = useState(false);
  const [showRecepcionModal, setShowRecepcionModal] = useState(false);
  const [cantidadesRecibidas, setCantidadesRecibidas] = useState<Record<number, number>>({});

  useEffect(() => {
    cargarTransferencia();
  }, [transferenciaId]);

  const cargarTransferencia = async () => {
    try {
      setLoading(true);
      const data = await TransferenciasService.obtenerTransferenciaPorId(transferenciaId);
      setTransferencia(data);
      
      // Inicializar cantidades recibidas
      if (data?.items) {
        const cantidades: Record<number, number> = {};
        data.items.forEach(item => {
          if (item.id) {
            cantidades[item.id] = 0;
          }
        });
        setCantidadesRecibidas(cantidades);
      }
    } catch (error) {
      console.error('Error cargando transferencia:', error);
      toast({
        title: 'Error',
        description: 'No se pudo cargar la transferencia',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEnviar = async () => {
    if (!confirm('¿Confirmar envío? Se descontará el stock del origen.')) return;

    try {
      setProcesando(true);
      await TransferenciasService.actualizarEstado(transferenciaId, 'in_transit');
      toast({
        title: 'Transferencia enviada',
        description: 'La transferencia está en tránsito'
      });
      cargarTransferencia();
    } catch (error) {
      console.error('Error enviando:', error);
      toast({
        title: 'Error',
        description: 'No se pudo enviar la transferencia',
        variant: 'destructive'
      });
    } finally {
      setProcesando(false);
    }
  };

  const handleCancelar = async () => {
    if (!confirm('¿Está seguro de cancelar esta transferencia?')) return;

    try {
      setProcesando(true);
      await TransferenciasService.cancelarTransferencia(transferenciaId);
      toast({
        title: 'Transferencia cancelada',
        description: 'La transferencia ha sido cancelada'
      });
      cargarTransferencia();
    } catch (error) {
      console.error('Error cancelando:', error);
      toast({
        title: 'Error',
        description: 'No se pudo cancelar',
        variant: 'destructive'
      });
    } finally {
      setProcesando(false);
    }
  };

  const handleConfirmarRecepcion = async () => {
    const itemsARecibir = Object.entries(cantidadesRecibidas)
      .filter(([_, qty]) => qty > 0)
      .map(([id, qty]) => ({
        transfer_item_id: parseInt(id),
        received_qty: qty
      }));

    if (itemsARecibir.length === 0) {
      toast({
        title: 'Sin cambios',
        description: 'Ingrese al menos una cantidad a recibir',
        variant: 'destructive'
      });
      return;
    }

    try {
      setProcesando(true);
      await TransferenciasService.recibirItems(transferenciaId, itemsARecibir);
      toast({
        title: 'Recepción confirmada',
        description: 'Los items han sido recibidos'
      });
      setShowRecepcionModal(false);
      cargarTransferencia();
    } catch (error) {
      console.error('Error recibiendo:', error);
      toast({
        title: 'Error',
        description: 'No se pudo confirmar la recepción',
        variant: 'destructive'
      });
    } finally {
      setProcesando(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!transferencia) {
    return (
      <div className="p-6 text-center">
        <p className="text-gray-500 dark:text-gray-400">Transferencia no encontrada</p>
        <Button onClick={() => router.back()} className="mt-4">
          Volver
        </Button>
      </div>
    );
  }

  const estado = estadoConfig[transferencia.status] || estadoConfig.pending;
  const puedeEnviar = transferencia.status === 'pending';
  const puedeRecibir = transferencia.status === 'in_transit' || transferencia.status === 'partial';
  const puedeCancelar = transferencia.status === 'pending' || transferencia.status === 'draft';

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            onClick={() => router.push('/app/inventario/transferencias')}
            className="dark:text-gray-300 dark:hover:bg-gray-800"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Volver
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                Transferencia #{transferencia.id}
              </h1>
              <Badge className={estado.className}>
                {estado.icon}
                <span className="ml-1">{estado.label}</span>
              </Badge>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Creada el {formatDate(transferencia.created_at)}
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          {puedeEnviar && (
            <Button
              onClick={handleEnviar}
              disabled={procesando}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Truck className="h-4 w-4 mr-2" />
              Enviar
            </Button>
          )}
          
          {puedeRecibir && (
            <Button
              onClick={() => setShowRecepcionModal(true)}
              disabled={procesando}
              className="bg-green-600 hover:bg-green-700"
            >
              <PackageCheck className="h-4 w-4 mr-2" />
              Recibir
            </Button>
          )}

          {puedeCancelar && (
            <Button
              variant="outline"
              onClick={handleCancelar}
              disabled={procesando}
              className="text-red-600 border-red-300 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/20"
            >
              <XCircle className="h-4 w-4 mr-2" />
              Cancelar
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Info Principal */}
        <div className="lg:col-span-2 space-y-6">
          {/* Sucursales */}
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div className="text-center flex-1">
                  <div className="w-12 h-12 mx-auto bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mb-2">
                    <MapPin className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Origen</p>
                  <p className="font-semibold text-gray-900 dark:text-white">
                    {transferencia.origin_branch?.name}
                  </p>
                  {transferencia.origin_branch?.address && (
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      {transferencia.origin_branch.address}
                    </p>
                  )}
                </div>

                <div className="px-4">
                  <ArrowRight className="h-8 w-8 text-gray-300 dark:text-gray-600" />
                </div>

                <div className="text-center flex-1">
                  <div className="w-12 h-12 mx-auto bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-2">
                    <MapPin className="h-6 w-6 text-green-600 dark:text-green-400" />
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Destino</p>
                  <p className="font-semibold text-gray-900 dark:text-white">
                    {transferencia.dest_branch?.name}
                  </p>
                  {transferencia.dest_branch?.address && (
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      {transferencia.dest_branch.address}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Items */}
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="dark:text-white">Items de la Transferencia</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="dark:border-gray-700">
                    <TableHead className="dark:text-gray-300">Producto</TableHead>
                    <TableHead className="dark:text-gray-300">Lote</TableHead>
                    <TableHead className="text-center dark:text-gray-300">Enviado</TableHead>
                    <TableHead className="text-center dark:text-gray-300">Recibido</TableHead>
                    <TableHead className="text-center dark:text-gray-300">Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transferencia.items?.map((item) => {
                    const recibidoCompleto = (item.received_qty || 0) >= item.quantity;
                    const recibidoParcial = (item.received_qty || 0) > 0 && !recibidoCompleto;
                    
                    return (
                      <TableRow key={item.id} className="dark:border-gray-700">
                        <TableCell className="dark:text-white">
                          <div>
                            <p className="font-medium">{item.product?.name}</p>
                            {item.product?.sku && (
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                SKU: {item.product.sku}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="dark:text-gray-300">
                          {item.lot?.lot_number || '-'}
                        </TableCell>
                        <TableCell className="text-center dark:text-gray-300">
                          {item.quantity}
                        </TableCell>
                        <TableCell className="text-center dark:text-gray-300">
                          {item.received_qty || 0}
                        </TableCell>
                        <TableCell className="text-center">
                          {recibidoCompleto ? (
                            <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                              Completo
                            </Badge>
                          ) : recibidoParcial ? (
                            <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400">
                              Parcial
                            </Badge>
                          ) : (
                            <Badge className="bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300">
                              Pendiente
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="dark:text-white">Información</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <Calendar className="h-5 w-5 text-gray-400" />
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Fecha creación</p>
                  <p className="text-sm dark:text-white">{formatDate(transferencia.created_at)}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <User className="h-5 w-5 text-gray-400" />
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Creado por</p>
                  <p className="text-sm dark:text-white">
                    {transferencia.creator?.email || transferencia.created_by || '-'}
                  </p>
                </div>
              </div>

              {transferencia.notes && (
                <div className="pt-4 border-t dark:border-gray-700">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Notas</p>
                  <p className="text-sm dark:text-gray-300">{transferencia.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Resumen */}
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="dark:text-white">Resumen</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">Total productos:</span>
                <span className="dark:text-white">{transferencia.items?.length || 0}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">Unidades enviadas:</span>
                <span className="dark:text-white">
                  {transferencia.items?.reduce((sum, i) => sum + i.quantity, 0) || 0}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">Unidades recibidas:</span>
                <span className="dark:text-white">
                  {transferencia.items?.reduce((sum, i) => sum + (i.received_qty || 0), 0) || 0}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Modal de Recepción */}
      <Dialog open={showRecepcionModal} onOpenChange={setShowRecepcionModal}>
        <DialogContent className="dark:bg-gray-800 dark:border-gray-700 max-w-2xl">
          <DialogHeader>
            <DialogTitle className="dark:text-white">Recibir Items</DialogTitle>
            <DialogDescription className="dark:text-gray-400">
              Ingrese las cantidades recibidas para cada producto
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[400px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow className="dark:border-gray-700">
                  <TableHead className="dark:text-gray-300">Producto</TableHead>
                  <TableHead className="text-center dark:text-gray-300">Enviado</TableHead>
                  <TableHead className="text-center dark:text-gray-300">Ya recibido</TableHead>
                  <TableHead className="text-center dark:text-gray-300">Recibir ahora</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transferencia.items?.map((item) => {
                  const pendiente = item.quantity - (item.received_qty || 0);
                  if (pendiente <= 0) return null;

                  return (
                    <TableRow key={item.id} className="dark:border-gray-700">
                      <TableCell className="dark:text-white">
                        {item.product?.name}
                      </TableCell>
                      <TableCell className="text-center dark:text-gray-300">
                        {item.quantity}
                      </TableCell>
                      <TableCell className="text-center dark:text-gray-300">
                        {item.received_qty || 0}
                      </TableCell>
                      <TableCell className="text-center">
                        <Input
                          type="number"
                          min={0}
                          max={pendiente}
                          value={cantidadesRecibidas[item.id!] || ''}
                          onChange={(e) => setCantidadesRecibidas(prev => ({
                            ...prev,
                            [item.id!]: Math.min(parseInt(e.target.value) || 0, pendiente)
                          }))}
                          className="w-20 mx-auto dark:bg-gray-900 dark:border-gray-600 dark:text-white text-center"
                        />
                        <p className="text-xs text-gray-500 mt-1">máx: {pendiente}</p>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowRecepcionModal(false)}
              className="dark:border-gray-600 dark:text-gray-300"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleConfirmarRecepcion}
              disabled={procesando}
              className="bg-green-600 hover:bg-green-700"
            >
              {procesando ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Procesando...
                </>
              ) : (
                <>
                  <PackageCheck className="h-4 w-4 mr-2" />
                  Confirmar Recepción
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
