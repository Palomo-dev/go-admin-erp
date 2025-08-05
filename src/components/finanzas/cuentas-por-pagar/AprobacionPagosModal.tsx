'use client';

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { 
  CheckCircle,
  XCircle,
  Clock,
  Calendar,
  DollarSign,
  Building2,
  User,
  MessageSquare,
  Loader2,
  AlertCircle,
  Eye,
  FileText
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';

import { CuentasPorPagarService } from './CuentasPorPagarService';
import { PaymentWithRelations } from './types';
import { formatCurrency, formatDate } from '@/utils/Utils';

interface AprobacionPagosModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPagoAprobado: () => void;
}

export function AprobacionPagosModal({
  isOpen,
  onClose,
  onPagoAprobado
}: AprobacionPagosModalProps) {
  // Estados
  const [pagosPendientes, setPagosPendientes] = useState<PaymentWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [procesando, setProcesando] = useState<string | null>(null);
  const [comentarios, setComentarios] = useState<Record<string, string>>({});
  const [pagoSeleccionado, setPagoSeleccionado] = useState<PaymentWithRelations | null>(null);
  const [mostrarDetalle, setMostrarDetalle] = useState(false);

  const { toast } = useToast();

  useEffect(() => {
    if (isOpen) {
      cargarPagosPendientes();
    }
  }, [isOpen]);

  const cargarPagosPendientes = async () => {
    try {
      setLoading(true);
      const pagos = await CuentasPorPagarService.obtenerPagosProgramados({
        status: 'pending'
      });
      setPagosPendientes(pagos);
    } catch (error) {
      console.error('Error cargando pagos pendientes:', error);
      toast({
        title: "Error",
        description: "No se pudieron cargar los pagos pendientes",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAprobar = async (pagoId: string) => {
    try {
      setProcesando(pagoId);
      
      await CuentasPorPagarService.aprobarPago(
        pagoId, 
        comentarios[pagoId] || undefined
      );
      
      toast({
        title: "Pago aprobado",
        description: "El pago fue aprobado correctamente",
      });
      
      // Recargar lista
      await cargarPagosPendientes();
      onPagoAprobado();
    } catch (error: any) {
      console.error('Error aprobando pago:', error);
      toast({
        title: "Error al aprobar",
        description: error.message || "Ocurrió un error inesperado",
        variant: "destructive",
      });
    } finally {
      setProcesando(null);
    }
  };

  const handleRechazar = async (pagoId: string) => {
    try {
      setProcesando(pagoId);
      
      const comentario = comentarios[pagoId];
      if (!comentario?.trim()) {
        toast({
          title: "Comentario requerido",
          description: "Debe agregar un comentario al rechazar un pago",
          variant: "destructive",
        });
        return;
      }
      
      await CuentasPorPagarService.rechazarPago(pagoId, comentario);
      
      toast({
        title: "Pago rechazado",
        description: "El pago fue rechazado correctamente",
      });
      
      // Recargar lista
      await cargarPagosPendientes();
      onPagoAprobado();
    } catch (error: any) {
      console.error('Error rechazando pago:', error);
      toast({
        title: "Error al rechazar",
        description: error.message || "Ocurrió un error inesperado",
        variant: "destructive",
      });
    } finally {
      setProcesando(null);
    }
  };

  const handleComentarioChange = (pagoId: string, comentario: string) => {
    setComentarios(prev => ({ ...prev, [pagoId]: comentario }));
  };

  const verDetalle = (pago: PaymentWithRelations) => {
    setPagoSeleccionado(pago);
    setMostrarDetalle(true);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline">Pendiente</Badge>;
      case 'approved':
        return <Badge variant="default">Aprobado</Badge>;
      case 'rejected':
        return <Badge variant="destructive">Rechazado</Badge>;
      case 'processed':
        return <Badge variant="secondary">Procesado</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getDaysFromCreated = (createdDate: string) => {
    const created = new Date(createdDate);
    const today = new Date();
    const diffTime = today.getTime() - created.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Creado hoy';
    if (diffDays === 1) return 'Creado ayer';
    return `Creado hace ${diffDays} días`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'text-yellow-600';
      case 'completed': return 'text-green-600';
      case 'failed': return 'text-red-600';
      case 'cancelled': return 'text-gray-600';
      default: return 'text-gray-600';
    }
  };

  return (
    <>
      <Dialog open={isOpen && !mostrarDetalle} onOpenChange={onClose}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Aprobación de Pagos Programados
              {pagosPendientes.length > 0 && (
                <Badge variant="secondary">
                  {pagosPendientes.length} pendiente{pagosPendientes.length !== 1 ? 's' : ''}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="overflow-y-auto max-h-[70vh] -mx-6 px-6">
            {loading ? (
              // Skeleton loading
              <div className="space-y-4">
                {Array.from({ length: 3 }).map((_, index) => (
                  <Card key={index}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="space-y-2">
                          <Skeleton className="h-4 w-48" />
                          <Skeleton className="h-3 w-32" />
                          <Skeleton className="h-3 w-24" />
                        </div>
                        <div className="space-y-2">
                          <Skeleton className="h-4 w-20" />
                          <Skeleton className="h-3 w-16" />
                        </div>
                        <div className="flex gap-2">
                          <Skeleton className="h-8 w-20" />
                          <Skeleton className="h-8 w-20" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : pagosPendientes.length === 0 ? (
              // Estado vacío
              <Card>
                <CardContent className="p-8 text-center">
                  <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                    No hay pagos pendientes
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400">
                    Todos los pagos programados han sido revisados
                  </p>
                </CardContent>
              </Card>
            ) : (
              // Lista de pagos
              <div className="space-y-4">
                {pagosPendientes.map((pago) => (
                  <Card key={pago.id} className="border-l-4 border-l-blue-500">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        {/* Información del pago */}
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-2">
                            <Building2 className="w-4 h-4 text-gray-500" />
                            <span className="font-medium">
                              {pago.account_payable?.supplier?.name || `Pago #${pago.id.slice(0, 8)}`}
                            </span>
                            {pago.account_payable?.supplier?.nit && (
                              <span className="text-sm text-gray-500">
                                NIT: {pago.account_payable.supplier.nit}
                              </span>
                            )}
                          </div>
                          
                          <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                            <div className="flex items-center gap-1">
                              <Calendar className="w-4 h-4" />
                              <span>
                                Creado: {formatDate(pago.created_at || '')}
                              </span>
                            </div>
                            <div className={`flex items-center gap-1 ${getStatusColor(pago.status)}`}>
                              <Clock className="w-4 h-4" />
                              <span>{getDaysFromCreated(pago.created_at || '')}</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-4 text-sm">
                            <div className="flex items-center gap-1">
                              <User className="w-4 h-4 text-gray-500" />
                              <span>
                                Solicitado por: {`${pago.created_by_user?.first_name || ''} ${pago.created_by_user?.last_name || ''}`.trim() || pago.created_by_user?.email || 'Usuario'}
                              </span>
                            </div>
                            {pago.reference && (
                              <div className="flex items-center gap-1 text-gray-500">
                                <MessageSquare className="w-4 h-4" />
                                <span className="truncate max-w-xs">{pago.reference}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Monto y estado */}
                        <div className="text-right space-y-2">
                          <div>
                            <p className="text-sm text-gray-600 dark:text-gray-400">Monto</p>
                            <p className="text-xl font-bold text-blue-600 dark:text-blue-400">
                              {formatCurrency(pago.amount)}
                            </p>
                          </div>
                          <div>
                            {getStatusBadge(pago.status)}
                          </div>
                        </div>

                        {/* Acciones */}
                        <div className="ml-4 space-y-2">
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => verDetalle(pago)}
                            >
                              <Eye className="w-4 h-4 mr-1" />
                              Ver
                            </Button>
                          </div>
                          
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => handleAprobar(pago.id)}
                              disabled={procesando === pago.id}
                              className="bg-green-600 hover:bg-green-700"
                            >
                              {procesando === pago.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <CheckCircle className="w-4 h-4" />
                              )}
                            </Button>
                            
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleRechazar(pago.id)}
                              disabled={procesando === pago.id}
                            >
                              {procesando === pago.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <XCircle className="w-4 h-4" />
                              )}
                            </Button>
                          </div>
                        </div>
                      </div>

                      {/* Campo de comentarios */}
                      <div className="mt-4 pt-4 border-t">
                        <Label htmlFor={`comentario-${pago.id}`}>
                          Comentarios de aprobación/rechazo
                        </Label>
                        <Textarea
                          id={`comentario-${pago.id}`}
                          placeholder="Agregar comentarios sobre la decisión..."
                          rows={2}
                          value={comentarios[pago.id] || ''}
                          onChange={(e) => handleComentarioChange(pago.id, e.target.value)}
                          className="mt-1"
                        />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal de detalle */}
      <Dialog open={mostrarDetalle} onOpenChange={() => setMostrarDetalle(false)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Detalle del Pago Programado
            </DialogTitle>
          </DialogHeader>

          {pagoSeleccionado && (
            <div className="space-y-4">
              {/* Información del proveedor */}
              <Card>
                <CardContent className="p-4">
                  <h4 className="font-medium mb-2">Información del Proveedor</h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-600 dark:text-gray-400">Nombre:</span>
                      <p className="font-medium">
                        {pagoSeleccionado.account_payable?.supplier?.name || 'Sin nombre'}
                      </p>
                    </div>
                    {pagoSeleccionado.account_payable?.supplier?.nit && (
                      <div>
                        <span className="text-gray-600 dark:text-gray-400">NIT:</span>
                        <p className="font-medium">{pagoSeleccionado.account_payable.supplier.nit}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Información del pago */}
              <Card>
                <CardContent className="p-4">
                  <h4 className="font-medium mb-2">Información del Pago</h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-600 dark:text-gray-400">Monto:</span>
                      <p className="font-medium text-lg">{formatCurrency(pagoSeleccionado.amount)}</p>
                    </div>
                    <div>
                      <span className="text-gray-600 dark:text-gray-400">Fecha creado:</span>
                      <p className="font-medium">{formatDate(pagoSeleccionado.created_at || '')}</p>
                    </div>
                    <div>
                      <span className="text-gray-600 dark:text-gray-400">Monto del pago:</span>
                      <p className="font-medium">
                        {formatCurrency(pagoSeleccionado.amount || 0)}
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-600 dark:text-gray-400">Fecha vencimiento:</span>
                      <p className="font-medium">
                        {pagoSeleccionado.account_payable?.due_date 
                          ? formatDate(pagoSeleccionado.account_payable.due_date)
                          : 'Sin fecha'
                        }
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Información de solicitud */}
              <Card>
                <CardContent className="p-4">
                  <h4 className="font-medium mb-2">Información de Solicitud</h4>
                  <div className="space-y-2 text-sm">
                    <div>
                      <span className="text-gray-600 dark:text-gray-400">Solicitado por:</span>
                      <p className="font-medium">
                        {`${pagoSeleccionado.created_by_user?.first_name || ''} ${pagoSeleccionado.created_by_user?.last_name || ''}`.trim() || 
                         pagoSeleccionado.created_by_user?.email || 
                         'Usuario desconocido'}
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-600 dark:text-gray-400">Fecha de solicitud:</span>
                      <p className="font-medium">
                        {pagoSeleccionado.created_at ? formatDate(pagoSeleccionado.created_at) : 'Sin fecha'}
                      </p>
                    </div>
                    {pagoSeleccionado.reference && (
                      <div>
                        <span className="text-gray-600 dark:text-gray-400">Referencia:</span>
                        <p className="mt-1 p-2 bg-gray-50 dark:bg-gray-800 rounded text-sm">
                          {pagoSeleccionado.reference}
                        </p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
