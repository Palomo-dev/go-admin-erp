'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useOrganization } from '@/lib/hooks/useOrganization';
import JobPositionsService from '@/lib/services/jobPositionsService';
import type { JobPosition, JobPositionEmployee } from '@/lib/services/jobPositionsService';
import {
  JobPositionHeader,
  JobPositionSalary,
  JobPositionEmployees,
} from '@/components/hrm/cargos/detail';
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
import { ArrowLeft, AlertTriangle, Calendar, Clock } from 'lucide-react';
import Link from 'next/link';

export default function CargoDetailPage() {
  const params = useParams();
  const router = useRouter();
  const positionId = params.id as string;
  const { organization, isLoading: orgLoading } = useOrganization();
  const { toast } = useToast();

  // Estados
  const [position, setPosition] = useState<JobPosition | null>(null);
  const [employees, setEmployees] = useState<JobPositionEmployee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Servicio
  const getService = useCallback(() => {
    if (!organization?.id) return null;
    return new JobPositionsService(organization.id);
  }, [organization?.id]);

  // Cargar datos
  const loadData = useCallback(async () => {
    const service = getService();
    if (!service || !positionId) return;

    setIsLoading(true);
    try {
      const [posData, empData] = await Promise.all([
        service.getById(positionId),
        service.getEmployees(positionId),
      ]);

      if (!posData) {
        setNotFound(true);
        return;
      }

      setPosition(posData);
      setEmployees(empData);
    } catch (error) {
      console.error('Error loading position:', error);
      toast({
        title: 'Error',
        description: 'No se pudo cargar el cargo',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [getService, positionId, toast]);

  useEffect(() => {
    if (organization?.id && !orgLoading && positionId) {
      loadData();
    }
  }, [organization?.id, orgLoading, positionId, loadData]);

  // Handlers
  const handleEdit = () => {
    router.push(`/app/hrm/cargos/${positionId}/editar`);
  };

  const handleDuplicate = async () => {
    const service = getService();
    if (!service || !position) return;

    try {
      const duplicated = await service.duplicate(position.id);
      toast({
        title: 'Cargo duplicado',
        description: `Se creó "${duplicated.name}"`,
      });
      router.push(`/app/hrm/cargos/${duplicated.id}`);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'No se pudo duplicar',
        variant: 'destructive',
      });
    }
  };

  const handleToggleActive = async () => {
    const service = getService();
    if (!service || !position) return;

    try {
      const updated = await service.toggleActive(position.id);
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

  const handleDelete = async () => {
    const service = getService();
    if (!service || !position) return;

    try {
      await service.delete(position.id);
      toast({
        title: 'Cargo eliminado',
        description: 'El cargo se eliminó correctamente',
      });
      router.push('/app/hrm/cargos');
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

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('es-CO', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
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
  if (notFound || !position) {
    return (
      <div className="p-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <AlertTriangle className="h-16 w-16 text-yellow-500 mb-4" />
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
            Cargo no encontrado
          </h2>
          <p className="text-gray-500 dark:text-gray-400 mb-6">
            El cargo que buscas no existe o no tienes acceso.
          </p>
          <Link href="/app/hrm/cargos">
            <Button>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Volver a Cargos
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
        <Link href="/app/hrm/cargos" className="hover:text-blue-600 dark:hover:text-blue-400">
          Cargos
        </Link>
        <span>/</span>
        <span className="text-gray-900 dark:text-white">{position.name}</span>
      </nav>

      {/* Header */}
      <JobPositionHeader
        position={{
          id: position.id,
          name: position.name,
          code: position.code,
          description: position.description,
          level: position.level,
          department_name: position.department_name,
          is_active: position.is_active,
          created_at: position.created_at,
        }}
        onEdit={handleEdit}
        onDuplicate={handleDuplicate}
        onToggleActive={handleToggleActive}
        onDelete={() => setShowDeleteDialog(true)}
      />

      {/* Contenido Principal */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Columna Principal - Empleados */}
        <div className="lg:col-span-2">
          <JobPositionEmployees
            employees={employees}
            positionId={position.id}
          />
        </div>

        {/* Columna Lateral */}
        <div className="space-y-6">
          {/* Rango Salarial */}
          <JobPositionSalary
            minSalary={position.min_salary}
            maxSalary={position.max_salary}
          />

          {/* Metadata */}
          <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2 text-gray-900 dark:text-white">
                <Clock className="h-5 w-5 text-blue-600" />
                Información
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">Creado</span>
                <span className="text-gray-900 dark:text-white">
                  {formatDate(position.created_at)}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">Actualizado</span>
                <span className="text-gray-900 dark:text-white">
                  {formatDate(position.updated_at)}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">Total empleados</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {position.employees_count || 0}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Diálogo de Eliminación */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="bg-white dark:bg-gray-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-gray-900 dark:text-white">
              ¿Eliminar cargo?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-500 dark:text-gray-400">
              Esta acción no se puede deshacer. El cargo &quot;{position.name}&quot; será
              eliminado permanentemente.
              {employees.length > 0 && (
                <span className="block mt-2 text-yellow-600 dark:text-yellow-400">
                  ⚠️ Hay {employees.length} empleado(s) asignado(s) a este cargo.
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
              disabled={employees.length > 0}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
