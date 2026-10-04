'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { EmptyState, StatCard } from '@/components/kit';
import type { ResumenMonedaBase } from '@/components/crm/kit/monedaCrm';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useCustomerFolios } from './useCustomerFolios';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Receipt, Banknote, FileText, TrendingUp, ExternalLink } from 'lucide-react';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { formatMoneda } from '@/lib/utils/moneda';
import { Skeleton } from '@/components/ui/skeleton';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { FolioDetailDialog } from '@/components/pms/folios';
import { FolioPaymentDialog } from '@/components/pms/FolioPaymentDialog';

interface CustomerFoliosSectionProps {
  customerId: string;
}

export function CustomerFoliosSection({ customerId }: CustomerFoliosSectionProps) {
  const { organization } = useOrganization();
  const t = useTranslations('clientes.ficha');
  const tf = useTranslations('crm.customerFolios');
  const { formatDate } = useFormatDate();
  const { folios, invoices, summary, isLoading, error, loadData } = useCustomerFolios(
    organization?.id,
    customerId,
  );
  const { paraDocumento } = useMonedaOrganizacion();
  const [selectedFolioId, setSelectedFolioId] = useState<string | null>(null);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [paymentFolioId, setPaymentFolioId] = useState<string | null>(null);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);

  useEffect(() => {
    setSelectedFolioId(null);
    setShowDetailDialog(false);
    setPaymentFolioId(null);
    setShowPaymentDialog(false);
  }, [organization?.id, customerId]);

  const formatBase = (value: number) =>
    summary?.base ? formatMoneda(value, paraDocumento(summary.base)) : '—';
  const summaryValue = (value: ResumenMonedaBase | null | undefined) =>
    value && !value.sinTasa.length ? formatBase(value.total) : '—';
  const summaryDetail = (value: ResumenMonedaBase | null | undefined) =>
    !value || value.sinTasa.length ? tf('moneyMissing') : summary?.base;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        variante="error"
        descripcion={t('cuentas.errorCarga')}
        onReintentar={() => void loadData()}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          etiqueta={tf('totalDebt')}
          valor={summaryValue(summary?.total)}
          detalle={summaryDetail(summary?.total)}
        />
        <StatCard
          etiqueta={tf('pendingFolios')}
          valor={summaryValue(summary?.folios)}
          detalle={summaryDetail(summary?.folios)}
        />
        <StatCard
          etiqueta={tf('unpaidInvoices')}
          valor={summaryValue(summary?.invoices)}
          detalle={summaryDetail(summary?.invoices)}
        />
      </div>

      {/* Folios Section */}
      {folios.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
            <Receipt className="h-4 w-4" />
            {tf('foliosTitle', { count: folios.length })}
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
                          {tf(folio.status === 'open' ? 'open' : 'closed')}
                        </Badge>
                        {folio.pending_total > 0 && (
                          <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                            {tf('pendingBalance')}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {folio.reservation_code &&
                          `${tf('reservationInfo', { code: folio.reservation_code })} · `}
                        {folio.space_label && `${tf('spaceInfo', { label: folio.space_label })} · `}
                        {formatDate(folio.created_at)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="text-right">
                      {folio.pending_total > 0 && (
                        <p className="text-sm font-bold text-amber-600 dark:text-amber-400">
                          {formatBase(folio.pending_total)}
                        </p>
                      )}
                      <p className="text-xs text-gray-500">
                        {tf('itemCount', { count: folio.items_count })}
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
                      {tf('view')}
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
                        {tf('pay')}
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
            {tf('invoicesTitle', { count: invoices.length })}
          </h3>
          <div className="space-y-2">
            {invoices.map((inv) => (
              <Card key={inv.id} className="p-4 border-red-200 dark:border-red-800">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
                          {tf(inv.status === 'overdue' ? 'overdue' : 'toCollect')}
                        </Badge>
                        <span className="text-sm font-medium">{inv.number}</span>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {tf('issuedAt', { date: formatDate(inv.issue_date) })}
                        {inv.due_date && ` · ${tf('dueAt', { date: formatDate(inv.due_date) })}`}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-red-600 dark:text-red-400">
                      {inv.currency ? formatMoneda(inv.balance, paraDocumento(inv.currency)) : '—'}
                    </p>
                    <p className="text-xs text-gray-500">
                      {tf('invoiceTotal', {
                        amount: inv.currency
                          ? formatMoneda(inv.total, paraDocumento(inv.currency))
                          : '—',
                      })}
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
          <p className="text-gray-600 dark:text-gray-400 font-medium">{tf('noDebtTitle')}</p>
          <p className="text-sm text-gray-500 dark:text-gray-500">{tf('noDebtDesc')}</p>
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
