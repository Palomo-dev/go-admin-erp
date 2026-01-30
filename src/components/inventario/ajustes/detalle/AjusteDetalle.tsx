'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { supabase } from '@/lib/supabase/config';
import { Button } from '@/components/ui/button';
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { 
  ArrowLeft,
  Loader2,
  CheckCircle,
  XCircle,
  FileEdit,
  Edit,
  ArrowRightLeft,
  Calendar,
  Building2,
  User,
  FileText,
  AlertTriangle
} from 'lucide-react';
import { formatCurrency, formatDate } from '@/utils/Utils';
import { 
  adjustmentService, 
  ADJUSTMENT_TYPES, 
  ADJUSTMENT_REASONS,
  type InventoryAdjustment
} from '@/lib/services/adjustmentService';
import Link from 'next/link';

interface AjusteDetalleProps {
  adjustmentId: number;
}

function getStatusBadge(status: string) {
  const badges: Record<string, { label: string; color: string; icon: React.ElementType }> = {
    draft: {
      label: 'Borrador',
      color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
      icon: FileEdit
    },
    applied: {
      label: 'Aplicado',
      color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      icon: CheckCircle
    },
    cancelled: {
      label: 'Cancelado',
      color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
      icon: XCircle
    }
  };
  return badges[status] || badges.draft;
}

function getTypeLabel(type: string): string {
  const found = ADJUSTMENT_TYPES.find(t => t.value === type);
  return found?.label || type;
}

function getReasonLabel(reason: string): string {
  const found = ADJUSTMENT_REASONS.find(r => r.value === reason);
  return found?.label || reason;
}

