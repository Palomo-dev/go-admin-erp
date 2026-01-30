'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useOrganization } from '@/lib/hooks/useOrganization';
import JobPositionsService from '@/lib/services/jobPositionsService';
import DepartmentsService from '@/lib/services/departmentsService';
import { JobPositionEditForm } from '@/components/hrm/cargos/editar';
import type {
  JobPositionEditFormData,
  JobPositionData,
  DepartmentOption,
} from '@/components/hrm/cargos/editar';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { ArrowLeft, Edit3 } from 'lucide-react';
import Link from 'next/link';

export default function EditarCargoPage() {
  const params = useParams();
  const router = useRouter();
  const positionId = params.id as string;
  const { organization, isLoading: orgLoading } = useOrganization();
  const { toast } = useToast();

  // Estados
  const [position, setPosition] = useState<JobPositionData | null>(null);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [levels, setLevels] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Servicios
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
    if (!service || !deptService || !positionId) return;

    setIsLoading(true);
    try {
      const [posData, deptData, levelsData] = await Promise.all([
        service.getById(positionId),
        deptService.getAll({ isActive: true }),
        service.getLevels(),
      ]);

      if (!posData) {
        setNotFound(true);
        return;
      }

      setPosition(posData);
      setDepartments(deptData.map((d) => ({ id: d.id, name: d.name })));
      setLevels(levelsData);
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
  }, [getService, getDeptService, positionId, toast]);

  useEffect(() => {
    if (organization?.id && !orgLoading && positionId) {
      loadData();
    }
  }, [organization?.id, orgLoading, positionId, loadData]);

  // Validar código único (excluyendo el actual)
  const validateCode = async (code: string, currentId: string): Promise<boolean> => {
    const service = getService();
    if (!service) return true;
    return service.validateCode(code, currentId);
  };

  // Submit del formulario
  const handleSubmit = async (data: JobPositionEditFormData) => {
    const service = getService();
    if (!service || !positionId) return;

    await service.update(positionId, {
      name: data.name,
      code: data.code || undefined,
      description: data.description || undefined,
      department_id: data.department_id,
      level: data.level || undefined,
      min_salary: data.min_salary,
      max_salary: data.max_salary,
      requirements: data.requirements,
      is_active: data.is_active,
    });

    toast({
      title: 'Cargo actualizado',
      description: `"${data.name}" se actualizó correctamente`,
    });
  };

  // Cancelar y volver
  const handleCancel = () => {
    router.push(`/app/hrm/cargos/${positionId}`);
  };

  if (orgLoading || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (notFound || !position) {
    return (
      <div className="p-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
        <div className="max-w-3xl mx-auto">
          <div className="text-center py-12">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              Cargo no encontrado
            </h2>
            <p className="text-gray-500 dark:text-gray-400 mb-6">
              El cargo que intentas editar no existe o no tienes permisos para verlo.
            </p>
            <Link href="/app/hrm/cargos">
              <Button>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Volver a Cargos
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-4 mb-4">
            <Link href={`/app/hrm/cargos/${positionId}`}>
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Edit3 className="h-6 w-6 text-blue-600" />
                Editar Cargo
              </h1>
              <p className="text-gray-500 dark:text-gray-400 mt-1">
                Modifica los datos de &quot;{position.name}&quot;
              </p>
            </div>
          </div>

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
            <Link
              href={`/app/hrm/cargos/${positionId}`}
              className="hover:text-blue-600 dark:hover:text-blue-400"
            >
              {position.name}
            </Link>
            <span>/</span>
            <span className="text-gray-900 dark:text-white">Editar</span>
          </nav>
        </div>

        {/* Formulario */}
        <JobPositionEditForm
          position={position}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          departments={departments}
          levels={levels}
          isLoading={isLoading}
          validateCode={validateCode}
        />
      </div>
    </div>
  );
}
