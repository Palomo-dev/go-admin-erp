'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/components/ui/use-toast';
import { DataTablePagination } from '@/components/ui/DataTablePagination';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Search,
  RefreshCw,
  ArrowLeft,
  Eye,
  ShieldCheck,
  Plus,
  Clock,
  CheckCircle2,
  XCircle,
  Wrench,
  DollarSign,
  Package,
  AlertTriangle,
} from 'lucide-react';
import {
  warrantyClaimsService,
  type WarrantyClaimWithDetails,
  type WarrantyClaimStats,
  type WarrantyClaimStatus,
  type ResolutionType,
} from '@/lib/services/warrantyClaimsService';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { CreateClaimDialog } from './CreateClaimDialog';
import { formatDate, formatCurrency } from '@/utils/Utils';
import { CopyableId } from '@/components/common/CopyableId';

const STATUS_CONFIG: Record<WarrantyClaimStatus, { label: string; color: string; icon: React.ReactNode }> = {
  pending: { label: 'Pendiente', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400', icon: <Clock size={12} /> },
  approved: { label: 'Aprobado', color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400', icon: <CheckCircle2 size={12} /> },
  rejected: { label: 'Rechazado', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400', icon: <XCircle size={12} /> },
  in_process: { label: 'En Proceso', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400', icon: <Wrench size={12} /> },
  resolved: { label: 'Resuelto', color: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400', icon: <CheckCircle2 size={12} /> },
  cancelled: { label: 'Cancelado', color: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400', icon: <XCircle size={12} /> },
};

const RESOLUTION_CONFIG: Record<ResolutionType, { label: string; icon: React.ReactNode }> = {
  repair: { label: 'Reparación', icon: <Wrench size={12} /> },
  replacement: { label: 'Reemplazo', icon: <Package size={12} /> },
  refund: { label: 'Reembolso', icon: <DollarSign size={12} /> },
  store_credit: { label: 'Crédito Tienda', icon: <DollarSign size={12} /> },
  rejected: { label: 'Rechazado', icon: <XCircle size={12} /> },
};

const PAGE_SIZE = 20;

export function GarantiasPage() {
  const { toast } = useToast();
  const router = useRouter();
  const organizationId = getOrganizationId();

  const [claims, setClaims] = useState<WarrantyClaimWithDetails[]>([]);
  const [stats, setStats] = useState<WarrantyClaimStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [totalCount, setTotalCount] = useState(0);

  const [searchTerm, setSearchTerm] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<string>('all');
  const [filtroResolucion, setFiltroResolucion] = useState<string>('all');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const fetchClaims = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setIsRefreshing(true);
    else setLoading(true);

    try {
      const filters = {
        search: searchTerm || undefined,
        status: (filtroEstado !== 'all' ? filtroEstado : undefined) as WarrantyClaimStatus | undefined,
        resolutionType: (filtroResolucion !== 'all' ? filtroResolucion : undefined) as ResolutionType | undefined,
        dateFrom: fechaDesde || undefined,
        dateTo: fechaHasta || undefined,
      };

      const [claimsRes, statsRes] = await Promise.all([
        warrantyClaimsService.getClaims(organizationId, filters, currentPage, PAGE_SIZE),
        warrantyClaimsService.getStats(organizationId),
      ]);

      if (claimsRes.error) throw claimsRes.error;
      setClaims(claimsRes.data);
      setTotalCount(claimsRes.count);

      if (statsRes.error) {
        console.warn('Error obteniendo stats:', statsRes.error);
      } else {
        setStats(statsRes.data);
      }
    } catch (err: any) {
      console.error('Error cargando reclamos:', err);
      toast({
        title: 'Error',
        description: err.message || 'No se pudieron cargar los reclamos de garantía',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [organizationId, searchTerm, filtroEstado, filtroResolucion, fechaDesde, fechaHasta, currentPage, toast]);

  useEffect(() => {
    const timer = setTimeout(() => fetchClaims(), 300);
    return () => clearTimeout(timer);
  }, [fetchClaims]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const handleRefresh = () => {
    setCurrentPage(1);
    fetchClaims(true);
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const statCards = useMemo(() => {
    if (!stats) return [];
    return [
      { label: 'Total', value: stats.total, icon: <ShieldCheck size={18} />, color: 'text-gray-600 dark:text-gray-400' },
      { label: 'Pendientes', value: stats.pending, icon: <Clock size={18} />, color: 'text-yellow-600 dark:text-yellow-400' },
      { label: 'Aprobados', value: stats.approved, icon: <CheckCircle2 size={18} />, color: 'text-green-600 dark:text-green-400' },
      { label: 'Rechazados', value: stats.rejected, icon: <XCircle size={18} />, color: 'text-red-600 dark:text-red-400' },
      { label: 'Resueltos', value: stats.resolved, icon: <CheckCircle2 size={18} />, color: 'text-indigo-600 dark:text-indigo-400' },
      { label: 'Monto Reembolsos', value: formatCurrency(stats.totalRefundAmount, 'COP'), icon: <DollarSign size={18} />, color: 'text-purple-600 dark:text-purple-400' },
    ];
  }, [stats]);

  return (
    <div className="space-y-4 p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/app/inventario">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ArrowLeft size={18} />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
              Reclamos de Garantía
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Gestión de reclamos basados en números de serie
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setShowCreateDialog(true)}>
            <Plus size={16} className="mr-1" />
            Nuevo Reclamo
          </Button>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
            <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
            Actualizar
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {loading && !stats ? (
          Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))
        ) : (
          statCards.map((stat) => (
            <Card key={stat.label} className="dark:bg-gray-800/50 dark:border-gray-700">
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-500 dark:text-gray-400 truncate">{stat.label}</span>
                  <span className={stat.color}>{stat.icon}</span>
                </div>
                <p className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">
                  {stat.value}
                </p>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Filters */}
      <Card className="dark:bg-gray-800/50 dark:border-gray-700">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <Input
                placeholder="Buscar por serial o cliente..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                className="pl-9"
              />
            </div>
            <Select
              value={filtroEstado}
              onValueChange={(v) => { setFiltroEstado(v); setCurrentPage(1); }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estados</SelectItem>
                {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                  <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={filtroResolucion}
              onValueChange={(v) => { setFiltroResolucion(v); setCurrentPage(1); }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Resolución" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las resoluciones</SelectItem>
                {Object.entries(RESOLUTION_CONFIG).map(([key, cfg]) => (
                  <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="date"
              placeholder="Desde"
              value={fechaDesde}
              onChange={(e) => { setFechaDesde(e.target.value); setCurrentPage(1); }}
            />
            <Input
              type="date"
              placeholder="Hasta"
              value={fechaHasta}
              onChange={(e) => { setFechaHasta(e.target.value); setCurrentPage(1); }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="dark:bg-gray-800/50 dark:border-gray-700">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : claims.length === 0 ? (
            <div className="text-center py-12">
              <ShieldCheck className="w-12 h-12 mx-auto mb-3 opacity-30 text-gray-400" />
              <p className="text-gray-500 dark:text-gray-400 mb-1">No se encontraron reclamos de garantía</p>
              <p className="text-sm text-gray-400 dark:text-gray-500">
                Los reclamos aparecerán aquí al registrar garantías sobre seriales vendidos
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[120px]">Reclamo</TableHead>
                      <TableHead className="min-w-[140px]">Serial</TableHead>
                      <TableHead className="min-w-[180px]">Producto</TableHead>
                      <TableHead className="min-w-[140px]">Cliente</TableHead>
                      <TableHead className="min-w-[110px]">Fecha Reclamo</TableHead>
                      <TableHead className="min-w-[100px]">Estado</TableHead>
                      <TableHead className="min-w-[120px]">Resolución</TableHead>
                      <TableHead className="w-[60px]">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {claims.map((claim) => {
                      const statusCfg = STATUS_CONFIG[claim.status] || STATUS_CONFIG.pending;
                      const resCfg = claim.resolution_type ? RESOLUTION_CONFIG[claim.resolution_type] : null;
                      return (
                        <TableRow key={claim.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/70">
                          <TableCell>
                            <CopyableId
                              label={`#${claim.id.substring(0, 8)}`}
                              copyValue={claim.id}
                              onClick={() => router.push(`/app/inventario/garantias/${claim.id}`)}
                            />
                          </TableCell>
                          <TableCell>
                            <span className="font-mono text-sm font-medium text-gray-900 dark:text-white">
                              {claim.serial_numbers?.serial || 'N/A'}
                            </span>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="text-sm font-medium text-gray-900 dark:text-white truncate max-w-[180px]">
                                {claim.serial_numbers?.products?.name || 'N/A'}
                              </span>
                              <span className="text-xs text-gray-500 dark:text-gray-400">
                                SKU: {claim.serial_numbers?.products?.sku || 'N/A'}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-gray-600 dark:text-gray-300">
                            {claim.customers?.full_name || 'N/A'}
                          </TableCell>
                          <TableCell className="text-sm text-gray-600 dark:text-gray-300">
                            {formatDate(claim.claim_date)}
                          </TableCell>
                          <TableCell>
                            <Badge className={`${statusCfg.color} gap-1`} variant="secondary">
                              {statusCfg.icon}
                              {statusCfg.label}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {resCfg ? (
                              <Badge variant="outline" className="gap-1 capitalize">
                                {resCfg.icon}
                                {resCfg.label}
                              </Badge>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Link href={`/app/inventario/garantias/${claim.id}`}>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <Eye size={16} />
                              </Button>
                            </Link>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              <div className="p-3 border-t border-gray-200 dark:border-gray-700">
                <DataTablePagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPageChange={handlePageChange}
                  onPageSizeChange={() => {}}
                  totalItems={totalCount}
                  pageSize={PAGE_SIZE}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>
      {/* Dialog: Crear reclamo */}
      <CreateClaimDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onCreated={() => fetchClaims(true)}
      />
    </div>
  );
}
