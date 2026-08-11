'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CreditCard, Banknote, Wallet, ArrowLeftRight, Loader2, CheckCircle2, Plus, Trash2, Calculator, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { formatCurrency, cn } from '@/utils/Utils';
import foliosService, { type FolioItem } from '@/lib/services/foliosService';
import { obtenerOrganizacionActiva, getOrganizationId, getCurrentBranchId, getCurrentUserId } from '@/lib/hooks/useOrganization';
import { supabase } from '@/lib/supabase/config';
import { POSService } from '@/lib/services/posService';

interface FolioPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folioId: string | null;
  folioBalance?: number;
  lodgingAmount?: number;
  totalAmount?: number;
  reservationId?: string | null;
  taxInfo?: {
    subtotal: number;
    totalTaxAmount: number;
    finalTotal: number;
    taxIncluded: boolean;
  };
  onPaymentComplete?: (payments: { method: string; amount: number }[], totalPaid: number, change: number) => void;
}

interface PaymentEntry {
  id: string;
  method: string;
  amount: number;
}

interface PaymentMethod {
  id: string;
  name: string;
  code: string;
  type: string;
  is_active: boolean;
}

export function FolioPaymentDialog({
  open,
  onOpenChange,
  folioId,
  folioBalance,
  lodgingAmount = 0,
  totalAmount,
  reservationId,
  taxInfo,
  onPaymentComplete,
}: FolioPaymentDialogProps) {
  const [pendingItems, setPendingItems] = useState<FolioItem[]>([]);
  const [totalPending, setTotalPending] = useState(0);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [payments, setPayments] = useState<PaymentEntry[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [cashSessionOpen, setCashSessionOpen] = useState<boolean | null>(null);
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const totalPaid = payments.reduce((sum, p) => sum + (p.amount > 0 ? p.amount : 0), 0);
  const remaining = Math.max(0, totalPending - totalPaid);
  const change = totalPaid > totalPending ? totalPaid - totalPending : 0;

  const loadFolioData = useCallback(async () => {
    if (!folioId) return;
    setIsLoading(true);
    try {
      const folio = await foliosService.getFolioById(folioId);
      const pending = folio?.items?.filter(item => item.payment_status === 'pending') || [];
      setPendingItems(pending);
    } catch (error) {
      console.error('Error cargando folio:', error);
    } finally {
      setIsLoading(false);
    }
  }, [folioId]);

  useEffect(() => {
    if (open && folioId) {
      setSuccess(false);
      setErrorMsg(null);
      loadFolioData();
      const pendingTotal = totalAmount != null ? totalAmount : (folioBalance || 0) + lodgingAmount;
      setTotalPending(pendingTotal);
      setPayments([{ id: crypto.randomUUID(), method: 'cash', amount: pendingTotal }]);
    }
  }, [open, folioId, loadFolioData, folioBalance, lodgingAmount, totalAmount]);

  useEffect(() => {
    if (!open) return;
    const loadData = async () => {
      try {
        const methods = await POSService.getPaymentMethods();
        setPaymentMethods(methods);
      } catch {
        setPaymentMethods([
          { id: 'cash', name: 'Efectivo', code: 'cash', type: 'cash', is_active: true },
          { id: 'card', name: 'Tarjeta', code: 'card', type: 'card', is_active: true },
        ]);
      }

      try {
        const org = obtenerOrganizacionActiva();
        const branchId = getCurrentBranchId();

        const { data: session } = await supabase
          .from('cash_sessions')
          .select('id')
          .eq('organization_id', org.id)
          .eq('branch_id', branchId)
          .eq('status', 'open')
          .order('opened_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        setCashSessionOpen(!!session);
      } catch {
        setCashSessionOpen(null);
      }
    };
    loadData();
  }, [open]);

  const addPayment = () => {
    setPayments([...payments, { id: crypto.randomUUID(), method: 'cash', amount: remaining }]);
  };

  const updatePayment = (id: string, field: 'method' | 'amount', value: string | number) => {
    setPayments(payments.map(p =>
      p.id === id
        ? { ...p, [field]: field === 'amount' ? Number(value) || 0 : value }
        : p
    ));
  };

  const removePayment = (id: string) => {
    if (payments.length > 1) {
      setPayments(payments.filter(p => p.id !== id));
    }
  };

  const handlePayment = async () => {
    if (!folioId || totalPending <= 0) return;
    if (cashSessionOpen === false) return;
    if (totalPaid < totalPending) return;

    setIsProcessing(true);
    try {
      const validPayments = payments.filter(p => p.amount > 0);
      const userId = await getCurrentUserId();
      const paymentMethod = validPayments[0]?.method || 'cash';

      // Calcular montos por concepto
      const folioItemsTotal = pendingItems.reduce((sum, item) => sum + Number(item.amount), 0);
      const lodgingPortion = Math.max(0, totalPending - folioItemsTotal);

      // 1. Pagar items del folio (consumos dentro de la habitación)
      if (folioItemsTotal > 0 && folioId) {
        await foliosService.payFolioItems(
          folioId,
          folioItemsTotal,
          paymentMethod,
          null,
          userId || undefined
        );
      }

      // 2. Pagar hospedaje (reserva + noches extra + impuestos)
      if (lodgingPortion > 0 && reservationId) {
        let orgId = getOrganizationId();
        let branchId = getCurrentBranchId();

        // Fallback: obtener organization_id de la reserva si no está en localStorage
        if (!orgId || orgId === 0) {
          const { data: resData } = await supabase
            .from('reservations')
            .select('organization_id, branch_id')
            .eq('id', reservationId)
            .maybeSingle();
          if (resData?.organization_id) {
            orgId = resData.organization_id;
            branchId = branchId || resData.branch_id || null;
          }
        }

        const { error: lodgingError } = await supabase
          .from('payments')
          .insert({
            organization_id: orgId,
            branch_id: branchId,
            source: 'pms',
            source_id: reservationId,
            method: paymentMethod,
            amount: lodgingPortion,
            currency: 'USD',
            status: 'completed',
            reference: `CHECKOUT-${Date.now()}`,
            created_by: userId || null,
          });

        if (lodgingError) throw lodgingError;
      }

      setSuccess(true);
      onPaymentComplete?.(validPayments.map(p => ({ method: p.method, amount: p.amount })), totalPaid, change);

      setTimeout(() => {
        onOpenChange(false);
      }, 1500);
    } catch (error: any) {
      console.error('Error procesando pago:', error);
      const msg = error?.message?.includes('organization_id')
        ? 'Error de configuración: falta el ID de la organización. Contacte al administrador.'
        : 'Error al procesar el pago. Intente nuevamente.';
      setErrorMsg(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  const canPay = cashSessionOpen !== false && totalPaid >= totalPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Pagar Saldo Pendiente</DialogTitle>
          <DialogDescription>
            Paga los items pendientes del folio
          </DialogDescription>
        </DialogHeader>

        {success ? (
          <div className="flex flex-col items-center justify-center py-8 gap-3">
            <CheckCircle2 className="h-16 w-16 text-green-500" />
            <p className="text-lg font-semibold text-green-600">Pago completado</p>
            <p className="text-sm text-gray-500">Los items han sido marcados como pagados</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Error */}
            {errorMsg && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{errorMsg}</AlertDescription>
              </Alert>
            )}
            {/* Items pendientes */}
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              </div>
            ) : pendingItems.length === 0 && lodgingAmount <= 0 ? (
              <div className="text-center py-8 text-gray-500">
                No hay items pendientes en este folio
              </div>
            ) : (
              <>
                {/* Hospedaje */}
                {lodgingAmount > 0 && (
                  <div className="space-y-2 max-h-32 overflow-y-auto">
                    <div className="flex items-center justify-between p-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-blue-400" />
                        <div>
                          <p className="text-sm font-medium">Hospedaje</p>
                          <p className="text-xs text-gray-500">room_charge</p>
                        </div>
                      </div>
                      <span className="text-sm font-semibold">
                        {formatCurrency(lodgingAmount)}
                      </span>
                    </div>
                  </div>
                )}

                {/* Items pendientes del folio */}
                {pendingItems.length > 0 && (
                  <div className="space-y-2 max-h-32 overflow-y-auto">
                    {pendingItems.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between p-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800"
                      >
                        <div className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-amber-400" />
                          <div>
                            <p className="text-sm font-medium">{item.description}</p>
                            <p className="text-xs text-gray-500">{item.source}</p>
                          </div>
                        </div>
                        <span className="text-sm font-semibold">
                          {formatCurrency(Number(item.amount))}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Desglose de impuestos */}
                {taxInfo && taxInfo.totalTaxAmount > 0 && (
                  <div className="space-y-1.5 p-3 rounded-lg bg-gray-50 dark:bg-gray-800 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500 dark:text-gray-400">
                        Subtotal{taxInfo.taxIncluded ? ' (inc. impuestos)' : ''}
                      </span>
                      <span className="font-medium">{formatCurrency(taxInfo.subtotal)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500 dark:text-gray-400">Impuestos</span>
                      <span className="font-medium text-blue-600 dark:text-blue-400">
                        {formatCurrency(taxInfo.totalTaxAmount)}
                      </span>
                    </div>
                  </div>
                )}

                {/* Total */}
                <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
                  <span className="font-semibold">Total a Pagar:</span>
                  <span className="text-xl font-bold text-amber-600">
                    {formatCurrency(totalPending)}
                  </span>
                </div>

                {/* Multi-pago */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">Métodos de Pago</p>
                    <Button size="sm" variant="outline" onClick={addPayment} disabled={remaining <= 0}>
                      <Plus className="h-3 w-3 mr-1" />
                      Agregar
                    </Button>
                  </div>

                  {payments.map((payment) => (
                    <div key={payment.id} className="flex gap-2 items-start">
                      <div className="flex-1">
                        <Select
                          value={payment.method}
                          onValueChange={(v) => updatePayment(payment.id, 'method', v)}
                        >
                          <SelectTrigger className="dark:bg-gray-800 dark:border-gray-700">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="dark:bg-gray-900 dark:border-gray-800">
                            {paymentMethods.map((m) => (
                              <SelectItem key={m.id} value={m.code}>
                                {m.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="w-32">
                        <Input
                          type="number"
                          value={payment.amount || ''}
                          onChange={(e) => updatePayment(payment.id, 'amount', e.target.value)}
                          placeholder="Monto"
                          className="dark:bg-gray-800 dark:border-gray-700"
                        />
                      </div>
                      {payments.length > 1 && (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => removePayment(payment.id)}
                          className="text-red-500 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>

                {/* Resumen de totales */}
                <div className="space-y-1.5 p-3 rounded-lg bg-gray-50 dark:bg-gray-800 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">Total Pagado:</span>
                    <span className="font-semibold text-green-600">{formatCurrency(totalPaid)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">Restante:</span>
                    <span className={cn('font-semibold', remaining > 0 ? 'text-amber-600' : 'text-green-600')}>
                      {formatCurrency(remaining)}
                    </span>
                  </div>
                  {change > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-500 dark:text-gray-400">Cambio:</span>
                      <span className="font-semibold text-blue-600">{formatCurrency(change)}</span>
                    </div>
                  )}
                </div>

                {/* Warning caja cerrada */}
                {cashSessionOpen === false && (
                  <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-600 dark:text-red-400">
                    No hay una caja abierta. Abre una caja para procesar pagos.
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {!success && (
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isProcessing}
            >
              Cancelar
            </Button>
            <Button
              onClick={handlePayment}
              disabled={isProcessing || isLoading || totalPending <= 0 || !canPay}
              className="bg-green-600 hover:bg-green-700"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Procesando...
                </>
              ) : (
                <>
                  <CreditCard className="h-4 w-4 mr-2" />
                  Pagar {formatCurrency(totalPaid)}
                </>
              )}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
