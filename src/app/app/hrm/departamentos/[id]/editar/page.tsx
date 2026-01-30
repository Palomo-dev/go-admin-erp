'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useOrganization } from '@/lib/hooks/useOrganization';
import DepartmentsService from '@/lib/services/departmentsService';
import type { EmploymentOption } from '@/lib/services/departmentsService';
import { DepartmentEditForm } from '@/components/hrm/departamentos/editar';
import type {
  DepartmentEditFormData,
  DepartmentData,
  DepartmentOption,
} from '@/components/hrm/departamentos/editar';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabase/config';
import {
  ArrowLeft,
  Edit3,
} from 'lucide-react';
import Link from 'next/link';

export default function EditarDepartamentoPage() {
  const params = useParams();
  const router = useRouter();
  const departmentId = params.id as string;
  const { organization, isLoading: orgLoading } = useOrganization();
  const { toast } = useToast();

  // Estados
  const [department, setDepartment] = useState<DepartmentData | null>(null);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [employments, setEmployments] = useState<EmploymentOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Servicio
  const getService = useCallback(() => {
    if (!organization?.id) return null;
    return new DepartmentsService(organization.id);
  }, [organization?.id]);

  // Cargar datos
  const loadData = useCallback(async () => {
    const service = getService();
    if (!service || !departmentId) return;

    setIsLoading(true);
    try {
      // Cargar departamento actual
      const deptData = await service.getById(departmentId);
      if (!deptData) {
        setNotFound(true);
        return;
      }
      setDepartment(deptData);

      // Cargar lista de departamentos y empleados para selectores
      const [allDepts, empData] = await Promise.all([
        service.getAll({ isActive: true }),
        service.getEmploymentsForSelect(),
      ]);

      // Mapear departamentos para el selector
      setDepartments(
        allDepts.map((d) => ({
          id: d.id,
          name: d.name,
          code: d.code,
        }))
      );
      setEmployments(empData);
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
  }, [getService, departmentId, toast]);

  useEffect(() => {
    if (organization?.id && !orgLoading && departmentId) {
      loadData();
    }
  }, [organization?.id, orgLoading, departmentId, loadData]);

  // Validar código único (excluyendo el actual)
  const validateCode = async (code: string, currentId: string): Promise<boolean> => {
    if (!code || !organization?.id) return true;

    const { data, error } = await supabase
      .from('departments')
      .select('id')
      .eq('organization_id', organization.id)
      .eq('code', code)
      .neq('id', currentId)
      .limit(1);

    if (error) {
      console.error('Error validating code:', error);
      return true;
    }

    return !data || data.length === 0;
  };

  // Submit del formulario
  const handleSubmit = async (data: DepartmentEditFormData) => {
    const service = getService();
    if (!service || !departmentId) return;

    await service.update(departmentId, {
      name: data.name,
      code: data.code || undefined,
      description: data.description || undefined,
      parent_id: data.parent_id,
      manager_employment_id: data.manager_employment_id,
      cost_center: data.cost_center || undefined,
      is_active: data.is_active,
    });

    toast({
      title: 'Departamento actualizado',
      description: `"${data.name}" se actualizó correctamente`,
    });
  };

  // Cancelar y volver
  const handleCancel = () => {
    router.push(`/app/hrm/departamentos/${departmentId}`);
  };

  if (orgLoading || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (notFound || !department) {
    return (
      <div className="p-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
        <div className="max-w-3xl mx-auto">
          <div className="text-center py-12">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              Departamento no encontrado
            </h2>
            <p className="text-gray-500 dark:text-gray-400 mb-6">
              El departamento que intentas editar no existe o no tienes permisos para verlo.
            </p>
            <Link href="/app/hrm/departamentos">
              <Button>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Volver a Departamentos
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
            <Link href={`/app/hrm/departamentos/${departmentId}`}>
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Edit3 className="h-6 w-6 text-blue-600" />
                Editar Departamento
              </h1>
              <p className="text-gray-500 dark:text-gray-400 mt-1">
                Modifica los datos de &quot;{department.name}&quot;
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
            <Link
              href={`/app/hrm/departamentos/${departmentId}`}
              className="hover:text-blue-600 dark:hover:text-blue-400"
            >
              {department.name}
            </Link>
            <span>/</span>
            <span className="text-gray-900 dark:text-white">Editar</span>
          </nav>
        </div>

        {/* Formulario */}
        <DepartmentEditForm
          department={department}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          departments={departments}
          employments={employments.map((e) => ({
            id: e.id,
            full_name: e.full_name,
            employee_code: e.employee_code,
            position_name: e.position_name,
          }))}
          isLoading={isLoading}
          validateCode={validateCode}
        />
      </div>
    </div>
  );
}
