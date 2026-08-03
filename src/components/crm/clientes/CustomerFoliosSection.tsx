'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Receipt,
  Banknote,
  Loader2,
  FileText,
  TrendingDown,
  TrendingUp,
  ExternalLink,
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { formatCurrency } from '@/utils/Utils';
import { supabase } from '@/lib/supabase/config';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { FolioDetailDialog } from '@/components/pms/folios';
import { FolioPaymentDialog } from '@/components/pms/FolioPaymentDialog';

interface CustomerFoliosSectionProps {
  customerId: string;
}

interface FolioWithDetails {
  id: string;
  status: string;
  balance: number;
  created_at: string;
  reservation_id: string | null;
  reservation_code?: string;
  space_label?: string;
  pending_total: number;
  paid_total: number;
  items_count: number;
}

interface InvoiceDebt {
  id: string;
  number: string;
  issue_date: string;
  due_date: string;
  total: number;
  balance: number;
  status: string;
}

export function CustomerFoliosSection({ customerId }: CustomerFoliosSectionProps) {
  const { organization } = useOrganization();
  const [folios, setFolios] = useState<FolioWithDetails[]>([]);
  const [invoices, setInvoices] = useState<InvoiceDebt[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedFolioId, setSelectedFolioId] = useState<string | null>(null);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [paymentFolioId, setPaymentFolioId] = useState<string | null>(null);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);

  const loadData = useCallback(async () => {
    if (!organization?.id || !customerId) return;
    setIsLoading(true);
    try {
      const [foliosResult, invoicesResult] = await Promise.all([
        supabase
          .from('folios')
          .select(`
            id,
            status,
            balance,
            created_at,
            reservation_id,
            reservations (
              code,
              spaces (
                label
              )
            )
          `)
          .eq('reservation_id',
            supabase
              .from('reservations')
              .select('id')
              .eq('customer_id', customerId)
          )
          .order('created_at', { ascending: false }),
        supabase
          .from('invoice_sales')
          .select('id, number, issue_date, due_date, total, balance, status')
          .eq('customer_id', customerId)
          .eq('organization_id', organization.id)
          .gt('balance', 0)
          .order('issue_date', { ascending: false }),
      ]);

      if (foliosResult.error) throw foliosResult.error;
      if (invoicesResult.error) throw invoicesResult.error;

      const foliosData: FolioWithDetails[] = [];

      for (const folio of foliosResult.data || []) {
        const { data: items } = await supabase
          .from('folio_items')
          .select('amount, payment_status')
          .eq('folio_id', folio.id);

        const pending = (items || [])
          .filter((i) => i.payment_status === 'pending')
          .reduce((sum, i) => sum + Number(i.amount), 0);
        const paid = (items || [])
          .filter((i) => i.payment_status === 'paid')
          .reduce((sum, i) => sum + Number(i.amount), 0);

        const reservationData = folio.reservations as any;
        foliosData.push({
          id: folio.id,
          status: folio.status,
          balance: Number(folio.balance),
          created_at: folio.created_at,
          reservation_id: folio.reservation_id,
          reservation_code: reservationData?.code,
          space_label: reservationData?.spaces?.label,
          pending_total: pending,
          paid_total: paid,
          items_count: items?.length || 0,
        });
      }

      setFolios(foliosData);
      setInvoices(
        (invoicesResult.data || []).map((inv) => ({
          ...inv,
          total: Number(inv.total),
          balance: Number(inv.balance),
        })) as InvoiceDebt[]
      );
    } catch (error) {
      console.error('Error cargando folios y deudas:', error);
    } finally {
      setIsLoading(false);
    }
  }, [organization?.id, customerId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const totalFolioPending = folios
    .filter((f) => f.status === 'open')
    .reduce((sum, f) => sum + f.pending_total, 0);
  const totalInvoiceDebt = invoices.reduce((sum, inv) => sum + inv.balance, 0);
  const totalDebt = totalFolioPending + totalInvoiceDebt;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-5 border-amber-200 dark:border-amber-800">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-900/20">
              <TrendingDown className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Deuda Total</p>
              <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                {formatCurrency(totalDebt)}
              </p>
            </div>
          </div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-900/20">
              <Receipt className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Folios Pendientes</p>
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {formatCurrency(totalFolioPending)}
              </p>
            </div>
          </div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-50 dark:bg-red-900/20">
              <FileText className="h-5 w-5 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Facturas por Cobrar</p>
              <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                {formatCurrency(totalInvoiceDebt)}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Folios Section */}
      {folios.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
            <Receipt className="h-4 w-4" />
            Folios de Reservas ({folios.length})
          </h3>
          <div className="space-y-2">
            {folios.map((folio) => (
              <Card
                key={folio.id}
                className={`p-4 ${
                  folio.pending_total > 0
                    ? 'border-amber-200 dark:border-amber-800'
                    : 'border-green-200 dark:border-green-800'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <Badge
                          className={
                            folio.status === 'open'
                              ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                              : 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400'
                          }
                        >
                          {folio.status === 'open' ? 'Abierto' : 'Cerrado'}
                        </Badge>
                        {folio.pending_total > 0 && (
                          <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                            Saldo Pendiente
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {folio.reservation_code && `Reserva ${folio.reservation_code} · `}
                        {folio.space_label && `Espacio ${folio.space_label} · `}
                        {format(new Date(folio.created_at), 'dd MMM yyyy', { locale: es })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="text-right">
                      {folio.pending_total > 0 && (
                        <p className="text-sm font-bold text-amber-600 dark:text-amber-400">
                          {formatCurrency(folio.pending_total)}
                        </p>
                      )}
                      <p className="text-xs text-gray-500">
                        {folio.items_count} items
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedFolioId(folio.id);
                        setShowDetailDialog(true);
                      }}
                    >
                      <ExternalLink className="h-3.5 w-3.5 mr-1" />
                      Ver
                    </Button>
                    {folio.pending_total > 0 && folio.status === 'open' && (
                      <Button
                        size="sm"
                        onClick={() => {
                          setPaymentFolioId(folio.id);
                          setShowPaymentDialog(true);
                        }}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        <Banknote className="h-3.5 w-3.5 mr-1" />
                        Pagar
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Invoices Section */}
      {invoices.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Facturas por Cobrar ({invoices.length})
          </h3>
          <div className="space-y-2">
            {invoices.map((inv) => (
              <Card key={inv.id} className="p-4 border-red-200 dark:border-red-800">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
                          {inv.status === 'overdue' ? 'Vencida' : 'Por cobrar'}
                        </Badge>
                        <span className="text-sm font-medium">{inv.number}</span>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Emitida: {format(new Date(inv.issue_date), 'dd MMM yyyy', { locale: es })}
                        {inv.due_date && ` · Vence: ${format(new Date(inv.due_date), 'dd MMM yyyy', { locale: es })}`}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-red-600 dark:text-red-400">
                      {formatCurrency(inv.balance)}
                    </p>
                    <p className="text-xs text-gray-500">
                      de {formatCurrency(inv.total)}
                    </p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {folios.length === 0 && invoices.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <TrendingUp className="h-12 w-12 text-green-300 dark:text-green-700 mb-3" />
          <p className="text-gray-600 dark:text-gray-400 font-medium">
            Sin deudas pendientes
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-500">
            El cliente no tiene folios ni facturas con saldo pendiente.
          </p>
        </div>
      )}

      {/* Dialogs */}
      <FolioDetailDialog
        open={showDetailDialog}
        onOpenChange={(open) => {
          setShowDetailDialog(open);
          if (!open) setSelectedFolioId(null);
        }}
        folioId={selectedFolioId}
        onUpdate={loadData}
      />

      {paymentFolioId && (
        <FolioPaymentDialog
          open={showPaymentDialog}
          onOpenChange={(open) => {
            setShowPaymentDialog(open);
            if (!open) setPaymentFolioId(null);
          }}
          folioId={paymentFolioId}
          onPaymentComplete={loadData}
        />
      )}
    </div>
  );
}
