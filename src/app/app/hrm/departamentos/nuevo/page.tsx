'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useOrganization } from '@/lib/hooks/useOrganization';
import DepartmentsService from '@/lib/services/departmentsService';
import type { EmploymentOption } from '@/lib/services/departmentsService';
import { DepartmentCreateForm } from '@/components/hrm/departamentos';
import type {
  DepartmentCreateFormData,
  DepartmentOption,
} from '@/components/hrm/departamentos';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabase/config';
import {
  ArrowLeft,
  FolderPlus,
} from 'lucide-react';
import Link from 'next/link';

export default function NuevoDepartamentoPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { organization, isLoading: orgLoading } = useOrganization();
  const { toast } = useToast();

  // Obtener parentId de query params si existe
  const preselectedParentId = searchParams.get('parent');

  // Estados
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [employments, setEmployments] = useState<EmploymentOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Servicio
  const getService = useCallback(() => {
    if (!organization?.id) return null;
    return new DepartmentsService(organization.id);
  }, [organization?.id]);

  // Cargar datos para los selectores
  const loadData = useCallback(async () => {
    const service = getService();
    if (!service) return;

    setIsLoading(true);
    try {
      const [deptData, empData] = await Promise.all([
        service.getAll({ isActive: true }),
        service.getEmploymentsForSelect(),
      ]);

      setDepartments(
        deptData.map((d) => ({
          id: d.id,
          name: d.name,
          code: d.code,
        }))
      );
      setEmployments(empData);
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
  }, [getService, toast]);

  useEffect(() => {
    if (organization?.id && !orgLoading) {
      loadData();
    }
  }, [organization?.id, orgLoading, loadData]);

  // Validar código único
  const validateCode = async (code: string): Promise<boolean> => {
    if (!code || !organization?.id) return true;

    const { data, error } = await supabase
      .from('departments')
      .select('id')
      .eq('organization_id', organization.id)
      .eq('code', code.toUpperCase())
      .maybeSingle();

    if (error) {
      console.error('Error validating code:', error);
      return true; // En caso de error, permitir continuar
    }

    return !data; // true si no existe (es único)
  };

  // Crear departamento
  const handleSubmit = async (data: DepartmentCreateFormData) => {
    const service = getService();
    if (!service || !organization?.id) {
      throw new Error('Servicio no disponible');
    }

    try {
      const created = await service.create({
        organization_id: organization.id,
        name: data.name,
        code: data.code || undefined,
        description: data.description || undefined,
        parent_id: data.parent_id,
        manager_employment_id: data.manager_employment_id,
        cost_center: data.cost_center || undefined,
        is_active: data.is_active,
      });

      toast({
        title: 'Departamento creado',
        description: `"${created.name}" se ha creado correctamente`,
      });

      return;
    } catch (error: any) {
      console.error('Error creating department:', error);
      throw new Error(error.message || 'No se pudo crear el departamento');
    }
  };

  // Cancelar y volver
  const handleCancel = () => {
    router.push('/app/hrm/departamentos');
  };

  if (orgLoading) {
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
            <Link href="/app/hrm/departamentos">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <FolderPlus className="h-6 w-6 text-blue-600" />
                Nuevo Departamento
              </h1>
              <p className="text-gray-500 dark:text-gray-400 mt-1">
                Crea un nuevo departamento en la estructura organizacional
              </p>
            </div>
          </div>

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
            <span className="text-gray-900 dark:text-white">Nuevo</span>
          </nav>
        </div>

        {/* Formulario */}
        <DepartmentCreateForm
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          departments={departments}
          employments={employments.map((e) => ({
            id: e.id,
            full_name: e.full_name,
            employee_code: e.employee_code,
            position_name: e.position_name,
          }))}
          preselectedParentId={preselectedParentId}
          isLoading={isLoading}
          validateCode={validateCode}
        />
      </div>
    </div>
  );
}