export function AjusteDetalle({ adjustmentId }: AjusteDetalleProps) {
  const router = useRouter();
  const { toast } = useToast();
  const { organization, isLoading: loadingOrg } = useOrganization();

  // Estados
  const [adjustment, setAdjustment] = useState<InventoryAdjustment | null>(null);
  const [movements, setMovements] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [applyDialogOpen, setApplyDialogOpen] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Cargar datos
  const loadData = useCallback(async () => {
    if (!organization?.id) return;

    try {
      setIsLoading(true);

      const { data, error } = await adjustmentService.getAdjustmentById(
        adjustmentId,
        organization.id
      );

      if (error) throw error;
      if (!data) {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'Ajuste no encontrado'
        });
        router.push('/app/inventario/ajustes');
        return;
      }

      setAdjustment(data);

      // Si está aplicado, cargar movimientos generados
      if (data.status === 'applied') {
        const movs = await adjustmentService.getMovementsByAdjustment(adjustmentId);
        setMovements(movs);
      }
    } catch (error) {
      console.error('Error cargando ajuste:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudo cargar el ajuste'
      });
    } finally {
      setIsLoading(false);
    }
  }, [organization?.id, adjustmentId, router, toast]);

  useEffect(() => {
    if (organization?.id) {
      loadData();
    }
  }, [organization?.id, loadData]);

  // Aplicar ajuste
  const handleApply = async () => {
    if (!adjustment || !organization?.id) return;

    try {
      setIsProcessing(true);

      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id;

      if (!userId) {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'Debes estar autenticado para aplicar ajustes'
        });
        return;
      }

      const { success, error } = await adjustmentService.applyAdjustment(
        adjustment.id,
        organization.id,
        userId
      );

      if (error) throw error;

      toast({
        title: 'Ajuste aplicado',
        description: 'Los movimientos de stock han sido generados correctamente'
      });

      loadData();
    } catch (error: any) {
      console.error('Error aplicando ajuste:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'No se pudo aplicar el ajuste'
      });
    } finally {
      setIsProcessing(false);
      setApplyDialogOpen(false);
    }
  };

  // Cancelar ajuste
  const handleCancel = async () => {
    if (!adjustment || !organization?.id) return;

    try {
      setIsProcessing(true);

      const { success, error } = await adjustmentService.cancelAdjustment(
        adjustment.id,
        organization.id
      );

      if (error) throw error;

      toast({
        title: 'Ajuste cancelado',
        description: 'El ajuste ha sido cancelado correctamente'
      });

      loadData();
    } catch (error: any) {
      console.error('Error cancelando ajuste:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'No se pudo cancelar el ajuste'
      });
    } finally {
      setIsProcessing(false);
      setCancelDialogOpen(false);
    }
  };

  if (loadingOrg || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        <span className="ml-2 text-gray-500 dark:text-gray-400">Cargando ajuste...</span>
      </div>
    );
  }

  if (!adjustment) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 dark:text-gray-400">Ajuste no encontrado</p>
        <Link href="/app/inventario/ajustes">
          <Button className="mt-4">Volver a la lista</Button>
        </Link>
      </div>
    );
  }

  const statusBadge = getStatusBadge(adjustment.status);
  const StatusIcon = statusBadge.icon;
  const items = adjustment.adjustment_items || [];
  
  const totalDifference = items.reduce((sum, item) => sum + (item.difference || 0), 0);
  const totalValueDifference = items.reduce((sum, item) => sum + ((item.difference || 0) * (item.unit_cost || 0)), 0);

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/app/inventario/ajustes">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Volver
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                Ajuste #{adjustment.id}
              </h1>
              <Badge className={statusBadge.color}>
                <StatusIcon className="h-3 w-3 mr-1" />
                {statusBadge.label}
              </Badge>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {getTypeLabel(adjustment.type)} - {getReasonLabel(adjustment.reason)}
            </p>
          </div>
        </div>

        {adjustment.status === 'draft' && (
          <div className="flex items-center gap-2">
            <Link href={`/app/inventario/ajustes/${adjustment.id}/editar`}>
              <Button variant="outline" size="sm" className="dark:border-gray-700">
                <Edit className="h-4 w-4 mr-2" />
                Editar
              </Button>
            </Link>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCancelDialogOpen(true)}
              className="text-orange-600 hover:text-orange-700 dark:border-gray-700"
            >
              <XCircle className="h-4 w-4 mr-2" />
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={() => setApplyDialogOpen(true)}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              Aplicar
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Información del ajuste */}
        <div className="lg:col-span-2 space-y-6">
          {/* Detalles */}
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="text-lg dark:text-white">Información del Ajuste</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                    <Calendar className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Fecha</p>
                    <p className="font-medium dark:text-white">{formatDate(adjustment.created_at)}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                    <Building2 className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Sucursal</p>
                    <p className="font-medium dark:text-white">{adjustment.branches?.name || '-'}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                    <FileText className="h-4 w-4 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Tipo</p>
                    <p className="font-medium dark:text-white">{getTypeLabel(adjustment.type)}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
                    <AlertTriangle className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Razón</p>
                    <p className="font-medium dark:text-white">{getReasonLabel(adjustment.reason)}</p>
                  </div>
                </div>
              </div>

              {adjustment.notes && (
                <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    <strong>Notas:</strong> {adjustment.notes}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Items del ajuste */}
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="text-lg dark:text-white">
                Productos Ajustados ({items.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="dark:border-gray-700">
                      <TableHead className="dark:text-gray-300">Producto</TableHead>
                      <TableHead className="text-right dark:text-gray-300">Stock Sistema</TableHead>
                      <TableHead className="text-right dark:text-gray-300">Conteo</TableHead>
                      <TableHead className="text-right dark:text-gray-300">Diferencia</TableHead>
                      <TableHead className="text-right dark:text-gray-300">Costo Unit.</TableHead>
                      <TableHead className="text-right dark:text-gray-300">Impacto</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item, index) => (
                      <TableRow key={index} className="dark:border-gray-700">
                        <TableCell>
                          <div>
                            <p className="font-medium dark:text-white">{item.products?.name || 'N/A'}</p>
                            <p className="text-sm text-gray-500 dark:text-gray-400">{item.products?.sku || '-'}</p>
                          </div>
                        </TableCell>
                        <TableCell className="text-right dark:text-gray-300">
                          {item.system_qty || 0}
                        </TableCell>
                        <TableCell className="text-right dark:text-gray-300">
                          {item.quantity}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge
                            className={
                              (item.difference || 0) > 0
                                ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                                : (item.difference || 0) < 0
                                ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                                : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                            }
                          >
                            {(item.difference || 0) > 0 ? '+' : ''}{item.difference || 0}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right dark:text-gray-300">
                          {formatCurrency(item.unit_cost || 0)}
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={((item.difference || 0) * (item.unit_cost || 0)) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                            {formatCurrency((item.difference || 0) * (item.unit_cost || 0))}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Movimientos generados (solo si está aplicado) */}
          {adjustment.status === 'applied' && movements.length > 0 && (
            <Card className="dark:bg-gray-800 dark:border-gray-700">
              <CardHeader>
                <CardTitle className="text-lg dark:text-white flex items-center gap-2">
                  <ArrowRightLeft className="h-5 w-5" />
                  Movimientos Generados ({movements.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="dark:border-gray-700">
                        <TableHead className="dark:text-gray-300">Fecha</TableHead>
                        <TableHead className="dark:text-gray-300">Producto</TableHead>
                        <TableHead className="text-center dark:text-gray-300">Dirección</TableHead>
                        <TableHead className="text-right dark:text-gray-300">Cantidad</TableHead>
                        <TableHead className="text-right dark:text-gray-300">Costo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {movements.map((mov, index) => (
                        <TableRow key={index} className="dark:border-gray-700">
                          <TableCell className="text-gray-600 dark:text-gray-400">
                            {formatDate(mov.created_at)}
                          </TableCell>
                          <TableCell className="dark:text-white">
                            {mov.products?.name || 'N/A'}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge
                              className={
                                mov.direction === 'in'
                                  ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                                  : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                              }
                            >
                              {mov.direction === 'in' ? 'Entrada' : 'Salida'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right dark:text-white">
                            {mov.direction === 'in' ? '+' : '-'}{mov.qty}
                          </TableCell>
                          <TableCell className="text-right dark:text-gray-300">
                            {formatCurrency(mov.unit_cost || 0)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Panel lateral - Resumen */}
        <div className="space-y-6">
          <Card className="dark:bg-gray-800 dark:border-gray-700 sticky top-6">
            <CardHeader>
              <CardTitle className="text-lg dark:text-white">Resumen</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-center py-2 border-b dark:border-gray-700">
                <span className="text-gray-600 dark:text-gray-400">Productos</span>
                <span className="font-medium dark:text-white">{items.length}</span>
              </div>

              <div className="flex justify-between items-center py-2 border-b dark:border-gray-700">
                <span className="text-gray-600 dark:text-gray-400">Diferencia total</span>
                <Badge
                  className={
                    totalDifference > 0
                      ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                      : totalDifference < 0
                      ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                      : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                  }
                >
                  {totalDifference > 0 ? '+' : ''}{totalDifference} unidades
                </Badge>
              </div>

              <div className="flex justify-between items-center py-2 border-b dark:border-gray-700">
                <span className="text-gray-600 dark:text-gray-400">Impacto valorizado</span>
                <span className={`font-medium ${totalValueDifference >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                  {formatCurrency(totalValueDifference)}
                </span>
              </div>

              <div className="flex justify-between items-center py-2">
                <span className="text-gray-600 dark:text-gray-400">Estado</span>
                <Badge className={statusBadge.color}>
                  <StatusIcon className="h-3 w-3 mr-1" />
                  {statusBadge.label}
                </Badge>
              </div>

              {adjustment.status === 'applied' && (
                <div className="mt-4">
                  <Link href="/app/inventario/movimientos">
                    <Button variant="outline" className="w-full dark:border-gray-700">
                      <ArrowRightLeft className="h-4 w-4 mr-2" />
                      Ver todos los movimientos
                    </Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Diálogo de aplicar */}
      <AlertDialog open={applyDialogOpen} onOpenChange={setApplyDialogOpen}>
        <AlertDialogContent className="dark:bg-gray-900 dark:border-gray-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="dark:text-white">Aplicar ajuste</AlertDialogTitle>
            <AlertDialogDescription className="dark:text-gray-400">
              ¿Estás seguro de aplicar este ajuste? Esta acción generará los movimientos de stock correspondientes y no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel 
              className="dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
              disabled={isProcessing}
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleApply}
              className="bg-green-600 hover:bg-green-700 text-white"
              disabled={isProcessing}
            >
              {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Aplicar ajuste
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Diálogo de cancelar */}
      <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <AlertDialogContent className="dark:bg-gray-900 dark:border-gray-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="dark:text-white">Cancelar ajuste</AlertDialogTitle>
            <AlertDialogDescription className="dark:text-gray-400">
              ¿Estás seguro de cancelar este ajuste? El ajuste quedará marcado como cancelado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel 
              className="dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
              disabled={isProcessing}
            >
              Volver
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleCancel}
              className="bg-orange-600 hover:bg-orange-700 text-white"
              disabled={isProcessing}
            >
              {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Cancelar ajuste
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default AjusteDetalle;
