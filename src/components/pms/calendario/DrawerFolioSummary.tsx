'use client';

import { useState, useEffect, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Receipt, Banknote, Loader2, ShoppingCart } from 'lucide-react';
import { formatCurrency } from '@/utils/Utils';
import { FoliosService, type FolioItem } from '@/lib/services/foliosService';
import { FolioPaymentDialog } from '@/components/pms/FolioPaymentDialog';

interface DrawerFolioSummaryProps {
  spaceId: string;
  refreshTrigger?: number;
}

export function DrawerFolioSummary({ spaceId, refreshTrigger }: DrawerFolioSummaryProps) {
  const [items, setItems] = useState<FolioItem[]>([]);
  const [folioId, setFolioId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);

  const loadFolioItems = useCallback(async () => {
    setIsLoading(true);
    try {
      const { supabase } = await import('@/lib/supabase/config');
      const SpaceConsumptionService = (await import('@/lib/services/spaceConsumptionService')).default;

      const activeReservation = await SpaceConsumptionService.getActiveReservation(spaceId);

      if (!activeReservation?.folio_id) {
        setItems([]);
        setFolioId(null);
        return;
      }

      setFolioId(activeReservation.folio_id);

      const { data, error } = await supabase
        .from('folio_items')
        .select('*')
        .eq('folio_id', activeReservation.folio_id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setItems((data || []) as FolioItem[]);
    } catch (error) {
      console.error('Error cargando items del folio:', error);
      setItems([]);
      setFolioId(null);
    } finally {
      setIsLoading(false);
    }
  }, [spaceId]);

  useEffect(() => {
    loadFolioItems();
  }, [loadFolioItems, refreshTrigger]);

  const pendingItems = items.filter((i) => i.payment_status === 'pending');
  const paidItems = items.filter((i) => i.payment_status === 'paid');
  const totalPending = pendingItems.reduce((sum, i) => sum + Number(i.amount), 0);
  const totalPaid = paidItems.reduce((sum, i) => sum + Number(i.amount), 0);
  const total = items.reduce((sum, i) => sum + Number(i.amount), 0);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-center">
        <ShoppingCart className="h-10 w-10 text-gray-300 dark:text-gray-600 mb-2" />
        <p className="text-sm text-gray-500 dark:text-gray-400">Sin consumos registrados</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Total pendiente destacado */}
      {totalPending > 0 && (
        <div className="flex items-center justify-between p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-amber-400" />
            <span className="text-sm font-medium text-amber-700 dark:text-amber-400">
              Saldo Pendiente
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-amber-600 dark:text-amber-400">
              {formatCurrency(totalPending)}
            </span>
            <Button
              size="sm"
              onClick={() => setShowPaymentDialog(true)}
              className="bg-green-600 hover:bg-green-700 h-7 text-xs"
            >
              <Banknote className="h-3.5 w-3.5 mr-1" />
              Pagar
            </Button>
          </div>
        </div>
      )}

      {/* Items agrupados por estado de pago */}
      <ScrollArea className="h-[280px] pr-3">
        <div className="space-y-3">
          {/* Items pendientes */}
          {pendingItems.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wide">
                Pendientes ({pendingItems.length})
              </p>
              {pendingItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="h-2 w-2 rounded-full bg-amber-400 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{item.description}</p>
                      <p className="text-xs text-gray-500">{item.source}</p>
                    </div>
                  </div>
                  <span className="text-sm font-semibold flex-shrink-0">
                    {formatCurrency(Number(item.amount))}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Items pagados */}
          {paidItems.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-green-600 dark:text-green-400 uppercase tracking-wide">
                Pagados ({paidItems.length})
              </p>
              {paidItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-2 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="h-2 w-2 rounded-full bg-green-400 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{item.description}</p>
                      <p className="text-xs text-gray-500">{item.source}</p>
                    </div>
                  </div>
                  <span className="text-sm font-semibold flex-shrink-0">
                    {formatCurrency(Number(item.amount))}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Resumen */}
      <div className="pt-2 border-t dark:border-gray-700 space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-500 dark:text-gray-400">Total consumos:</span>
          <span className="font-semibold">{formatCurrency(total)}</span>
        </div>
        {totalPaid > 0 && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-green-600 dark:text-green-400">Pagado:</span>
            <span className="font-semibold text-green-600 dark:text-green-400">
              {formatCurrency(totalPaid)}
            </span>
          </div>
        )}
        {totalPending > 0 && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-amber-600 dark:text-amber-400">Pendiente:</span>
            <span className="font-semibold text-amber-600 dark:text-amber-400">
              {formatCurrency(totalPending)}
            </span>
          </div>
        )}
      </div>

      {/* FolioPaymentDialog */}
      {folioId && (
        <FolioPaymentDialog
          open={showPaymentDialog}
          onOpenChange={setShowPaymentDialog}
          folioId={folioId}
          onPaymentComplete={loadFolioItems}
        />
      )}
    </div>
  );
}
