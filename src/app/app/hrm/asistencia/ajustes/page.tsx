'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useOrganization } from '@/lib/hooks/useOrganization';
import TimesheetAdjustmentsService from '@/lib/services/timesheetAdjustmentsService';
import type { TimesheetAdjustment, AdjustmentFilters, AdjustmentStatus } from '@/lib/services/timesheetAdjustmentsService';
import { AdjustmentTable } from '@/components/hrm/asistencia/ajustes';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import {
  RefreshCw,
  FileText,
  Plus,
  Clock,
  CheckCircle,
  XCircle,
  ArrowLeft,
  Calendar,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/config';

export default function AjustesPage() {
  const router = useRouter();
  const { organization, isLoading: orgLoading } = useOrganization();
  const { toast } = useToast();

  // Estados
  const [adjustments, setAdjustments] = useState<TimesheetAdjustment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
  });

  // Filtros
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Usuario actual
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUserId(user?.id || null);
    };
    getUser();
  }, []);

  // Servicio
  const getService = useCallback(() => {
    if (!organization?.id) return null;
    return new TimesheetAdjustmentsService(organization.id);
  }, [organization?.id]);

  // Cargar datos
  const loadData = useCallback(async () => {
    const service = getService();
    if (!service) return;

    setIsLoading(true);
    try {
      const filters: AdjustmentFilters = {
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        status: statusFilter !== 'all' ? (statusFilter as AdjustmentStatus) : undefined,
      };

      const [adjustmentsData, statsData] = await Promise.all([
        service.getAll(filters),
        service.getStats(filters),
      ]);

      setAdjustments(adjustmentsData);
      setStats(statsData);
    } catch (error) {
      console.error('Error loading adjustments:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los ajustes',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [getService, dateFrom, dateTo, statusFilter, toast]);

  useEffect(() => {
    if (organization?.id && !orgLoading) {
      loadData();
    }
  }, [organization?.id, orgLoading, loadData]);

  // Handlers
  const handleApprove = async (id: string) => {
    if (!currentUserId) return;
    const service = getService();
    if (!service) return;

    try {
      await service.approve(id, currentUserId);
      toast({ title: 'Ajuste aprobado' });
      await loadData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'No se pudo aprobar',
        variant: 'destructive',
      });
    }
  };

  const handleReject = async (id: string) => {
    if (!currentUserId) return;
    const service = getService();
    if (!service) return;

    try {
      await service.reject(id, currentUserId);
      toast({ title: 'Ajuste rechazado' });
      await loadData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'No se pudo rechazar',
        variant: 'destructive',
      });
    }
  };

  const handleViewDocument = (path: string) => {
    // TODO: Implementar visualización de documento
    window.open(`/api/storage/${path}`, '_blank');
  };

  const handleClearFilters = () => {
    setDateFrom('');
    setDateTo('');
    setStatusFilter('all');
  };

  const hasActiveFilters = dateFrom || dateTo || statusFilter !== 'all';

  if (orgLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Link href="/app/hrm/asistencia/timesheets">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <FileText className="h-7 w-7 text-blue-600" />
              Ajustes de Timesheet
            </h1>
          </div>
          <p className="text-gray-500 dark:text-gray-400 ml-12">
            Solicitudes de ajuste a registros de tiempo
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadData} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
          <Link href="/app/hrm/asistencia/ajustes/nuevo">
            <Button size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Nuevo Ajuste
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <FileText className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-900 dark:text-white">
                  {stats.total}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Total</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center">
                <Clock className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
                  {stats.pending}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Pendientes</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {stats.approved}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Aprobados</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                  {stats.rejected}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Rechazados</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-gray-400" />
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-[150px] bg-white dark:bg-gray-900"
                placeholder="Desde"
              />
              <span className="text-gray-400">-</span>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-[150px] bg-white dark:bg-gray-900"
                placeholder="Hasta"
              />
            </div>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px] bg-white dark:bg-gray-900">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estados</SelectItem>
                <SelectItem value="pending">Pendiente</SelectItem>
                <SelectItem value="approved">Aprobado</SelectItem>
                <SelectItem value="rejected">Rechazado</SelectItem>
              </SelectContent>
            </Select>

            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearFilters}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                <X className="h-4 w-4 mr-1" />
                Limpiar
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardContent className="pt-4">
          <AdjustmentTable
            adjustments={adjustments}
            onApprove={handleApprove}
            onReject={handleReject}
            onViewDocument={handleViewDocument}
            isLoading={isLoading}
          />
        </CardContent>
      </Card>

      {/* Links */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-4">
            <Link href="/app/hrm/asistencia/timesheets">
              <Button variant="outline" size="sm">
                ← Timesheets
              </Button>
            </Link>
            <Link href="/app/hrm/marcacion">
              <Button variant="outline" size="sm">
                Marcación
              </Button>
            </Link>
            <Link href="/app/hrm/marcacion/dispositivos">
              <Button variant="outline" size="sm">
                Dispositivos
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
