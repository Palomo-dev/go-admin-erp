'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useOrganization } from '@/lib/hooks/useOrganization';
import JobPositionsService from '@/lib/services/jobPositionsService';
import DepartmentsService from '@/lib/services/departmentsService';
import { JobPositionCreateForm } from '@/components/hrm/cargos/nuevo';
import type { JobPositionCreateFormData, DepartmentOption } from '@/components/hrm/cargos/nuevo';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { ArrowLeft, Briefcase } from 'lucide-react';
import Link from 'next/link';

export default function NuevoCargoPage() {
  const router = useRouter();
  const { organization, isLoading: orgLoading } = useOrganization();
  const { toast } = useToast();

  // Estados
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [levels, setLevels] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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
    if (!service || !deptService) return;

    setIsLoading(true);
    try {
      const [deptData, levelsData] = await Promise.all([
        deptService.getAll({ isActive: true }),
        service.getLevels(),
      ]);

      setDepartments(deptData.map((d) => ({ id: d.id, name: d.name })));
      setLevels(levelsData);
    } catch (error) {
      console.error('Error loading data:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los datos',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [getService, getDeptService, toast]);

  useEffect(() => {
    if (organization?.id && !orgLoading) {
      loadData();
    }
  }, [organization?.id, orgLoading, loadData]);

  // Validar código único
  const validateCode = async (code: string): Promise<boolean> => {
    const service = getService();
    if (!service) return true;
    return service.validateCode(code);
  };

  // Submit del formulario
  const handleSubmit = async (data: JobPositionCreateFormData) => {
    const service = getService();
    if (!service || !organization?.id) return;

    const created = await service.create({
      organization_id: organization.id,
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
      title: 'Cargo creado',
      description: `"${created.name}" se creó correctamente`,
    });
  };

  // Cancelar y volver
  const handleCancel = () => {
    router.push('/app/hrm/cargos');
  };

  if (orgLoading || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-4 mb-4">
            <Link href="/app/hrm/cargos">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Briefcase className="h-6 w-6 text-blue-600" />
                Nuevo Cargo
              </h1>
              <p className="text-gray-500 dark:text-gray-400 mt-1">
                Crea un nuevo cargo o posición
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
            <span className="text-gray-900 dark:text-white">Nuevo</span>
          </nav>
        </div>

        {/* Formulario */}
        <JobPositionCreateForm
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
