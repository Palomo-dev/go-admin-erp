'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useOrganization } from '@/lib/hooks/useOrganization';
import DepartmentsService from '@/lib/services/departmentsService';
import type { Department, EmploymentOption } from '@/lib/services/departmentsService';
import {
  DepartmentTree,
  DepartmentFiltersComponent,
  ImportDepartmentsDialog,
} from '@/components/hrm/departamentos';
import type {
  DepartmentWithHierarchy,
  DepartmentFilters,
} from '@/components/hrm/departamentos';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import {
  Plus,
  RefreshCw,
  Upload,
  FolderTree,
  ArrowLeft,
} from 'lucide-react';
import Link from 'next/link';

export default function DepartamentosPage() {
  const router = useRouter();
  const { organization, isLoading: orgLoading } = useOrganization();
  const { toast } = useToast();

  // Estados principales
  const [departments, setDepartments] = useState<Department[]>([]);
  const [hierarchy, setHierarchy] = useState<DepartmentWithHierarchy[]>([]);
  const [employments, setEmployments] = useState<EmploymentOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Estados de filtros
  const [filters, setFilters] = useState<DepartmentFilters>({
    search: '',
    isActive: 'all',
    managerId: '',
  });

  // Estados de diálogos
  const [showImport, setShowImport] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [departmentToDelete, setDepartmentToDelete] = useState<string | null>(null);

  // Servicio
  const getService = useCallback(() => {
    if (!organization?.id) return null;
    return new DepartmentsService(organization.id);
  }, [organization?.id]);

  // Cargar datos
  const loadData = useCallback(async (showRefresh = false) => {
    const service = getService();
    if (!service) return;

    if (showRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    try {
      const [deptData, empData] = await Promise.all([
        service.getAll({
          search: filters.search || undefined,
          isActive: filters.isActive === 'all' ? undefined : filters.isActive === 'true',
          managerId: filters.managerId || undefined,
        }),
        service.getEmploymentsForSelect(),
      ]);

      setDepartments(deptData);
      setHierarchy(service.buildHierarchy(deptData));
      setEmployments(empData);
    } catch (error) {
      console.error('Error loading departments:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los departamentos',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [getService, filters, toast]);

  useEffect(() => {
    if (organization?.id && !orgLoading) {
      loadData();
    }
  }, [organization?.id, orgLoading, loadData]);

  // Handlers
  const handleRefresh = () => loadData(true);

  const handleCreate = () => {
    router.push('/app/hrm/departamentos/nuevo');
  };

  const handleEdit = (id: string) => {
    router.push(`/app/hrm/departamentos/${id}`);
  };

  const handleAddChild = (parentId: string) => {
    router.push(`/app/hrm/departamentos/nuevo?parent=${parentId}`);
  };

  const handleAssignManager = (id: string) => {
    router.push(`/app/hrm/departamentos/${id}`);
  };

  const handleDuplicate = async (id: string) => {
    const service = getService();
    if (!service) return;

    try {
      const duplicated = await service.duplicate(id);
      toast({
        title: 'Departamento duplicado',
        description: `Se creó "${duplicated.name}"`,
      });
      await loadData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'No se pudo duplicar el departamento',
        variant: 'destructive',
      });
    }
  };

  const handleToggleActive = async (id: string) => {
    const service = getService();
    if (!service) return;

    try {
      const updated = await service.toggleActive(id);
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

  const handleDeleteClick = (id: string) => {
    setDepartmentToDelete(id);
    setShowDeleteConfirm(true);
  };

  const handleDeleteConfirm = async () => {
    const service = getService();
    if (!service || !departmentToDelete) return;

    try {
      await service.delete(departmentToDelete);
      toast({
        title: 'Departamento eliminado',
        description: 'El departamento se eliminó correctamente',
      });
      await loadData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'No se pudo eliminar el departamento',
        variant: 'destructive',
      });
    } finally {
      setShowDeleteConfirm(false);
      setDepartmentToDelete(null);
    }
  };

  const handleImport = async (rows: any[]) => {
    const service = getService();
    if (!service) return { success: 0, errors: ['Servicio no disponible'] };

    const result = await service.importFromCSV(rows);
    if (result.success > 0) {
      await loadData();
    }
    return result;
  };

  // Preparar opciones para filtros
  const managerOptions = employments.map((e) => ({
    id: e.id,
    full_name: e.full_name,
  }));

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
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/app/hrm">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <FolderTree className="h-6 w-6 text-blue-600" />
              Departamentos
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              Gestiona la estructura organizacional
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
          <Button variant="outline" onClick={() => setShowImport(true)}>
            <Upload className="h-4 w-4 mr-2" />
            Importar
          </Button>
          <Button onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Nuevo Departamento
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <DepartmentFiltersComponent
        filters={filters}
        onFiltersChange={setFilters}
        managers={managerOptions}
        isLoading={isLoading}
      />

      {/* Árbol de Departamentos */}
      <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="text-gray-900 dark:text-white flex items-center justify-between">
            <span>Estructura de Departamentos</span>
            <span className="text-sm font-normal text-gray-500 dark:text-gray-400">
              {departments.length} departamento(s)
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DepartmentTree
            departments={hierarchy}
            onEdit={handleEdit}
            onDuplicate={handleDuplicate}
            onToggleActive={handleToggleActive}
            onDelete={handleDeleteClick}
            onAddChild={handleAddChild}
            onAssignManager={handleAssignManager}
            isLoading={isLoading}
          />
        </CardContent>
      </Card>

      {/* Diálogo de Importación */}
      <ImportDepartmentsDialog
        open={showImport}
        onOpenChange={setShowImport}
        onImport={handleImport}
      />

      {/* Confirmación de Eliminación */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent className="bg-white dark:bg-gray-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-gray-900 dark:text-white">
              ¿Eliminar departamento?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-500 dark:text-gray-400">
              Esta acción no se puede deshacer. El departamento será eliminado permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-red-600 hover:bg-red-700"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
