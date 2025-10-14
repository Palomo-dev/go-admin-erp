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
    const baseClasses = "text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5";
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className={`${baseClasses} border-yellow-500 text-yellow-600 dark:border-yellow-400 dark:text-yellow-400`}>Pendiente</Badge>;
      case 'approved':
        return <Badge variant="default" className={`${baseClasses} bg-green-500 hover:bg-green-600 dark:bg-green-600 dark:hover:bg-green-700`}>Aprobado</Badge>;
      case 'rejected':
        return <Badge variant="destructive" className={`${baseClasses} dark:bg-red-900/30 dark:text-red-400`}>Rechazado</Badge>;
      case 'processed':
        return <Badge variant="secondary" className={`${baseClasses} dark:bg-gray-700 dark:text-gray-300`}>Procesado</Badge>;
      default:
        return <Badge variant="outline" className={`${baseClasses} dark:border-gray-600 dark:text-gray-300`}>{status}</Badge>;
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
      case 'pending': return 'text-yellow-600 dark:text-yellow-400';
      case 'completed': return 'text-green-600 dark:text-green-400';
      case 'failed': return 'text-red-600 dark:text-red-400';
      case 'cancelled': return 'text-gray-600 dark:text-gray-400';
      default: return 'text-gray-600 dark:text-gray-400';
    }
  };

  return (
    <>
      <Dialog open={isOpen && !mostrarDetalle} onOpenChange={onClose}>
        <DialogContent className="max-w-full sm:max-w-4xl lg:max-w-6xl max-h-[90vh] overflow-hidden dark:bg-gray-800 dark:border-gray-700">
          <DialogHeader className="pb-3">
            <DialogTitle className="flex flex-col sm:flex-row items-start sm:items-center gap-2 text-base sm:text-lg text-gray-900 dark:text-white">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 sm:w-5 sm:h-5" />
                <span>Aprobación de Pagos</span>
              </div>
              {pagosPendientes.length > 0 && (
                <Badge variant="secondary" className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 dark:bg-gray-700 dark:text-gray-300">
                  {pagosPendientes.length} pendiente{pagosPendientes.length !== 1 ? 's' : ''}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="overflow-y-auto max-h-[70vh] -mx-3 sm:-mx-6 px-3 sm:px-6">
            {loading ? (
              // Skeleton loading
              <div className="space-y-3 sm:space-y-4">
                {Array.from({ length: 3 }).map((_, index) => (
                  <Card key={index} className="dark:bg-gray-800/50 dark:border-gray-700">
                    <CardContent className="p-3 sm:p-4">
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                        <div className="space-y-2 flex-1 w-full">
                          <Skeleton className="h-3 sm:h-4 w-full sm:w-48 dark:bg-gray-700" />
                          <Skeleton className="h-3 w-3/4 sm:w-32 dark:bg-gray-700" />
                          <Skeleton className="h-3 w-1/2 sm:w-24 dark:bg-gray-700" />
                        </div>
                        <div className="space-y-2 w-full sm:w-auto">
                          <Skeleton className="h-3 sm:h-4 w-20 dark:bg-gray-700" />
                          <Skeleton className="h-3 w-16 dark:bg-gray-700" />
                        </div>
                        <div className="flex gap-2 w-full sm:w-auto">
                          <Skeleton className="h-8 w-full sm:w-20 dark:bg-gray-700" />
                          <Skeleton className="h-8 w-full sm:w-20 dark:bg-gray-700" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : pagosPendientes.length === 0 ? (
              // Estado vacío
              <Card className="dark:bg-gray-800/50 dark:border-gray-700">
                <CardContent className="p-6 sm:p-8 text-center">
                  <CheckCircle className="w-10 h-10 sm:w-12 sm:h-12 text-green-500 dark:text-green-400 mx-auto mb-3 sm:mb-4" />
                  <h3 className="text-base sm:text-lg font-medium text-gray-900 dark:text-white mb-2">
                    No hay pagos pendientes
                  </h3>
                  <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400">
                    Todos los pagos programados han sido revisados
                  </p>
                </CardContent>
              </Card>
            ) : (
              // Lista de pagos
              <div className="space-y-3 sm:space-y-4">
                {pagosPendientes.map((pago) => (
                  <Card key={pago.id} className="border-l-4 border-l-blue-500 dark:border-l-blue-400 dark:bg-gray-800/50 dark:border-gray-700">
                    <CardContent className="p-3 sm:p-4">
                      <div className="flex flex-col lg:flex-row items-start gap-3 sm:gap-4">
                        {/* Información del pago */}
                        <div className="flex-1 space-y-2 sm:space-y-3 w-full">
                          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                            <div className="flex items-center gap-2">
                              <Building2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-500 dark:text-gray-400 flex-shrink-0" />
                              <span className="text-sm sm:text-base font-medium text-gray-900 dark:text-white">
                                {pago.account_payable?.supplier?.name || `Pago #${pago.id.slice(0, 8)}`}
                              </span>
                            </div>
                            {pago.account_payable?.supplier?.nit && (
                              <span className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 ml-7 sm:ml-0">
                                NIT: {pago.account_payable.supplier.nit}
                              </span>
                            )}
                          </div>
                          
                          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                            <div className="flex items-center gap-1">
                              <Calendar className="w-3 h-3 sm:w-4 sm:h-4" />
                              <span>
                                Creado: {formatDate(pago.created_at || '')}
                              </span>
                            </div>
                            <div className={`flex items-center gap-1 ${getStatusColor(pago.status)}`}>
                              <Clock className="w-3 h-3 sm:w-4 sm:h-4" />
                              <span>{getDaysFromCreated(pago.created_at || '')}</span>
                            </div>
                          </div>

                          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-xs sm:text-sm">
                            <div className="flex items-center gap-1 text-gray-700 dark:text-gray-300">
                              <User className="w-3 h-3 sm:w-4 sm:h-4 text-gray-500 dark:text-gray-400 flex-shrink-0" />
                              <span className="truncate">
                                {`${pago.created_by_user?.first_name || ''} ${pago.created_by_user?.last_name || ''}`.trim() || pago.created_by_user?.email || 'Usuario'}
                              </span>
                            </div>
                            {pago.reference && (
                              <div className="flex items-center gap-1 text-gray-500 dark:text-gray-400">
                                <MessageSquare className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
                                <span className="truncate max-w-full sm:max-w-xs">{pago.reference}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Monto y estado */}
                        <div className="flex sm:block justify-between lg:text-right lg:space-y-2 w-full lg:w-auto">
                          <div>
                            <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">Monto</p>
                            <p className="text-base sm:text-xl font-bold text-blue-600 dark:text-blue-400">
                              {formatCurrency(pago.amount)}
                            </p>
                          </div>
                          <div className="flex items-start lg:justify-end">
                            {getStatusBadge(pago.status)}
                          </div>
                        </div>

                        {/* Acciones */}
                        <div className="flex lg:flex-col gap-2 w-full lg:w-auto">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => verDetalle(pago)}
                            className="flex-1 lg:flex-none h-8 sm:h-9 text-xs sm:text-sm dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                          >
                            <Eye className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1" />
                            <span>Ver</span>
                          </Button>
                          
                          <div className="flex gap-2 flex-1 lg:flex-none">
                            <Button
                              size="sm"
                              onClick={() => handleAprobar(pago.id)}
                              disabled={procesando === pago.id}
                              className="flex-1 lg:flex-none h-8 sm:h-9 bg-green-600 hover:bg-green-700 dark:bg-green-600 dark:hover:bg-green-700 text-white"
                            >
                              {procesando === pago.id ? (
                                <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin" />
                              ) : (
                                <CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                              )}
                            </Button>
                            
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleRechazar(pago.id)}
                              disabled={procesando === pago.id}
                              className="flex-1 lg:flex-none h-8 sm:h-9 dark:bg-red-900/30 dark:hover:bg-red-900/50 dark:text-red-400"
                            >
                              {procesando === pago.id ? (
                                <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin" />
                              ) : (
                                <XCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                              )}
                            </Button>
                          </div>
                        </div>
                      </div>

                      {/* Campo de comentarios */}
                      <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-gray-200 dark:border-gray-700">
                        <Label htmlFor={`comentario-${pago.id}`} className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">
                          Comentarios de aprobación/rechazo
                        </Label>
                        <Textarea
                          id={`comentario-${pago.id}`}
                          placeholder="Agregar comentarios sobre la decisión..."
                          rows={2}
                          value={comentarios[pago.id] || ''}
                          onChange={(e) => handleComentarioChange(pago.id, e.target.value)}
                          className="mt-1.5 text-xs sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
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
        <DialogContent className="max-w-full sm:max-w-xl lg:max-w-2xl max-h-[90vh] overflow-y-auto dark:bg-gray-800 dark:border-gray-700">
          <DialogHeader className="pb-3">
            <DialogTitle className="flex items-center gap-2 text-base sm:text-lg text-gray-900 dark:text-white">
              <FileText className="w-4 h-4 sm:w-5 sm:h-5" />
              <span>Detalle del Pago Programado</span>
            </DialogTitle>
          </DialogHeader>

          {pagoSeleccionado && (
            <div className="space-y-3 sm:space-y-4">
              {/* Información del proveedor */}
              <Card className="dark:bg-gray-800/50 dark:border-gray-700 border-gray-200">
                <CardContent className="p-3 sm:p-4">
                  <h4 className="text-sm sm:text-base font-medium mb-2 sm:mb-3 text-gray-900 dark:text-white">Información del Proveedor</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 text-xs sm:text-sm">
                    <div>
                      <span className="text-gray-600 dark:text-gray-400">Nombre:</span>
                      <p className="font-medium text-gray-900 dark:text-white">
                        {pagoSeleccionado.account_payable?.supplier?.name || 'Sin nombre'}
                      </p>
                    </div>
                    {pagoSeleccionado.account_payable?.supplier?.nit && (
                      <div>
                        <span className="text-gray-600 dark:text-gray-400">NIT:</span>
                        <p className="font-medium text-gray-900 dark:text-white">{pagoSeleccionado.account_payable.supplier.nit}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Información del pago */}
              <Card className="dark:bg-gray-800/50 dark:border-gray-700 border-gray-200">
                <CardContent className="p-3 sm:p-4">
                  <h4 className="text-sm sm:text-base font-medium mb-2 sm:mb-3 text-gray-900 dark:text-white">Información del Pago</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 text-xs sm:text-sm">
                    <div>
                      <span className="text-gray-600 dark:text-gray-400">Monto:</span>
                      <p className="font-medium text-base sm:text-lg text-gray-900 dark:text-white">{formatCurrency(pagoSeleccionado.amount)}</p>
                    </div>
                    <div>
                      <span className="text-gray-600 dark:text-gray-400">Fecha creado:</span>
                      <p className="font-medium text-gray-900 dark:text-white">{formatDate(pagoSeleccionado.created_at || '')}</p>
                    </div>
                    <div>
                      <span className="text-gray-600 dark:text-gray-400">Monto del pago:</span>
                      <p className="font-medium text-gray-900 dark:text-white">
                        {formatCurrency(pagoSeleccionado.amount || 0)}
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-600 dark:text-gray-400">Fecha vencimiento:</span>
                      <p className="font-medium text-gray-900 dark:text-white">
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
              <Card className="dark:bg-gray-800/50 dark:border-gray-700 border-gray-200">
                <CardContent className="p-3 sm:p-4">
                  <h4 className="text-sm sm:text-base font-medium mb-2 sm:mb-3 text-gray-900 dark:text-white">Información de Solicitud</h4>
                  <div className="space-y-2 sm:space-y-3 text-xs sm:text-sm">
                    <div>
                      <span className="text-gray-600 dark:text-gray-400">Solicitado por:</span>
                      <p className="font-medium text-gray-900 dark:text-white">
                        {`${pagoSeleccionado.created_by_user?.first_name || ''} ${pagoSeleccionado.created_by_user?.last_name || ''}`.trim() || 
                         pagoSeleccionado.created_by_user?.email || 
                         'Usuario desconocido'}
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-600 dark:text-gray-400">Fecha de solicitud:</span>
                      <p className="font-medium text-gray-900 dark:text-white">
                        {pagoSeleccionado.created_at ? formatDate(pagoSeleccionado.created_at) : 'Sin fecha'}
                      </p>
                    </div>
                    {pagoSeleccionado.reference && (
                      <div>
                        <span className="text-gray-600 dark:text-gray-400">Referencia:</span>
                        <p className="mt-1 sm:mt-1.5 p-2 sm:p-3 bg-gray-50 dark:bg-gray-700 rounded text-xs sm:text-sm text-gray-900 dark:text-gray-300">
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
