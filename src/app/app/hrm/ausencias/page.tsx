'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useOrganization } from '@/lib/hooks/useOrganization';
import LeaveRequestsService from '@/lib/services/leaveRequestsService';
import type { LeaveRequest, LeaveRequestFilters, LeaveRequestStats, LeaveRequestStatus } from '@/lib/services/leaveRequestsService';
import { LeaveRequestsTable, LeaveRequestFilters as Filters } from '@/components/hrm/ausencias';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import {
  RefreshCw,
  Calendar,
  Plus,
  Clock,
  CheckCircle,
  XCircle,
  Ban,
  Settings,
  PiggyBank,
} from 'lucide-react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/config';

export default function AusenciasPage() {
  const router = useRouter();
  const { organization, isLoading: orgLoading } = useOrganization();
  const { toast } = useToast();

  // Estados
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<{ id: string; code: string; name: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState<LeaveRequestStats>({
    total: 0,
    requested: 0,
    approved: 0,
    rejected: 0,
    cancelled: 0,
  });

  // Filtros
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [leaveTypeFilter, setLeaveTypeFilter] = useState('all');

  // Dialogs
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Obtener usuario actual
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
    return new LeaveRequestsService(organization.id);
  }, [organization?.id]);

  // Cargar datos
  const loadData = useCallback(async () => {
    const service = getService();
    if (!service) return;

    setIsLoading(true);
    try {
      const filters: LeaveRequestFilters = {
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        status: statusFilter !== 'all' ? (statusFilter as LeaveRequestStatus) : undefined,
        leaveTypeId: leaveTypeFilter !== 'all' ? leaveTypeFilter : undefined,
      };

      const [requestsData, typesData, statsData] = await Promise.all([
        service.getAll(filters),
        service.getLeaveTypes(),
        service.getStats(filters),
      ]);

      setRequests(requestsData);
      setLeaveTypes(typesData);
      setStats(statsData);
    } catch (error) {
      console.error('Error loading leave requests:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las solicitudes',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [getService, dateFrom, dateTo, statusFilter, leaveTypeFilter, toast]);

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
      toast({ title: 'Solicitud aprobada' });
      await loadData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'No se pudo aprobar',
        variant: 'destructive',
      });
    }
  };

  const handleReject = async () => {
    if (!rejectId || !currentUserId || !rejectReason.trim()) return;
    const service = getService();
    if (!service) return;

    try {
      await service.reject(rejectId, currentUserId, rejectReason);
      toast({ title: 'Solicitud rechazada' });
      setRejectId(null);
      setRejectReason('');
      await loadData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'No se pudo rechazar',
        variant: 'destructive',
      });
    }
  };

  const handleCancel = async () => {
    if (!cancelId || !currentUserId || !cancelReason.trim()) return;
    const service = getService();
    if (!service) return;

    try {
      await service.cancel(cancelId, currentUserId, cancelReason);
      toast({ title: 'Solicitud cancelada' });
      setCancelId(null);
      setCancelReason('');
      await loadData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'No se pudo cancelar',
        variant: 'destructive',
      });
    }
  };

  const handleView = (id: string) => {
    router.push(`/app/hrm/ausencias/${id}`);
  };

  const handleClearFilters = () => {
    setDateFrom('');
    setDateTo('');
    setStatusFilter('all');
    setLeaveTypeFilter('all');
  };

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
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Calendar className="h-7 w-7 text-blue-600" />
            Ausencias
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Gestión de solicitudes de ausencia
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadData} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
          <Link href="/app/hrm/ausencias/nuevo">
            <Button size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Nueva Solicitud
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <Calendar className="h-5 w-5 text-blue-600 dark:text-blue-400" />
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
                  {stats.requested}
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
                <p className="text-xs text-gray-500 dark:text-gray-400">Aprobadas</p>
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
                <p className="text-xs text-gray-500 dark:text-gray-400">Rechazadas</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-gray-100 dark:bg-gray-900/30 flex items-center justify-center">
                <Ban className="h-5 w-5 text-gray-600 dark:text-gray-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-600 dark:text-gray-400">
                  {stats.cancelled}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Canceladas</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardContent className="pt-4">
          <Filters
            dateFrom={dateFrom}
            dateTo={dateTo}
            status={statusFilter}
            leaveTypeId={leaveTypeFilter}
            leaveTypes={leaveTypes}
            onDateFromChange={setDateFrom}
            onDateToChange={setDateTo}
            onStatusChange={setStatusFilter}
            onLeaveTypeChange={setLeaveTypeFilter}
            onClearFilters={handleClearFilters}
          />
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardContent className="pt-4">
          <LeaveRequestsTable
            requests={requests}
            onApprove={handleApprove}
            onReject={(id) => setRejectId(id)}
            onCancel={(id) => setCancelId(id)}
            onView={handleView}
            isLoading={isLoading}
            isManager={true}
          />
        </CardContent>
      </Card>

      {/* Quick Links */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-4">
            <Link href="/app/hrm/ausencias/tipos">
              <Button variant="outline" size="sm">
                <Settings className="h-4 w-4 mr-2" />
                Tipos de Ausencia
              </Button>
            </Link>
            <Link href="/app/hrm/ausencias/saldos">
              <Button variant="outline" size="sm">
                <PiggyBank className="h-4 w-4 mr-2" />
                Saldos
              </Button>
            </Link>
            <Link href="/app/hrm">
              <Button variant="outline" size="sm">
                ← HRM
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Reject Dialog */}
      <AlertDialog open={!!rejectId} onOpenChange={() => setRejectId(null)}>
        <AlertDialogContent className="bg-white dark:bg-gray-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-gray-900 dark:text-white">
              ¿Rechazar solicitud?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-500 dark:text-gray-400">
              Ingresa la razón del rechazo
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Razón del rechazo..."
            className="min-h-[100px]"
          />
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setRejectReason('')}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleReject}
              className="bg-red-600 hover:bg-red-700"
              disabled={!rejectReason.trim()}
            >
              Rechazar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel Dialog */}
      <AlertDialog open={!!cancelId} onOpenChange={() => setCancelId(null)}>
        <AlertDialogContent className="bg-white dark:bg-gray-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-gray-900 dark:text-white">
              ¿Cancelar solicitud?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-500 dark:text-gray-400">
              Ingresa la razón de la cancelación
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="Razón de la cancelación..."
            className="min-h-[100px]"
          />
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setCancelReason('')}>Volver</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancel}
              className="bg-gray-600 hover:bg-gray-700"
              disabled={!cancelReason.trim()}
            >
              Cancelar Solicitud
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
