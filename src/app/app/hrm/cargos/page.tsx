'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useOrganization } from '@/lib/hooks/useOrganization';
import JobPositionsService from '@/lib/services/jobPositionsService';
import type { JobPosition } from '@/lib/services/jobPositionsService';
import DepartmentsService from '@/lib/services/departmentsService';
import {
  JobPositionFiltersComponent,
  JobPositionTable,
} from '@/components/hrm/cargos';
import type { JobPositionFilters } from '@/components/hrm/cargos';
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
  Plus,
  RefreshCw,
  Briefcase,
  Upload,
} from 'lucide-react';
import Link from 'next/link';

interface DepartmentOption {
  id: string;
  name: string;
}

export default function CargosPage() {
  const router = useRouter();
  const { organization, isLoading: orgLoading } = useOrganization();
  const { toast } = useToast();

  // Estados
  const [positions, setPositions] = useState<JobPosition[]>([]);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [levels, setLevels] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filters, setFilters] = useState<JobPositionFilters>({
    search: '',
    isActive: 'all',
    departmentId: '',
    level: '',
  });

  // Diálogo de eliminación
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [positionToDelete, setPositionToDelete] = useState<string | null>(null);

  // Servicio
  const getService = useCallback(() => {
    if (!organization?.id) return null;
    return new JobPositionsService(organization.id);
  }, [organization?.id]);

  const getDeptService = useCallback(() => {
    if (!organization?.id) return null;
    return new DepartmentsService(organization.id);
  }, [organization?.id]);

  // Cargar datos
  const loadData = useCallback(async () => {
    const service = getService();
    const deptService = getDeptService();
    if (!service || !deptService) return;

    setIsLoading(true);
    try {
      const [posData, deptData, levelsData] = await Promise.all([
        service.getAll({
          search: filters.search || undefined,
          isActive: filters.isActive,
          departmentId: filters.departmentId || undefined,
          level: filters.level || undefined,
        }),
        deptService.getAll({ isActive: true }),
        service.getLevels(),
      ]);

      setPositions(posData);
      setDepartments(deptData.map((d) => ({ id: d.id, name: d.name })));
      setLevels(levelsData);
    } catch (error) {
      console.error('Error loading positions:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los cargos',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [getService, getDeptService, filters, toast]);

  useEffect(() => {
    if (organization?.id && !orgLoading) {
      loadData();
    }
  }, [organization?.id, orgLoading, loadData]);

  // Handlers
  const handleView = (id: string) => {
    router.push(`/app/hrm/cargos/${id}`);
  };

  const handleEdit = (id: string) => {
    router.push(`/app/hrm/cargos/${id}/editar`);
  };

  const handleDuplicate = async (id: string) => {
    const service = getService();
    if (!service) return;

    try {
      const duplicated = await service.duplicate(id);
      toast({
        title: 'Cargo duplicado',
        description: `Se creó "${duplicated.name}"`,
      });
      await loadData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'No se pudo duplicar',
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
        title: updated.is_active ? 'Cargo activado' : 'Cargo desactivado',
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
    setPositionToDelete(id);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!positionToDelete) return;

    const service = getService();
    if (!service) return;

    try {
      await service.delete(positionToDelete);
      toast({
        title: 'Cargo eliminado',
        description: 'El cargo se eliminó correctamente',
      });
      await loadData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'No se pudo eliminar',
        variant: 'destructive',
      });
    } finally {
      setDeleteDialogOpen(false);
      setPositionToDelete(null);
    }
  };

  // Estadísticas
  const stats = {
    total: positions.length,
    active: positions.filter((p) => p.is_active).length,
    inactive: positions.filter((p) => !p.is_active).length,
    withEmployees: positions.filter((p) => (p.employees_count || 0) > 0).length,
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
            <Briefcase className="h-7 w-7 text-blue-600" />
            Cargos
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Gestiona los cargos y posiciones de la organización
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
          <Button
            variant="outline"
            size="sm"
          >
            <Upload className="h-4 w-4 mr-2" />
            Importar
          </Button>
          <Link href="/app/hrm/cargos/nuevo">
            <Button size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Nuevo Cargo
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {stats.total}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Total cargos</p>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">
              {stats.active}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Activos</p>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-gray-400">
              {stats.inactive}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Inactivos</p>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              {stats.withEmployees}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Con empleados</p>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <JobPositionFiltersComponent
        filters={filters}
        onFiltersChange={setFilters}
        departments={departments}
        levels={levels}
      />

      {/* Tabla */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg text-gray-900 dark:text-white">
            Lista de Cargos
            <span className="text-sm font-normal text-gray-500 dark:text-gray-400 ml-2">
              ({positions.length} resultados)
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : (
            <JobPositionTable
              positions={positions}
              onView={handleView}
              onEdit={handleEdit}
              onDuplicate={handleDuplicate}
              onToggleActive={handleToggleActive}
              onDelete={handleDeleteClick}
            />
          )}
        </CardContent>
      </Card>

      {/* Diálogo de Eliminación */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="bg-white dark:bg-gray-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-gray-900 dark:text-white">
              ¿Eliminar cargo?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-500 dark:text-gray-400">
              Esta acción no se puede deshacer. El cargo será eliminado permanentemente.
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
