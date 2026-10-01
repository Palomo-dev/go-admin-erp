'use client';

import React, { Suspense, useMemo, useState } from 'react';
import { FoliosHeader, FoliosList, FolioDetailDialog } from '@/components/pms/folios';
import { useSearchParams } from 'next/navigation';
import { leerEnlaceFolio } from '@/components/pms/folios/enlaceFolioLogica';
import { useFoliosPagina } from '@/components/pms/folios/useFoliosPagina';
import { PageHeaderSkeleton, TableSkeleton } from '@/components/common/PageSkeletons';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useBranch } from '@/lib/context/BranchContext';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';

export default function FoliosPage() {
  return <Suspense fallback={<TableSkeleton rows={5} columns={6} />}><FoliosContenido /></Suspense>;
}

function FoliosContenido() {
  const params = useSearchParams();
  const enlace = leerEnlaceFolio(params);
  const { organization } = useOrganization();
  const { branchFilter, isLoading: branchLoading } = useBranch();
  const { folios, loadData, isLoading, isRefreshing, selectedFolioId,
    handleViewDetails, handleCloseDialog, scope } = useFoliosPagina(organization?.id, branchFilter, branchLoading, enlace);
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'closed'>('all');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<'all' | 'with_balance' | 'without_balance'>('all');
  const filteredFolios = useMemo(() => folios.filter(folio =>
    (statusFilter === 'all' || folio.status === statusFilter) &&
    (paymentStatusFilter === 'all' || (paymentStatusFilter === 'with_balance' ? folio.balance > 0 : folio.balance <= 0))
  ), [folios, statusFilter, paymentStatusFilter]);

  if (isLoading && folios.length === 0) {
    return (
      <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-900 overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
          <PageHeaderSkeleton />
          <TableSkeleton rows={5} columns={6} />
        </div>
      </div>
    );
  }

  return (
    <div className={`h-screen flex flex-col bg-gray-50 dark:bg-gray-900 ${isRefreshing ? 'opacity-60 pointer-events-none' : ''}`}>
      {/* Header */}
      <FoliosHeader />

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Filtros */}
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="status">Estado</Label>
              <Select value={statusFilter} onValueChange={value => { if (value === 'all' || value === 'open' || value === 'closed') setStatusFilter(value); }}>
                <SelectTrigger id="status" className="dark:bg-gray-900">
                  <SelectValue placeholder="Todos los estados" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los estados</SelectItem>
                  <SelectItem value="open">Abiertos</SelectItem>
                  <SelectItem value="closed">Cerrados</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="payment-status">Saldo</Label>
              <Select value={paymentStatusFilter} onValueChange={value => { if (value === 'all' || value === 'with_balance' || value === 'without_balance') setPaymentStatusFilter(value); }}>
                <SelectTrigger id="payment-status" className="dark:bg-gray-900">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="with_balance">Con Saldo</SelectItem>
                  <SelectItem value="without_balance">Sin Saldo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Stats Summary */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
            <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
              Total Folios
            </p>
            <p className="text-3xl font-bold text-gray-900 dark:text-gray-100 mt-2">
              {folios.length}
            </p>
          </div>
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
            <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
              Folios Abiertos
            </p>
            <p className="text-3xl font-bold text-green-600 dark:text-green-400 mt-2">
              {folios.filter(f => f.status === 'open').length}
            </p>
          </div>
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
            <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
              Folios Cerrados
            </p>
            <p className="text-3xl font-bold text-gray-600 dark:text-gray-400 mt-2">
              {folios.filter(f => f.status === 'closed').length}
            </p>
          </div>
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
            <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
              Saldo Pendiente Total
            </p>
            <p className="text-3xl font-bold text-amber-600 dark:text-amber-400 mt-2">
              ${folios.filter(f => f.balance > 0).reduce((sum, f) => sum + f.balance, 0).toLocaleString()}
            </p>
          </div>
        </div>

        {/* Folios List */}
        <FoliosList folios={filteredFolios} onViewDetails={handleViewDetails} />
      </div>

      {/* Detail Dialog */}
      <FolioDetailDialog
        key={`${scope}:${selectedFolioId ?? 'cerrado'}`}
        open={!!selectedFolioId}
        onOpenChange={handleCloseDialog}
        folioId={selectedFolioId}
        onUpdate={() => { void loadData(); }}
      />
    </div>
  );
}
