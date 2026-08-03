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
import { CreditCard, Banknote, Wallet, ArrowLeftRight, Loader2, CheckCircle2 } from 'lucide-react';
import { formatCurrency, cn } from '@/utils/Utils';
import { FoliosService, type FolioItem } from '@/lib/services/foliosService';
import { obtenerOrganizacionActiva, getCurrentBranchId } from '@/lib/hooks/useOrganization';
import { supabase } from '@/lib/supabase/config';

interface FolioPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folioId: string | null;
  onPaymentComplete?: () => void;
}

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Efectivo', icon: Banknote },
  { value: 'card', label: 'Tarjeta', icon: CreditCard },
  { value: 'transfer', label: 'Transferencia', icon: ArrowLeftRight },
  { value: 'wallet', label: 'Billetera', icon: Wallet },
];

export function FolioPaymentDialog({
  open,
  onOpenChange,
  folioId,
  onPaymentComplete,
}: FolioPaymentDialogProps) {
  const [pendingItems, setPendingItems] = useState<FolioItem[]>([]);
  const [totalPending, setTotalPending] = useState(0);
  const [selectedMethod, setSelectedMethod] = useState('cash');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [cashSessionOpen, setCashSessionOpen] = useState<boolean | null>(null);
  const [requireCashSession, setRequireCashSession] = useState(false);
  const [success, setSuccess] = useState(false);

  const loadFolioData = useCallback(async () => {
    if (!folioId) return;
    setIsLoading(true);
    try {
      const folio = await FoliosService.getFolioById(folioId);
      const pending = folio?.items?.filter(item => item.payment_status === 'pending') || [];
      setPendingItems(pending);
      setTotalPending(pending.reduce((sum, item) => sum + Number(item.amount), 0));
    } catch (error) {
      console.error('Error cargando folio:', error);
    } finally {
      setIsLoading(false);
    }
  }, [folioId]);

  useEffect(() => {
    if (open && folioId) {
      setSuccess(false);
      loadFolioData();
    }
  }, [open, folioId, loadFolioData]);

  useEffect(() => {
    if (!open) return;
    const checkCashSession = async () => {
      try {
        const org = obtenerOrganizacionActiva();
        const branchId = getCurrentBranchId();

        const { ConfiguracionService } = await import('@/components/pos/configuracion/configuracionService');
        const require = await ConfiguracionService.getBooleanValue(
          'POS_REQUIRE_CASH_SESSION',
          org.id,
          branchId
        );
        setRequireCashSession(require);

        if (require) {
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
        } else {
          setCashSessionOpen(true);
        }
      } catch {
        setCashSessionOpen(null);
      }
    };
    checkCashSession();
  }, [open]);

  const handlePayment = async () => {
    if (!folioId || totalPending <= 0) return;
    if (requireCashSession && !cashSessionOpen) return;

    setIsProcessing(true);
    try {
      const org = obtenerOrganizacionActiva();
      await FoliosService.payFolioItems(
        folioId,
        totalPending,
        selectedMethod,
        null,
        org?.user?.id
      );

      setSuccess(true);
      onPaymentComplete?.();

      setTimeout(() => {
        onOpenChange(false);
      }, 1500);
    } catch (error) {
      console.error('Error procesando pago:', error);
      alert('Error al procesar el pago. Intente nuevamente.');
    } finally {
      setIsProcessing(false);
    }
  };

  const canPay = !requireCashSession || cashSessionOpen;

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
            {/* Items pendientes */}
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              </div>
            ) : pendingItems.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No hay items pendientes en este folio
              </div>
            ) : (
              <>
                <div className="space-y-2 max-h-48 overflow-y-auto">
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

                {/* Total */}
                <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
                  <span className="font-semibold">Total a Pagar:</span>
                  <span className="text-xl font-bold text-amber-600">
                    {formatCurrency(totalPending)}
                  </span>
                </div>

                {/* Selector de método de pago */}
                <div className="space-y-2">
                  <p className="text-sm font-medium">Método de Pago</p>
                  <div className="grid grid-cols-2 gap-2">
                    {PAYMENT_METHODS.map((method) => {
                      const Icon = method.icon;
                      return (
                        <button
                          key={method.value}
                          type="button"
                          onClick={() => setSelectedMethod(method.value)}
                          className={cn(
                            'flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors border',
                            selectedMethod === method.value
                              ? 'bg-blue-500 text-white border-blue-500'
                              : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
                          )}
                        >
                          <Icon className="h-4 w-4" />
                          {method.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Warning caja cerrada */}
                {requireCashSession && !cashSessionOpen && (
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
                  Pagar {formatCurrency(totalPending)}
                </>
              )}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
