'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Clock, CheckCircle2, XCircle, DollarSign, ShoppingBag, FileText, Receipt, Target, Check } from 'lucide-react';
import { formatCurrency } from '@/utils/Utils';
import { toast } from '@/components/ui/use-toast';
import type { Commission, CommissionStatus, CommissionSourceType, CommissionType } from '@/lib/services/commissionsService';
import { commissionsService } from '@/lib/services/commissionsService';

interface ComisionesListProps {
  commissions: Commission[];
  isLoading: boolean;
  onRefresh: () => void;
}

const STATUS_CONFIG: Record<CommissionStatus, { label: string; icon: typeof Clock; color: string }> = {
  accrued: { label: 'Pendiente', icon: Clock, color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' },
  paid: { label: 'Pagada', icon: CheckCircle2, color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
  cancelled: { label: 'Cancelada', icon: XCircle, color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
};

const SOURCE_CONFIG: Record<CommissionSourceType, { label: string; icon: typeof DollarSign }> = {
  sale: { label: 'Venta POS', icon: ShoppingBag },
  invoice_sale: { label: 'Factura Venta', icon: FileText },
  invoice_purchase: { label: 'Factura Compra', icon: Receipt },
  opportunity: { label: 'Oportunidad', icon: Target },
};

const TYPE_LABELS: Record<CommissionType, string> = {
  salesperson: 'Vendedor',
  intermediation_sale: 'Intermediación Venta',
  intermediation_purchase: 'Intermediación Compra',
};

export function ComisionesList({ commissions, isLoading, onRefresh }: ComisionesListProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [payingId, setPayingId] = useState<string | null>(null);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === commissions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(commissions.map((c) => c.id)));
    }
  };

  const handleMarkAsPaid = async (id: string) => {
    setPayingId(id);
    try {
      await commissionsService.markAsPaid(id);
      toast({ title: 'Comisión marcada como pagada' });
      onRefresh();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setPayingId(null);
    }
  };

  const handleBulkPay = async () => {
    try {
      await commissionsService.bulkMarkAsPaid(Array.from(selectedIds));
      toast({ title: `${selectedIds.size} comisiones marcadas como pagadas` });
      setSelectedIds(new Set());
      onRefresh();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-gray-500 dark:text-gray-400">Cargando comisiones...</p>
      </div>
    );
  }

  if (commissions.length === 0) {
    return (
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardContent className="py-12 text-center">
          <DollarSign className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400">No hay comisiones registradas</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
          <span className="text-sm text-blue-700 dark:text-blue-400">
            {selectedIds.size} comisión(es) seleccionada(s)
          </span>
          <Button size="sm" onClick={handleBulkPay} className="bg-green-600 hover:bg-green-700 text-white">
            <Check className="h-4 w-4 mr-1" />
            Marcar como pagadas
          </Button>
        </div>
      )}

      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="p-3 text-left">
                    <Checkbox
                      checked={selectedIds.size === commissions.length && commissions.length > 0}
                      onCheckedChange={toggleSelectAll}
                    />
                  </th>
                  <th className="p-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400">Comisionista</th>
                  <th className="p-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400">Tipo</th>
                  <th className="p-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400">Origen</th>
                  <th className="p-3 text-right text-xs font-medium text-gray-600 dark:text-gray-400">Base</th>
                  <th className="p-3 text-right text-xs font-medium text-gray-600 dark:text-gray-400">Tasa</th>
                  <th className="p-3 text-right text-xs font-medium text-gray-600 dark:text-gray-400">Comisión</th>
                  <th className="p-3 text-center text-xs font-medium text-gray-600 dark:text-gray-400">Estado</th>
                  <th className="p-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400">Fecha</th>
                  <th className="p-3 text-center text-xs font-medium text-gray-600 dark:text-gray-400">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {commissions.map((c) => {
                  const statusCfg = STATUS_CONFIG[c.status];
                  const sourceCfg = SOURCE_CONFIG[c.source_type];
                  return (
                    <tr
                      key={c.id}
                      className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30"
                    >
                      <td className="p-3">
                        <Checkbox
                          checked={selectedIds.has(c.id)}
                          onCheckedChange={() => toggleSelect(c.id)}
                        />
                      </td>
                      <td className="p-3">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {c.payee_name || 'N/A'}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">
                          {c.payee_type === 'employee' ? 'Empleado' : c.payee_type === 'supplier' ? 'Proveedor' : 'Tercero'}
                        </p>
                      </td>
                      <td className="p-3">
                        <span className="text-sm text-gray-700 dark:text-gray-300">
                          {TYPE_LABELS[c.commission_type] || c.commission_type}
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-1.5">
                          <sourceCfg.icon className="h-3.5 w-3.5 text-gray-400" />
                          <span className="text-sm text-gray-700 dark:text-gray-300">
                            {sourceCfg.label}
                          </span>
                        </div>
                      </td>
                      <td className="p-3 text-right text-sm text-gray-700 dark:text-gray-300">
                        {formatCurrency(Number(c.base_amount))}
                      </td>
                      <td className="p-3 text-right text-sm text-gray-700 dark:text-gray-300">
                        {Number(c.commission_rate)}%
                      </td>
                      <td className="p-3 text-right">
                        <span className="text-sm font-semibold text-gray-900 dark:text-white">
                          {formatCurrency(Number(c.commission_amount))}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <Badge className={statusCfg.color}>
                          <statusCfg.icon className="h-3 w-3 mr-1" />
                          {statusCfg.label}
                        </Badge>
                      </td>
                      <td className="p-3 text-sm text-gray-600 dark:text-gray-400">
                        {c.accrued_at
                          ? format(new Date(c.accrued_at), 'dd/MM/yyyy', { locale: es })
                          : '-'}
                      </td>
                      <td className="p-3 text-center">
                        {c.status === 'accrued' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleMarkAsPaid(c.id)}
                            disabled={payingId === c.id}
                            className="h-7 text-xs border-green-200 text-green-700 hover:bg-green-50 dark:border-green-800 dark:text-green-400 dark:hover:bg-green-900/20"
                          >
                            {payingId === c.id ? '...' : 'Pagar'}
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
