'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useOrganization } from '@/lib/hooks/useOrganization';
import EmploymentsService from '@/lib/services/employmentsService';
import type { EmploymentListItem } from '@/lib/services/employmentsService';
import {
  EmployeeFiltersComponent,
  EmployeeTable,
} from '@/components/hrm/empleados';
import type { EmployeeFilters } from '@/components/hrm/empleados';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Plus,
  RefreshCw,
  Users,
  Upload,
  UserCheck,
  Clock,
  UserX,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';

interface BranchOption {
  id: number;
  name: string;
}

interface DepartmentOption {
  id: string;
  name: string;
}

interface PositionOption {
  id: string;
  name: string;
}

export default function EmpleadosPage() {
  const router = useRouter();
  const { organization, isLoading: orgLoading } = useOrganization();
  const { toast } = useToast();

  // Estados principales
  const [employees, setEmployees] = useState<EmploymentListItem[]>([]);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [positions, setPositions] = useState<PositionOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filters, setFilters] = useState<EmployeeFilters>({
    search: '',
    status: 'all',
    branchId: null,
    departmentId: '',
    positionId: '',
    contractType: 'all',
    hireDateFrom: '',
    hireDateTo: '',
  });

  // Estado para diálogo de terminación
  const [terminationDialog, setTerminationDialog] = useState<{
    open: boolean;
    employeeId: string | null;
    employeeName: string;
  }>({
    open: false,
    employeeId: null,
    employeeName: '',
  });
  const [terminationReason, setTerminationReason] = useState('');
  const [terminationType, setTerminationType] = useState('voluntary');

  // Servicio
  const getService = useCallback(() => {
    if (!organization?.id) return null;
    return new EmploymentsService(organization.id);
  }, [organization?.id]);

  // Cargar datos
  const loadData = useCallback(async () => {
    const service = getService();
    if (!service) return;

    setIsLoading(true);
    try {
      const [empData, branchData, deptData, posData] = await Promise.all([
        service.getAll({
          search: filters.search || undefined,
          status: filters.status !== 'all' ? filters.status : undefined,
          branchId: filters.branchId || undefined,
          departmentId: filters.departmentId || undefined,
          positionId: filters.positionId || undefined,
          contractType: filters.contractType !== 'all' ? filters.contractType : undefined,
          hireDateFrom: filters.hireDateFrom || undefined,
          hireDateTo: filters.hireDateTo || undefined,
        }),
        service.getBranches(),
        service.getDepartments(),
        service.getPositions(),
      ]);

      setEmployees(empData);
      setBranches(branchData);
      setDepartments(deptData);
      setPositions(posData);
    } catch (error) {
      console.error('Error loading employees:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los empleados',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [getService, filters, toast]);

  useEffect(() => {
    if (organization?.id && !orgLoading) {
      loadData();
    }
  }, [organization?.id, orgLoading, loadData]);

  // Handlers
  const handleView = (id: string) => {
    router.push(`/app/hrm/empleados/${id}`);
  };

  const handleEdit = (id: string) => {
    router.push(`/app/hrm/empleados/${id}/editar`);
  };

  const handleDuplicate = async (id: string) => {
    toast({
      title: 'Duplicar configuración',
      description: 'Selecciona un miembro para aplicar esta configuración',
    });
  };

  const handleChangeStatus = async (id: string, newStatus: string) => {
    const service = getService();
    if (!service) return;

    const employee = employees.find((e) => e.id === id);
    if (!employee) return;

    if (newStatus === 'terminated') {
      setTerminationDialog({
        open: true,
        employeeId: id,
        employeeName: employee.full_name,
      });
      return;
    }

    try {
      await service.updateStatus(id, newStatus);
      toast({
        title: 'Estado actualizado',
        description: `${employee.full_name} ahora está ${getStatusLabel(newStatus)}`,
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

  const handleTerminate = async () => {
    const service = getService();
    if (!service || !terminationDialog.employeeId) return;

    try {
      await service.updateStatus(terminationDialog.employeeId, 'terminated', {
        terminationReason,
        terminationType,
      });
      toast({
        title: 'Contrato terminado',
        description: `Se terminó el contrato de ${terminationDialog.employeeName}`,
      });
      setTerminationDialog({ open: false, employeeId: null, employeeName: '' });
      setTerminationReason('');
      setTerminationType('voluntary');
      await loadData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'No se pudo terminar el contrato',
        variant: 'destructive',
      });
    }
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      active: 'activo',
      probation: 'en período de prueba',
      suspended: 'suspendido',
      terminated: 'con contrato terminado',
    };
    return labels[status] || status;
  };

  // Estadísticas
  const stats = {
    total: employees.length,
    active: employees.filter((e) => e.status === 'active').length,
    probation: employees.filter((e) => e.status === 'probation').length,
    suspended: employees.filter((e) => e.status === 'suspended').length,
    terminated: employees.filter((e) => e.status === 'terminated').length,
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
            <Users className="h-7 w-7 text-blue-600" />
            Directorio de Empleados
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Gestiona la información laboral de los empleados
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
          <Link href="/app/hrm/empleados/importar">
            <Button variant="outline" size="sm">
              <Upload className="h-4 w-4 mr-2" />
              Importar
            </Button>
          </Link>
          <Link href="/app/hrm/empleados/nuevo">
            <Button size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Nuevo Empleado
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
                <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
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
              <div className="h-10 w-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <UserCheck className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {stats.active}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Activos</p>
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
                  {stats.probation}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">En prueba</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                <UserX className="h-5 w-5 text-orange-600 dark:text-orange-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                  {stats.suspended}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Suspendidos</p>
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
                  {stats.terminated}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Terminados</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <EmployeeFiltersComponent
        filters={filters}
        onFiltersChange={setFilters}
        branches={branches}
        departments={departments}
        positions={positions}
      />

      {/* Tabla */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg text-gray-900 dark:text-white">
            Lista de Empleados
            <span className="text-sm font-normal text-gray-500 dark:text-gray-400 ml-2">
              ({employees.length} resultados)
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : (
            <EmployeeTable
              employees={employees}
              onView={handleView}
              onEdit={handleEdit}
              onDuplicate={handleDuplicate}
              onChangeStatus={handleChangeStatus}
            />
          )}
        </CardContent>
      </Card>

      {/* Diálogo de Terminación */}
      <Dialog
        open={terminationDialog.open}
        onOpenChange={(open) =>
          !open && setTerminationDialog({ open: false, employeeId: null, employeeName: '' })
        }
      >
        <DialogContent className="bg-white dark:bg-gray-800">
          <DialogHeader>
            <DialogTitle className="text-gray-900 dark:text-white">
              Terminar Contrato
            </DialogTitle>
            <DialogDescription className="text-gray-500 dark:text-gray-400">
              Estás terminando el contrato de <strong>{terminationDialog.employeeName}</strong>.
              Esta acción es irreversible.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="terminationType">Tipo de terminación</Label>
              <Select value={terminationType} onValueChange={setTerminationType}>
                <SelectTrigger className="bg-white dark:bg-gray-900">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="voluntary">Voluntaria (Renuncia)</SelectItem>
                  <SelectItem value="involuntary">Involuntaria (Despido)</SelectItem>
                  <SelectItem value="contract_end">Fin de contrato</SelectItem>
                  <SelectItem value="mutual_agreement">Mutuo acuerdo</SelectItem>
                  <SelectItem value="retirement">Jubilación</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="terminationReason">Motivo</Label>
              <Textarea
                id="terminationReason"
                value={terminationReason}
                onChange={(e) => setTerminationReason(e.target.value)}
                placeholder="Describe el motivo de la terminación..."
                rows={3}
                className="bg-white dark:bg-gray-900"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() =>
                setTerminationDialog({ open: false, employeeId: null, employeeName: '' })
              }
            >
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleTerminate}>
              Confirmar Terminación
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
