'use client';

import { useState, useEffect } from 'react';
import { CreditCard, Calendar, DollarSign, Receipt, Plus, Search, Filter, FileText } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { PaymentRecord } from './types';
import { CuentaPorCobrarDetailService } from './service';
import { formatCurrency } from '@/utils/Utils';

interface PaymentHistoryCardProps {
  accountId: string;
  organizationId: number;
  onUpdate: () => void;
}

export function PaymentHistoryCard({ accountId, organizationId, onUpdate }: PaymentHistoryCardProps) {
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAllCustomerPayments, setShowAllCustomerPayments] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [isLoading, setIsLoading] = useState(false);
  const [isAddingPayment, setIsAddingPayment] = useState(false);
  const [newPayment, setNewPayment] = useState({
    amount: '',
    method: 'efectivo',
    reference: ''
  });

  // Cargar pagos filtrados
  const loadPayments = async () => {
    try {
      setIsLoading(true);
      const result = await CuentaPorCobrarDetailService.obtenerPagosFiltrados(
        accountId,
        organizationId,
        {
          showAllCustomerPayments,
          searchTerm,
          limit: pageSize,
          offset: (currentPage - 1) * pageSize
        }
      );
      setPayments(result.payments);
      setTotalCount(result.totalCount);
    } catch (error) {
      console.error('Error al cargar pagos:', error);
      toast.error('Error al cargar el historial de pagos');
    } finally {
      setIsLoading(false);
    }
  };

  // Efecto para cargar pagos cuando cambien los filtros
  useEffect(() => {
    loadPayments();
  }, [accountId, organizationId, showAllCustomerPayments, searchTerm, currentPage, pageSize]);

  const totalPaid = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const totalPages = Math.ceil(totalCount / pageSize);

  const handleAddPayment = async () => {
    if (!newPayment.amount || parseFloat(newPayment.amount) <= 0) {
      toast.error('Por favor ingresa un monto válido');
      return;
    }

    try {
      setIsAddingPayment(true);
      await CuentaPorCobrarDetailService.aplicarPago(
        accountId,
        parseFloat(newPayment.amount),
        newPayment.method,
        newPayment.reference || undefined
      );
      
      toast.success('Pago aplicado exitosamente');
      setNewPayment({ amount: '', method: 'efectivo', reference: '' });
      loadPayments();
      onUpdate();
    } catch (error) {
      console.error('Error al aplicar pago:', error);
      toast.error('Error al aplicar el pago');
    } finally {
      setIsAddingPayment(false);
    }
  };

  const getMethodBadge = (method: string) => {
    const methodConfig = {
      cash: { label: 'Efectivo', className: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400' },
      efectivo: { label: 'Efectivo', className: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400' },
      transfer: { label: 'Transferencia', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400' },
      transferencia: { label: 'Transferencia', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400' },
      card: { label: 'Tarjeta', className: 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400' },
      tarjeta: { label: 'Tarjeta', className: 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400' },
      check: { label: 'Cheque', className: 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-400' },
      cheque: { label: 'Cheque', className: 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-400' }
    };

    const config = methodConfig[method as keyof typeof methodConfig] || 
                   { label: method, className: 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400' };

    return (
      <Badge variant="outline" className={config.className}>
        {config.label}
      </Badge>
    );
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      completed: { label: 'Completado', className: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400' },
      pending: { label: 'Pendiente', className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400' },
      failed: { label: 'Fallido', className: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400' }
    };

    const config = statusConfig[status as keyof typeof statusConfig] || 
                   { label: status, className: 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400' };

    return (
      <Badge variant="outline" className={config.className}>
        {config.label}
      </Badge>
    );
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-CO', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <Card className="dark:bg-gray-800/50 dark:border-gray-700">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              Historial de Pagos
            </CardTitle>
            <CardDescription>
              {payments.length} pagos registrados • Total pagado: {formatCurrency(totalPaid)}
            </CardDescription>
          </div>
          <Dialog>
            <DialogTrigger asChild>
              <Button className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700">
                <Plus className="h-4 w-4 mr-2" />
                Agregar Pago
              </Button>
            </DialogTrigger>
            <DialogContent className="dark:bg-gray-800 dark:border-gray-700">
              <DialogHeader>
                <DialogTitle className="text-gray-900 dark:text-white">
                  Agregar Nuevo Pago
                </DialogTitle>
                <DialogDescription className="text-gray-600 dark:text-gray-400">
                  Registra un nuevo pago para esta cuenta por cobrar
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="amount" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Monto
                  </Label>
                  <Input
                    id="amount"
                    type="number"
                    placeholder="0.00"
                    value={newPayment.amount}
                    onChange={(e) => setNewPayment({ ...newPayment, amount: e.target.value })}
                    className="dark:bg-gray-900 dark:border-gray-600"
                  />
                </div>
                <div>
                  <Label htmlFor="method" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Método de Pago
                  </Label>
                  <Select value={newPayment.method} onValueChange={(value) => setNewPayment({ ...newPayment, method: value })}>
                    <SelectTrigger className="dark:bg-gray-900 dark:border-gray-600">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="efectivo">Efectivo</SelectItem>
                      <SelectItem value="transferencia">Transferencia</SelectItem>
                      <SelectItem value="tarjeta">Tarjeta</SelectItem>
                      <SelectItem value="cheque">Cheque</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="reference" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Referencia (Opcional)
                  </Label>
                  <Input
                    id="reference"
                    placeholder="Número de referencia o comprobante"
                    value={newPayment.reference}
                    onChange={(e) => setNewPayment({ ...newPayment, reference: e.target.value })}
                    className="dark:bg-gray-900 dark:border-gray-600"
                  />
                </div>
                <Button 
                  onClick={handleAddPayment}
                  disabled={isAddingPayment}
                  className="w-full bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700"
                >
                  {isAddingPayment ? 'Procesando...' : 'Agregar Pago'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-4 space-y-3">
          {/* Buscador */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Buscar por referencia, método o factura..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 dark:bg-gray-900 dark:border-gray-600"
            />
          </div>
          
          {/* Filtros */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-gray-500" />
                <Select value={showAllCustomerPayments.toString()} onValueChange={(value) => setShowAllCustomerPayments(value === 'true')}>
                  <SelectTrigger className="w-48 dark:bg-gray-900 dark:border-gray-600">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="false">Solo esta cuenta</SelectItem>
                    <SelectItem value="true">Todos los pagos del cliente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            {/* Paginación - Tamaño de página */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">Mostrar:</span>
              <Select value={pageSize.toString()} onValueChange={(value) => { setPageSize(Number(value)); setCurrentPage(1); }}>
                <SelectTrigger className="w-20 dark:bg-gray-900 dark:border-gray-600">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5</SelectItem>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="20">20</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-500 dark:text-gray-400">Cargando pagos...</p>
          </div>
        ) : payments.length === 0 ? (
          <div className="text-center py-8">
            <Receipt className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              No hay pagos registrados
            </h3>
            <p className="text-gray-500 dark:text-gray-400">
              {showAllCustomerPayments 
                ? 'Este cliente no tiene pagos registrados.'
                : 'Esta cuenta no tiene pagos registrados.'
              }
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {payments.map((payment: PaymentRecord, index: number) => (
              <div key={payment.id} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-blue-100 dark:bg-blue-900/20 rounded-full">
                    <DollarSign className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-gray-900 dark:text-white">
                        {formatCurrency(payment.amount)}
                      </span>
                      {getMethodBadge(payment.method)}
                      {getStatusBadge(payment.status)}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                      <Calendar className="h-3 w-3" />
                      <span>{formatDate(payment.created_at)}</span>
                      {payment.reference && (
                        <>
                          <span>•</span>
                          <span>Ref: {payment.reference}</span>
                        </>
                      )}
                      {payment.invoice_number && (
                        <>
                          <span>•</span>
                          <span>Factura: {payment.invoice_number}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          
            {/* Controles de paginación */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  Mostrando {((currentPage - 1) * pageSize) + 1} a {Math.min(currentPage * pageSize, totalCount)} de {totalCount} pagos
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(currentPage - 1)}
                    disabled={currentPage <= 1}
                    className="dark:border-gray-600"
                  >
                    Anterior
                  </Button>
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    Página {currentPage} de {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(currentPage + 1)}
                    disabled={currentPage >= totalPages}
                    className="dark:border-gray-600"
                  >
                    Siguiente
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
