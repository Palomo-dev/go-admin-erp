'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Plus,
  Download,
  RefreshCw,
  ArrowLeft,
  ArrowLeftRight,
  MoreVertical,
  Eye,
  XCircle,
  Building2,
  ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from '@/components/ui/use-toast';
import { ToastAction } from '@/components/ui/toast';
import { useTranslations } from 'next-intl';
import { DialogoMotivo, SearchInput } from '@/components/kit';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { transferenciasService, BankTransfer } from '@/lib/services/transferenciasService';
import { NuevaTransferenciaDialog } from './NuevaTransferenciaDialog';
import { PageHeaderSkeleton, StatsSkeleton, CardListSkeleton } from '@/components/common/PageSkeletons';
import { CopyableId } from '@/components/common/CopyableId';
import { BranchBadge } from '@/components/inventario/BranchBadge';
import { useBranch } from '@/lib/context/BranchContext';

const statusColors: Record<string, string> = {
  completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  cancelled: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

const statusLabels: Record<string, string> = {
  completed: 'Completada',
  pending: 'Pendiente',
  cancelled: 'Anulada',
};

export function TransferenciasPage() {
  const router = useRouter();
  const { branchFilter } = useBranch();
  // Las transferencias no traen moneda propia: importes y totales en la moneda base.
  const { formatear: formatCurrency } = useMonedaOrganizacion();
  const { formatDate, getToday } = useFormatDate();
  const t = useTranslations('tesoreria');
  const [transfers, setTransfers] = useState<BankTransfer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // Anular con motivo (DialogoMotivo del kit), no con confirm() + prompt() del navegador.
  const [anulando, setAnulando] = useState<string | null>(null);
  const [anulandoOcupado, setAnulandoOcupado] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [stats, setStats] = useState({
    total: 0,
    count: 0,
    thisMonth: 0,
    pending: 0,
  });

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [transfersData, statsData] = await Promise.all([
        transferenciasService.getTransfers(branchFilter),
        transferenciasService.getStats(branchFilter),
      ]);
      setTransfers(transfersData);
      setStats(statsData);
    } catch (error) {
      // El servicio ya no devuelve [] cuando falla: la lista no finge estar vacía.
      console.error('Error loading data:', error);
      toast({
        title: t('errorTitulo'),
        description: t('errorCarga.transferencias'),
        variant: 'destructive',
        action: (
          <ToastAction altText={t('reintentar')} onClick={() => void loadData()}>
            {t('reintentar')}
          </ToastAction>
        ),
      });
    } finally {
      setIsLoading(false);
    }
  }, [branchFilter, t]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCancel = (id: string) => setAnulando(id);

  const confirmarAnulacion = async (reason: string) => {
    const id = anulando;
    if (!id) return;
    setAnulandoOcupado(true);
    try {
      const result = await transferenciasService.cancelTransfer(id, reason);
      if (result.success) {
        toast({
          title: 'Éxito',
          description: result.repetida ? t('transferenciaYaAnulada') : 'Transferencia anulada correctamente',
        });
        loadData();
      } else {
        toast({ title: t('errorTitulo'), description: t(`errores.${result.codigo ?? 'desconocido'}`), variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Error al anular', variant: 'destructive' });
    } finally {
      setAnulandoOcupado(false);
      setAnulando(null);
    }
  };

  const handleExport = () => {
    const csv = [
      ['ID', 'Fecha', 'Origen', 'Destino', 'Monto', 'Referencia', 'Estado'].join(','),
      ...transfers.map(t => 
        [
          t.id,
          formatDate(t.transfer_date),
          t.from_account?.name || '',
          t.to_account?.name || '',
          t.amount,
          t.reference || '',
          statusLabels[t.status]
        ].join(',')
      ),
    ].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transferencias_${getToday()}.csv`;
    a.click();
  };

  const filteredTransfers = transfers.filter(t =>
    t.from_account?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.to_account?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.reference?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
        <PageHeaderSkeleton />
        <StatsSkeleton count={4} />
        <CardListSkeleton cards={3} columns="1" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/app/finanzas">
            <Button variant="ghost" size="icon" className="hover:bg-gray-100 dark:hover:bg-gray-800">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
            <ArrowLeftRight className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Transferencias Bancarias
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Movimientos entre cuentas bancarias
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleExport} className="dark:border-gray-700">
            <Download className="h-4 w-4 mr-2" />
            Exportar
          </Button>
          <Button onClick={() => setShowNewDialog(true)} className="bg-blue-600 hover:bg-blue-700 text-white">
            <Plus className="h-4 w-4 mr-2" />
            Nueva Transferencia
          </Button>
        </div>
      </div>

      <BranchBadge className="mb-3" />

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500 dark:text-gray-400">
              Total Transferido
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              {formatCurrency(stats.total)}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500 dark:text-gray-400">
              Este Mes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">
              {formatCurrency(stats.thisMonth)}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500 dark:text-gray-400">
              Total Operaciones
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {stats.count}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500 dark:text-gray-400">
              Pendientes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
              {stats.pending}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <SearchInput
          value={searchTerm}
          onChange={setSearchTerm}
          onValueChange={setSearchTerm}
          placeholder="Buscar por cuenta o referencia..."
          className="flex-1"
        />
        <Button variant="outline" onClick={loadData} className="dark:border-gray-700">
          <RefreshCw className="h-4 w-4 mr-2" />
          Actualizar
        </Button>
      </div>

      {/* Table */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="dark:border-gray-700">
                <TableHead className="dark:text-gray-400">Fecha</TableHead>
                <TableHead className="dark:text-gray-400">Origen</TableHead>
                <TableHead className="dark:text-gray-400"></TableHead>
                <TableHead className="dark:text-gray-400">Destino</TableHead>
                <TableHead className="dark:text-gray-400 text-right">Monto</TableHead>
                <TableHead className="dark:text-gray-400">Referencia</TableHead>
                <TableHead className="dark:text-gray-400">Estado</TableHead>
                <TableHead className="dark:text-gray-400 text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTransfers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-gray-500 dark:text-gray-400">
                    No hay transferencias registradas
                  </TableCell>
                </TableRow>
              ) : (
                filteredTransfers.map((transfer) => (
                  <TableRow key={transfer.id} className="dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <TableCell className="text-gray-600 dark:text-gray-300">
                      {formatDate(transfer.transfer_date)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-gray-400" />
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">
                            {transfer.from_account?.name}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {transfer.from_account?.bank_name}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <ArrowRight className="h-4 w-4 text-blue-500" />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-gray-400" />
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">
                            {transfer.to_account?.name}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {transfer.to_account?.bank_name}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-semibold text-blue-600 dark:text-blue-400">
                      {formatCurrency(transfer.amount)}
                    </TableCell>
                    <TableCell className="text-gray-500 dark:text-gray-400">
                      {transfer.reference ? (
                        <CopyableId
                          label={transfer.reference}
                          copyValue={transfer.id}
                          onClick={() => router.push(`/app/finanzas/transferencias/${transfer.id}`)}
                          iconSize={12}
                        />
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge className={statusColors[transfer.status]}>
                        {statusLabels[transfer.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                          <DropdownMenuItem
                            onClick={() => router.push(`/app/finanzas/transferencias/${transfer.id}`)}
                            className="cursor-pointer"
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            Ver Detalle
                          </DropdownMenuItem>
                          {transfer.status === 'completed' && (
                            <>
                              <DropdownMenuSeparator className="dark:bg-gray-700" />
                              <DropdownMenuItem
                                onClick={() => handleCancel(transfer.id)}
                                className="cursor-pointer text-red-600 dark:text-red-400"
                              >
                                <XCircle className="h-4 w-4 mr-2" />
                                Anular
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* New Transfer Dialog */}
      <NuevaTransferenciaDialog
        open={showNewDialog}
        onOpenChange={setShowNewDialog}
        onSuccess={() => {
          setShowNewDialog(false);
          loadData();
        }}
      />
      <DialogoMotivo
        abierto={!!anulando}
        onAbiertoChange={(v) => !v && !anulandoOcupado && setAnulando(null)}
        titulo={t('anular.transferencia.titulo')}
        descripcion={t('anular.descripcion')}
        textoConfirmar={t('anular.transferencia.boton')}
        consecuencias={[t('anular.transferencia.consecuencia')]}
        cargando={anulandoOcupado}
        onConfirmar={(motivo) => void confirmarAnulacion(motivo)}
      />
    </div>
  );
}
