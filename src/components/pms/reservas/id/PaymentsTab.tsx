'use client';

import React, { useState, useEffect } from 'react';
import { useOrganization } from '@/lib/hooks/useOrganization';
import organizationService from '@/lib/services/organizationService';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, CreditCard, CheckCircle, XCircle } from 'lucide-react';

interface Payment {
  id: string;
  amount: number;
  method: string;
  status: string;
  reference: string;
  created_at: string;
}

interface PaymentsTabProps {
  payments: Payment[];
  onAddPayment: (data: { amount: number; method: string; reference: string }) => Promise<void>;
}

const PAYMENT_METHODS: Record<string, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  transfer: 'Transferencia',
  nequi: 'Nequi',
  daviplata: 'Daviplata',
  pse: 'PSE',
  payu: 'PayU',
  mp: 'Mercado Pago',
  credit: 'Crédito',
  check: 'Cheque',
};

export function PaymentsTab({ payments, onAddPayment }: PaymentsTabProps) {
  const { organization } = useOrganization();
  const [showDialog, setShowDialog] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    amount: '',
    method: 'cash',
    reference: '',
  });

  // Estados de métodos de pago dinámicos
  const [paymentMethods, setPaymentMethods] = useState<Array<{
    code: string;
    name: string;
    requires_reference: boolean;
  }>>([]);
  const [isLoadingMethods, setIsLoadingMethods] = useState(false);

  // Cargar métodos de pago de la organización
  useEffect(() => {
    const loadPaymentMethods = async () => {
      if (!organization) return;
      
      setIsLoadingMethods(true);
      try {
        const methods = await organizationService.getOrganizationPaymentMethods(organization.id);
        setPaymentMethods(methods);
        
        // Seleccionar el primer método por defecto si existe
        if (methods.length > 0) {
          setFormData(prev => ({ ...prev, method: methods[0].code }));
        }
      } catch (error) {
        console.error('Error cargando métodos de pago:', error);
        // Fallback a métodos estáticos si falla
        setPaymentMethods([
          { code: 'cash', name: 'Efectivo', requires_reference: false },
          { code: 'card', name: 'Tarjeta', requires_reference: true },
        ]);
      } finally {
        setIsLoadingMethods(false);
      }
    };

    loadPaymentMethods();
  }, [organization]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      await onAddPayment({
        amount: parseFloat(formData.amount),
        method: formData.method,
        reference: formData.reference,
      });

      setFormData({ amount: '', method: 'cash', reference: '' });
      setShowDialog(false);
    } catch (error) {
      console.error('Error adding payment:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    // Los timestamps con hora no necesitan ajuste, pero las fechas sí
    const date = dateString.includes('T') || dateString.includes(':') 
      ? new Date(dateString) 
      : new Date(dateString + 'T00:00:00');
    return date.toLocaleString('es-ES', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const totalPaid = payments
    .filter((p) => p.status === 'completed')
    .reduce((sum, p) => sum + parseFloat(p.amount.toString()), 0);

  return (
    <div className="space-y-4">
      {/* Resumen */}
      <Card className="p-4 bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400">Total Pagado</p>
            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              {formatCurrency(totalPaid)}
            </p>
          </div>
          <Button onClick={() => setShowDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Registrar Pago
          </Button>
        </div>
      </Card>

      {/* Tabla de pagos */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50 dark:bg-gray-800">
              <TableHead>Fecha</TableHead>
              <TableHead>Método</TableHead>
              <TableHead>Referencia</TableHead>
              <TableHead className="text-right">Monto</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payments.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-gray-500 dark:text-gray-400">
                  No hay pagos registrados
                </TableCell>
              </TableRow>
            ) : (
              payments.map((payment) => (
                <TableRow key={payment.id}>
                  <TableCell>{formatDate(payment.created_at)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <CreditCard className="h-4 w-4 text-gray-400" />
                      {paymentMethods.find(m => m.code === payment.method)?.name || PAYMENT_METHODS[payment.method] || payment.method}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-sm">{payment.reference}</TableCell>
                  <TableCell className="text-right font-semibold">
                    {formatCurrency(parseFloat(payment.amount.toString()))}
                  </TableCell>
                  <TableCell>
                    {payment.status === 'completed' ? (
                      <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
                        <CheckCircle className="h-4 w-4" />
                        <span className="text-sm">Completado</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-red-600 dark:text-red-400">
                        <XCircle className="h-4 w-4" />
                        <span className="text-sm">Fallido</span>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Dialog para nuevo pago */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>Registrar Pago</DialogTitle>
              <DialogDescription>
                Ingresa los detalles del pago recibido
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="amount">Monto</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="method">Método de Pago</Label>
                <Select
                  value={formData.method}
                  onValueChange={(value) => setFormData({ ...formData, method: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {isLoadingMethods ? (
                      <SelectItem value="loading" disabled>
                        Cargando...
                      </SelectItem>
                    ) : paymentMethods.length > 0 ? (
                      paymentMethods.map((method) => (
                        <SelectItem key={method.code} value={method.code}>
                          {method.name}
                        </SelectItem>
                      ))
                    ) : (
                      Object.entries(PAYMENT_METHODS).map(([key, label]) => (
                        <SelectItem key={key} value={key}>
                          {label}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="reference">Referencia (opcional)</Label>
                <Input
                  id="reference"
                  placeholder="Número de transacción, cheque, etc."
                  value={formData.reference}
                  onChange={(e) => setFormData({ ...formData, reference: e.target.value })}
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowDialog(false)}
                disabled={isSubmitting}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Registrando...' : 'Registrar Pago'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
