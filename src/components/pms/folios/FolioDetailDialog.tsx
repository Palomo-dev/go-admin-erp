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
import { Separator } from '@/components/ui/separator';
import { Card } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import {
  User,
  Calendar,
  DollarSign,
  Plus,
  Trash2,
  CreditCard,
  Receipt,
  Loader2,
  FileText,
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import FoliosService, { type Folio, type FolioItem } from '@/lib/services/foliosService';

interface FolioDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folioId: string | null;
  onUpdate?: () => void;
}

export function FolioDetailDialog({
  open,
  onOpenChange,
  folioId,
  onUpdate,
}: FolioDetailDialogProps) {
  const { toast } = useToast();
  const [folio, setFolio] = useState<Folio | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [summary, setSummary] = useState({
    subtotal: 0,
    payments: 0,
    balance: 0,
    itemCount: 0,
    paymentCount: 0,
  });

  useEffect(() => {
    if (open && folioId) {
      loadFolioDetails();
    }
  }, [open, folioId]);

  const loadFolioDetails = async () => {
    if (!folioId) return;

    try {
      setIsLoading(true);
      const [folioData, summaryData] = await Promise.all([
        FoliosService.getFolioById(folioId),
        FoliosService.getFolioSummary(folioId),
      ]);

      if (folioData) {
        setFolio(folioData);
        setSummary(summaryData);
      }
    } catch (error) {
      console.error('Error cargando detalles del folio:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los detalles del folio',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!folioId || !confirm('¿Estás seguro de eliminar este item?')) return;

    try {
      await FoliosService.deleteFolioItem(itemId, folioId);
      await loadFolioDetails();
      if (onUpdate) onUpdate();
      toast({
        title: 'Item eliminado',
        description: 'El item ha sido eliminado del folio',
      });
    } catch (error) {
      console.error('Error eliminando item:', error);
      toast({
        title: 'Error',
        description: 'No se pudo eliminar el item',
        variant: 'destructive',
      });
    }
  };

  const handleCloseFolio = async () => {
    if (!folioId || !confirm('¿Estás seguro de cerrar este folio?')) return;

    try {
      await FoliosService.closeFolio(folioId);
      await loadFolioDetails();
      if (onUpdate) onUpdate();
      toast({
        title: 'Folio cerrado',
        description: 'El folio ha sido cerrado exitosamente',
      });
    } catch (error) {
      console.error('Error cerrando folio:', error);
      toast({
        title: 'Error',
        description: 'No se pudo cerrar el folio',
        variant: 'destructive',
      });
    }
  };

  const handleReopenFolio = async () => {
    if (!folioId || !confirm('¿Estás seguro de reabrir este folio?')) return;

    try {
      await FoliosService.reopenFolio(folioId);
      await loadFolioDetails();
      if (onUpdate) onUpdate();
      toast({
        title: 'Folio reabierto',
        description: 'El folio ha sido reabierto exitosamente',
      });
    } catch (error) {
      console.error('Error reabriendo folio:', error);
      toast({
        title: 'Error',
        description: 'No se pudo reabrir el folio',
        variant: 'destructive',
      });
    }
  };

  const getStatusInfo = (status: string) => {
    switch (status) {
      case 'open':
        return {
          label: 'Abierto',
          className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
        };
      case 'closed':
        return {
          label: 'Cerrado',
          className: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
        };
      default:
        return {
          label: status,
          className: 'bg-gray-100 text-gray-800',
        };
    }
  };

  if (!folio && !isLoading) {
    return null;
  }

  const statusInfo = folio ? getStatusInfo(folio.status) : null;
  const customerName = folio?.reservations?.customers
    ? `${folio.reservations.customers.first_name} ${folio.reservations.customers.last_name}`
    : 'Sin cliente';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">
            Detalle del Folio
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          </div>
        ) : folio ? (
          <div className="space-y-6">
            {/* Header Info */}
            <Card className="p-4 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <FileText className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      Folio #{folio.id.slice(0, 8).toUpperCase()}
                    </h3>
                    {statusInfo && (
                      <Badge className={statusInfo.className}>
                        {statusInfo.label}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                    <Calendar className="h-4 w-4" />
                    <span>
                      Creado: {format(new Date(folio.created_at), "dd 'de' MMMM 'de' yyyy, HH:mm", { locale: es })}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  {folio.status === 'open' ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCloseFolio}
                    >
                      Cerrar Folio
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleReopenFolio}
                    >
                      Reabrir Folio
                    </Button>
                  )}
                </div>
              </div>

              {/* Customer Info */}
              <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                <User className="h-4 w-4" />
                <span className="font-medium">{customerName}</span>
              </div>
              {folio.reservations?.customers?.email && (
                <div className="text-sm text-gray-600 dark:text-gray-400 ml-6 mt-1">
                  {folio.reservations.customers.email}
                </div>
              )}
            </Card>

            {/* Items Section */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                  <Receipt className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  Items ({summary.itemCount})
                </h3>
              </div>

              {folio.items && folio.items.length > 0 ? (
                <div className="space-y-2">
                  {folio.items.map((item) => (
                    <Card key={item.id} className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline" className="text-xs">
                              {item.source}
                            </Badge>
                            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                              {item.description}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {format(new Date(item.created_at), "dd/MM/yyyy HH:mm", { locale: es })}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={`text-lg font-bold ${
                            item.amount >= 0 
                              ? 'text-gray-900 dark:text-gray-100' 
                              : 'text-red-600 dark:text-red-400'
                          }`}>
                            ${Math.abs(item.amount).toLocaleString()}
                          </span>
                          {folio.status === 'open' && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteItem(item.id)}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              ) : (
                <Card className="p-8 text-center">
                  <Receipt className="h-12 w-12 text-gray-400 dark:text-gray-600 mx-auto mb-3" />
                  <p className="text-gray-600 dark:text-gray-400">
                    No hay items en este folio
                  </p>
                </Card>
              )}
            </div>

            {/* Payments Section */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                  <CreditCard className="h-5 w-5 text-green-600 dark:text-green-400" />
                  Pagos ({summary.paymentCount})
                </h3>
              </div>

              {folio.payments && folio.payments.length > 0 ? (
                <div className="space-y-2">
                  {folio.payments.map((payment) => (
                    <Card key={payment.id} className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline" className="text-xs">
                              {payment.method || 'N/A'}
                            </Badge>
                            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                              {payment.reference || 'Pago'}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {format(new Date(payment.created_at), "dd/MM/yyyy HH:mm", { locale: es })}
                          </p>
                        </div>
                        <span className="text-lg font-bold text-green-600 dark:text-green-400">
                          ${(payment.amount || 0).toLocaleString()}
                        </span>
                      </div>
                    </Card>
                  ))}
                </div>
              ) : (
                <Card className="p-8 text-center">
                  <CreditCard className="h-12 w-12 text-gray-400 dark:text-gray-600 mx-auto mb-3" />
                  <p className="text-gray-600 dark:text-gray-400">
                    No hay pagos registrados
                  </p>
                </Card>
              )}
            </div>

            <Separator />

            {/* Summary */}
            <Card className="p-6 bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900">
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Subtotal:</span>
                  <span className="font-semibold text-gray-900 dark:text-gray-100">
                    ${summary.subtotal.toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Pagos:</span>
                  <span className="font-semibold text-green-600 dark:text-green-400">
                    -${summary.payments.toLocaleString()}
                  </span>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                    <span className="text-lg font-bold text-gray-900 dark:text-gray-100">
                      Balance:
                    </span>
                  </div>
                  <span className={`text-2xl font-bold ${
                    summary.balance > 0
                      ? 'text-red-600 dark:text-red-400'
                      : summary.balance < 0
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-gray-600 dark:text-gray-400'
                  }`}>
                    ${Math.abs(summary.balance).toLocaleString()}
                  </span>
                </div>
                {summary.balance > 0 && (
                  <p className="text-xs text-red-600 dark:text-red-400 text-right">
                    Saldo pendiente
                  </p>
                )}
                {summary.balance < 0 && (
                  <p className="text-xs text-green-600 dark:text-green-400 text-right">
                    Saldo a favor
                  </p>
                )}
              </div>
            </Card>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
