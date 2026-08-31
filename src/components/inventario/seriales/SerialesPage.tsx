'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  Package,
  CheckCircle2,
  XCircle,
  Truck,
  AlertTriangle,
  Clock,
  RotateCcw,
  ShieldCheck,
  Hash,
} from 'lucide-react';
import { serialTrackingService } from '@/lib/services/serialTrackingService';
import type { SerialWithDetails, SerialStats, SerialStatus } from '@/lib/services/serialTrackingService';
import { getOrganizationId, getCurrentBranchId } from '@/lib/hooks/useOrganization';
import { formatDate, formatCurrency } from '@/utils/Utils';
import { CopyableId } from '@/components/common/CopyableId';

const STATUS_CONFIG: Record<SerialStatus, { label: string; color: string; icon: React.ReactNode }> = {
  in_stock: { label: 'En Stock', color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400', icon: <CheckCircle2 size={12} /> },
  reserved: { label: 'Reservado', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400', icon: <Clock size={12} /> },
  sold: { label: 'Vendido', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400', icon: <Package size={12} /> },
  returned: { label: 'Devuelto', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400', icon: <RotateCcw size={12} /> },
  in_transit: { label: 'En Tránsito', color: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400', icon: <Truck size={12} /> },
  damaged: { label: 'Dañado', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400', icon: <AlertTriangle size={12} /> },
  rma: { label: 'RMA', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400', icon: <AlertTriangle size={12} /> },
  warranty_claim: { label: 'Reclamo Garantía', color: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400', icon: <ShieldCheck size={12} /> },
};

const PAGE_SIZE = 20;

export function SerialesPage() {
  const { toast } = useToast();
  const router = useRouter();
  const organizationId = getOrganizationId();
  const currentBranchId = getCurrentBranchId();

  const [seriales, setSeriales] = useState<SerialWithDetails[]>([]);
  const [stats, setStats] = useState<SerialStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [totalCount, setTotalCount] = useState(0);

  const [searchTerm, setSearchTerm] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<string>('all');
  const [filtroSucursal, setFiltroSucursal] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);

  const [sucursales, setSucursales] = useState<{ id: number; name: string }[]>([]);

  const fetchSucursales = useCallback(async () => {
    try {
      const { supabase } = await import('@/lib/supabase/config');
      const { data } = await supabase
        .from('branches')
        .select('id, name')
        .eq('organization_id', organizationId)
        .order('name');
      if (data) setSucursales(data);
    } catch (err) {
      console.error('Error cargando sucursales:', err);
    }
  }, [organizationId]);

  const fetchSeriales = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setIsRefreshing(true);
    else setLoading(true);

    try {
      const filters: Parameters<typeof serialTrackingService.getSerials>[1] = {
        search: searchTerm || undefined,
        status: (filtroEstado !== 'all' ? filtroEstado : undefined) as SerialStatus | undefined,
        branchId: filtroSucursal !== 'all' ? Number(filtroSucursal) : undefined,
      };

      const [serialsRes, statsRes] = await Promise.all([
        serialTrackingService.getSerials(organizationId, filters, currentPage, PAGE_SIZE),
        serialTrackingService.getStats(organizationId),
      ]);

      if (serialsRes.error) throw serialsRes.error;
      setSeriales(serialsRes.data);
      setTotalCount(serialsRes.count);

      if (statsRes.error) {
        console.warn('Error obteniendo stats:', statsRes.error);
      } else {
        setStats(statsRes.data);
      }
    } catch (err: any) {
      console.error('Error cargando seriales:', err);
      toast({
        title: 'Error',
        description: err.message || 'No se pudieron cargar los seriales',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [organizationId, searchTerm, filtroEstado, filtroSucursal, currentPage, toast]);

  useEffect(() => {
    fetchSucursales();
  }, [fetchSucursales]);

  useEffect(() => {
    const timer = setTimeout(() => fetchSeriales(), 300);
    return () => clearTimeout(timer);
  }, [fetchSeriales]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const handleRefresh = () => {
    setCurrentPage(1);
    fetchSeriales(true);
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const statCards = useMemo(() => {
    if (!stats) return [];
    return [
      { label: 'Total', value: stats.total, icon: <Hash size={18} />, color: 'text-gray-600 dark:text-gray-400' },
      { label: 'En Stock', value: stats.in_stock, icon: <CheckCircle2 size={18} />, color: 'text-green-600 dark:text-green-400' },
      { label: 'Vendidos', value: stats.sold, icon: <Package size={18} />, color: 'text-purple-600 dark:text-purple-400' },
      { label: 'Reservados', value: stats.reserved, icon: <Clock size={18} />, color: 'text-blue-600 dark:text-blue-400' },
      { label: 'Dañados', value: stats.damaged, icon: <AlertTriangle size={18} />, color: 'text-red-600 dark:text-red-400' },
      { label: 'En Tránsito', value: stats.in_transit, icon: <Truck size={18} />, color: 'text-cyan-600 dark:text-cyan-400' },
      { label: 'Devueltos', value: stats.returned, icon: <RotateCcw size={18} />, color: 'text-orange-600 dark:text-orange-400' },
      { label: 'Garantía por vencer', value: stats.warrantyExpiringSoon, icon: <ShieldCheck size={18} />, color: 'text-indigo-600 dark:text-indigo-400' },
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
              Números de Serie
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Trazabilidad de productos con serial
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
          <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
          Actualizar
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        {loading && !stats ? (
          Array.from({ length: 8 }).map((_, i) => (
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <Input
                placeholder="Buscar por serial..."
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
              value={filtroSucursal}
              onValueChange={(v) => { setFiltroSucursal(v); setCurrentPage(1); }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Sucursal" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las sucursales</SelectItem>
                {sucursales.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
          ) : seriales.length === 0 ? (
            <div className="text-center py-12">
              <Package className="w-12 h-12 mx-auto mb-3 opacity-30 text-gray-400" />
              <p className="text-gray-500 dark:text-gray-400 mb-1">No se encontraron seriales</p>
              <p className="text-sm text-gray-400 dark:text-gray-500">
                Los seriales aparecerán aquí al recibir productos con tracking de serial
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[140px]">Serial</TableHead>
                      <TableHead className="min-w-[180px]">Producto</TableHead>
                      <TableHead className="min-w-[100px]">Estado</TableHead>
                      <TableHead className="min-w-[120px]">Sucursal</TableHead>
                      <TableHead className="min-w-[120px]">Proveedor</TableHead>
                      <TableHead className="min-w-[100px]">Canal Venta</TableHead>
                      <TableHead className="min-w-[140px]">Cliente</TableHead>
                      <TableHead className="min-w-[100px]">Recepción</TableHead>
                      <TableHead className="w-[60px]">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {seriales.map((serial) => {
                      const statusCfg = STATUS_CONFIG[serial.status] || STATUS_CONFIG.in_stock;
                      return (
                        <TableRow key={serial.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/70">
                          <TableCell>
                            <CopyableId
                              label={serial.serial}
                              copyValue={serial.serial}
                              onClick={() => router.push(`/app/inventario/seriales/${serial.id}`)}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="text-sm font-medium text-gray-900 dark:text-white truncate max-w-[180px]">
                                {serial.products?.name || 'N/A'}
                              </span>
                              <span className="text-xs text-gray-500 dark:text-gray-400">
                                SKU: {serial.products?.sku || 'N/A'}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge className={`${statusCfg.color} gap-1`} variant="secondary">
                              {statusCfg.icon}
                              {statusCfg.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-gray-600 dark:text-gray-300">
                            {serial.current_branch?.name || 'N/A'}
                          </TableCell>
                          <TableCell className="text-sm text-gray-600 dark:text-gray-300">
                            {serial.suppliers?.name || 'N/A'}
                          </TableCell>
                          <TableCell className="text-sm text-gray-600 dark:text-gray-300">
                            {serial.sale_channel && serial.sale_channel !== 'in_stock' ? (
                              <Badge variant="outline" className="capitalize">
                                {serial.sale_channel}
                              </Badge>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-gray-600 dark:text-gray-300">
                            {serial.customers?.full_name || '—'}
                          </TableCell>
                          <TableCell className="text-sm text-gray-600 dark:text-gray-300">
                            {serial.received_date ? formatDate(serial.received_date) : '—'}
                          </TableCell>
                          <TableCell>
                            <Link href={`/app/inventario/seriales/${serial.id}`}>
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
    </div>
  );
}
