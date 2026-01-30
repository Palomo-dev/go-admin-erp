'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useOrganization } from '@/lib/hooks/useOrganization';
import ShiftsService from '@/lib/services/shiftsService';
import type { ShiftAssignment } from '@/lib/services/shiftsService';
import { ShiftDetailHeader } from '@/components/hrm/turnos/detail';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  ArrowLeft,
  AlertTriangle,
  Calendar,
  Clock,
  User,
  Building2,
  FileText,
  RefreshCw,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';

interface EmployeeOption {
  id: string;
  name: string;
  code: string | null;
}

export default function TurnoDetailPage() {
  const params = useParams();
  const router = useRouter();
  const shiftId = params.id as string;
  const { organization, isLoading: orgLoading } = useOrganization();
  const { toast } = useToast();

  // Estados
  const [shift, setShift] = useState<ShiftAssignment | null>(null);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Estado para diálogo de swap
  const [swapDialog, setSwapDialog] = useState(false);
  const [swapEmployeeId, setSwapEmployeeId] = useState('');
  const [isSwapping, setIsSwapping] = useState(false);

  // Servicio
  const getService = useCallback(() => {
    if (!organization?.id) return null;
    return new ShiftsService(organization.id);
  }, [organization?.id]);

  // Cargar datos
  const loadData = useCallback(async () => {
    const service = getService();
    if (!service || !shiftId) return;

    setIsLoading(true);
    try {
      const [shiftData, empData] = await Promise.all([
        service.getById(shiftId),
        service.getEmployees(),
      ]);

      if (!shiftData) {
        setNotFound(true);
        return;
      }

      setShift(shiftData);
      // Filtrar el empleado actual de la lista de swap
      setEmployees(empData.filter((e) => e.id !== shiftData.employment_id));
    } catch (error) {
      console.error('Error loading shift:', error);
      toast({
        title: 'Error',
        description: 'No se pudo cargar el turno',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [getService, shiftId, toast]);

  useEffect(() => {
    if (organization?.id && !orgLoading && shiftId) {
      loadData();
    }
  }, [organization?.id, orgLoading, shiftId, loadData]);

  // Handlers
  const handleEdit = () => {
    router.push(`/app/hrm/turnos/${shiftId}/editar`);
  };

  const handleChangeStatus = async (newStatus: string) => {
    const service = getService();
    if (!service || !shift) return;

    try {
      await service.updateStatus(shiftId, newStatus);
      toast({
        title: 'Estado actualizado',
        description: `El turno ahora está ${getStatusLabel(newStatus)}`,
      });
      await loadData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'No se pudo cambiar el estado',
        variant: 'destructive',
      });
    }
  };

  const handleRequestSwap = () => {
    setSwapDialog(true);
    setSwapEmployeeId('');
  };

  const handleConfirmSwap = async () => {
    const service = getService();
    if (!service || !swapEmployeeId) return;

    setIsSwapping(true);
    try {
      await service.requestSwap(shiftId, swapEmployeeId);
      toast({
        title: 'Swap solicitado',
        description: 'La solicitud de intercambio ha sido creada',
      });
      setSwapDialog(false);
      await loadData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'No se pudo solicitar el swap',
        variant: 'destructive',
      });
    } finally {
      setIsSwapping(false);
    }
  };

  const handleApproveSwap = async () => {
    const service = getService();
    if (!service) return;

    try {
      await service.approveSwap(shiftId);
      toast({
        title: 'Swap aprobado',
        description: 'El intercambio de turno ha sido aprobado',
      });
      await loadData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'No se pudo aprobar el swap',
        variant: 'destructive',
      });
    }
  };

  const handleRejectSwap = async () => {
    const service = getService();
    if (!service) return;

    try {
      await service.rejectSwap(shiftId);
      toast({
        title: 'Swap rechazado',
        description: 'La solicitud de intercambio ha sido rechazada',
      });
      await loadData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'No se pudo rechazar el swap',
        variant: 'destructive',
      });
    }
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      scheduled: 'programado',
      completed: 'completado',
      cancelled: 'cancelado',
      swap_pending: 'con swap pendiente',
      absent: 'ausente',
      late: 'con tardanza',
    };
    return labels[status] || status;
  };

  // Loading
  if (orgLoading || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  // Not found
  if (notFound || !shift) {
    return (
      <div className="p-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <AlertTriangle className="h-16 w-16 text-yellow-500 mb-4" />
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
            Turno no encontrado
          </h2>
          <p className="text-gray-500 dark:text-gray-400 mb-6">
            El turno que buscas no existe o no tienes acceso.
          </p>
          <Link href="/app/hrm/turnos">
            <Button>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Volver a Turnos
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
        <Link href="/app/hrm" className="hover:text-blue-600 dark:hover:text-blue-400">
          HRM
        </Link>
        <span>/</span>
        <Link href="/app/hrm/turnos" className="hover:text-blue-600 dark:hover:text-blue-400">
          Turnos
        </Link>
        <span>/</span>
        <span className="text-gray-900 dark:text-white">
          {format(new Date(shift.work_date), 'd MMM yyyy', { locale: es })}
        </span>
      </nav>

      {/* Header */}
      <ShiftDetailHeader
        shift={{
          id: shift.id,
          employee_name: shift.employee_name || 'Sin nombre',
          employee_code: shift.employee_code || null,
          work_date: shift.work_date,
          status: shift.status,
          template_name: shift.template_name || null,
          template_start_time: shift.template_start_time || null,
          template_end_time: shift.template_end_time || null,
          template_color: shift.template_color || null,
          branch_name: shift.branch_name || null,
        }}
        onEdit={handleEdit}
        onChangeStatus={handleChangeStatus}
        onRequestSwap={handleRequestSwap}
      />

      {/* Swap Pending Card */}
      {shift.status === 'swap_pending' && shift.swapped_with_employment_id && (
        <Card className="bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <RefreshCw className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                <div>
                  <p className="font-medium text-yellow-800 dark:text-yellow-200">
                    Solicitud de Swap Pendiente
                  </p>
                  <p className="text-sm text-yellow-600 dark:text-yellow-400">
                    Se ha solicitado intercambiar este turno
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRejectSwap}
                  className="border-red-300 text-red-600 hover:bg-red-50"
                >
                  <XCircle className="h-4 w-4 mr-1" />
                  Rechazar
                </Button>
                <Button size="sm" onClick={handleApproveSwap}>
                  <CheckCircle className="h-4 w-4 mr-1" />
                  Aprobar Swap
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Detalles del Turno */}
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-gray-900 dark:text-white">
              <Calendar className="h-5 w-5 text-blue-600" />
              Detalles del Turno
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Fecha</p>
                <p className="text-gray-900 dark:text-white font-medium">
                  {format(new Date(shift.work_date), "EEEE, d 'de' MMMM yyyy", { locale: es })}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Plantilla</p>
                <p className="text-gray-900 dark:text-white font-medium">
                  {shift.template_name || 'No especificada'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Hora Inicio</p>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-gray-400" />
                  <p className="text-gray-900 dark:text-white font-mono text-lg">
                    {shift.template_start_time?.substring(0, 5) || '--:--'}
                  </p>
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Hora Fin</p>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-gray-400" />
                  <p className="text-gray-900 dark:text-white font-mono text-lg">
                    {shift.template_end_time?.substring(0, 5) || '--:--'}
                  </p>
                </div>
              </div>
            </div>

            {(shift.actual_start_time || shift.actual_end_time) && (
              <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Horario Real</p>
                <div className="flex items-center gap-4">
                  <Badge variant="outline">
                    Entrada: {shift.actual_start_time?.substring(0, 5) || 'N/A'}
                  </Badge>
                  <Badge variant="outline">
                    Salida: {shift.actual_end_time?.substring(0, 5) || 'N/A'}
                  </Badge>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Información Adicional */}
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-gray-900 dark:text-white">
              <FileText className="h-5 w-5 text-blue-600" />
              Información Adicional
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Sede</p>
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-gray-400" />
                <p className="text-gray-900 dark:text-white">
                  {shift.branch_name || 'No asignada'}
                </p>
              </div>
            </div>

            {shift.notes && (
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Notas</p>
                <p className="text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-700/50 p-3 rounded-lg">
                  {shift.notes}
                </p>
              </div>
            )}

            <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Creado</p>
                  <p className="text-gray-600 dark:text-gray-300">
                    {format(new Date(shift.created_at), 'dd/MM/yyyy HH:mm')}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Actualizado</p>
                  <p className="text-gray-600 dark:text-gray-300">
                    {format(new Date(shift.updated_at), 'dd/MM/yyyy HH:mm')}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Diálogo de Swap */}
      <Dialog open={swapDialog} onOpenChange={setSwapDialog}>
        <DialogContent className="bg-white dark:bg-gray-800">
          <DialogHeader>
            <DialogTitle className="text-gray-900 dark:text-white">
              Solicitar Intercambio de Turno
            </DialogTitle>
            <DialogDescription className="text-gray-500 dark:text-gray-400">
              Selecciona el empleado con quien deseas intercambiar este turno.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label className="text-gray-700 dark:text-gray-300">Intercambiar con</Label>
            <Select value={swapEmployeeId} onValueChange={setSwapEmployeeId}>
              <SelectTrigger className="mt-2 bg-white dark:bg-gray-900">
                <SelectValue placeholder="Seleccionar empleado..." />
              </SelectTrigger>
              <SelectContent>
                {employees.map((emp) => (
                  <SelectItem key={emp.id} value={emp.id}>
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-gray-400" />
                      {emp.name} {emp.code && `(${emp.code})`}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSwapDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleConfirmSwap} disabled={!swapEmployeeId || isSwapping}>
              {isSwapping ? 'Solicitando...' : 'Solicitar Swap'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
