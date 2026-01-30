'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useOrganization } from '@/lib/hooks/useOrganization';
import DepartmentDetailService from '@/lib/services/departmentDetailService';
import DepartmentsService from '@/lib/services/departmentsService';
import type {
  DepartmentDetail,
  DepartmentEmployee,
  DepartmentPosition,
  DepartmentStats as DepartmentStatsType,
} from '@/lib/services/departmentDetailService';
import {
  DepartmentHeader,
  DepartmentStats,
  DepartmentEmployees,
  DepartmentPositions,
  DepartmentChildren,
  DepartmentReports,
} from '@/components/hrm/departamentos/detail';
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
import { useToast } from '@/components/ui/use-toast';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
import Link from 'next/link';

export default function DepartmentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const departmentId = params.id as string;
  const { organization, isLoading: orgLoading } = useOrganization();
  const { toast } = useToast();

  // Estados principales
  const [department, setDepartment] = useState<DepartmentDetail | null>(null);
  const [employees, setEmployees] = useState<DepartmentEmployee[]>([]);
  const [positions, setPositions] = useState<DepartmentPosition[]>([]);
  const [stats, setStats] = useState<DepartmentStatsType>({
    totalEmployees: 0,
    activeEmployees: 0,
    totalPositions: 0,
    avgSalary: null,
    pendingLeaves: 0,
    pendingTimesheets: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Estados de diálogos
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Servicios
  const getDetailService = useCallback(() => {
    if (!organization?.id) return null;
    return new DepartmentDetailService(organization.id);
  }, [organization?.id]);

  const getDepartmentsService = useCallback(() => {
    if (!organization?.id) return null;
    return new DepartmentsService(organization.id);
  }, [organization?.id]);

  // Cargar datos
  const loadData = useCallback(async () => {
    const detailService = getDetailService();
    const deptService = getDepartmentsService();
    if (!detailService || !deptService) return;

    setIsLoading(true);
    try {
      const [deptData, empData, posData, statsData] = await Promise.all([
        detailService.getById(departmentId),
        detailService.getEmployees(departmentId),
        detailService.getPositions(departmentId),
        detailService.getStats(departmentId),
      ]);

      if (!deptData) {
        setNotFound(true);
        return;
      }

      setDepartment(deptData);
      setEmployees(empData);
      setPositions(posData);
      setStats(statsData);
    } catch (error) {
      console.error('Error loading department:', error);
      toast({
        title: 'Error',
        description: 'No se pudo cargar el departamento',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [departmentId, getDetailService, toast]);

  useEffect(() => {
    if (organization?.id && !orgLoading && departmentId) {
      loadData();
    }
  }, [organization?.id, orgLoading, departmentId, loadData]);

  // Handlers
  const handleEdit = () => {
    router.push(`/app/hrm/departamentos/${departmentId}/editar`);
  };

  const handleDuplicate = async () => {
    const service = getDepartmentsService();
    if (!service || !department) return;

    try {
      const duplicated = await service.duplicate(department.id);
      toast({
        title: 'Departamento duplicado',
        description: `Se creó "${duplicated.name}"`,
      });
      router.push(`/app/hrm/departamentos/${duplicated.id}`);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'No se pudo duplicar',
        variant: 'destructive',
      });
    }
  };

  const handleToggleActive = async () => {
    const service = getDepartmentsService();
    if (!service || !department) return;

    try {
      const updated = await service.toggleActive(department.id);
      toast({
        title: updated.is_active ? 'Departamento activado' : 'Departamento desactivado',
        description: `"${updated.name}" ${updated.is_active ? 'está activo' : 'está inactivo'}`,
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

  const handleDelete = async () => {
    const service = getDepartmentsService();
    if (!service || !department) return;

    try {
      await service.delete(department.id);
      toast({
        title: 'Departamento eliminado',
        description: 'El departamento se eliminó correctamente',
      });
      router.push('/app/hrm/departamentos');
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'No se pudo eliminar',
        variant: 'destructive',
      });
    } finally {
      setShowDeleteDialog(false);
    }
  };

  // Loading state
  if (orgLoading || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  // Not found state
  if (notFound || !department) {
    return (
      <div className="p-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <AlertTriangle className="h-16 w-16 text-yellow-500 mb-4" />
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
            Departamento no encontrado
          </h2>
          <p className="text-gray-500 dark:text-gray-400 mb-6">
            El departamento que buscas no existe o no tienes acceso.
          </p>
          <Link href="/app/hrm/departamentos">
            <Button>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Volver a Departamentos
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
        <Link href="/app/hrm/departamentos" className="hover:text-blue-600 dark:hover:text-blue-400">
          Departamentos
        </Link>
        <span>/</span>
        <span className="text-gray-900 dark:text-white">{department.name}</span>
      </nav>

      {/* Header */}
      <DepartmentHeader
        department={{
          id: department.id,
          name: department.name,
          code: department.code,
          description: department.description,
          cost_center: department.cost_center,
          is_active: department.is_active,
          manager_name: department.manager_name,
          parent_id: department.parent_id,
          parent_name: department.parent_name,
          created_at: department.created_at,
        }}
        onEdit={handleEdit}
        onDuplicate={handleDuplicate}
        onToggleActive={handleToggleActive}
        onDelete={() => setShowDeleteDialog(true)}
      />

      {/* Stats */}
      <DepartmentStats stats={stats} />

      {/* Contenido Principal */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Columna Izquierda - Empleados */}
        <div className="lg:col-span-2 space-y-6">
          <DepartmentEmployees
            employees={employees}
            departmentId={department.id}
          />
          <DepartmentPositions
            positions={positions}
            departmentId={department.id}
          />
        </div>

        {/* Columna Derecha - Sub-departamentos y Reportes */}
        <div className="space-y-6">
          <DepartmentChildren
            children={department.children}
            parentId={department.id}
          />
          <DepartmentReports departmentId={department.id} />
        </div>
      </div>

      {/* Diálogo de Eliminación */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="bg-white dark:bg-gray-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-gray-900 dark:text-white">
              ¿Eliminar departamento?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-500 dark:text-gray-400">
              Esta acción no se puede deshacer. El departamento &quot;{department.name}&quot; será
              eliminado permanentemente.
              {department.children.length > 0 && (
                <span className="block mt-2 text-yellow-600 dark:text-yellow-400">
                  ⚠️ Este departamento tiene {department.children.length} sub-departamento(s).
                  No podrá eliminarse hasta que los sub-departamentos sean reasignados o eliminados.
                </span>
              )}
              {stats.totalEmployees > 0 && (
                <span className="block mt-2 text-yellow-600 dark:text-yellow-400">
                  ⚠️ Hay {stats.totalEmployees} empleado(s) asignado(s) a este departamento.
                  No podrá eliminarse hasta que sean reasignados.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
              disabled={department.children.length > 0 || stats.totalEmployees > 0}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
