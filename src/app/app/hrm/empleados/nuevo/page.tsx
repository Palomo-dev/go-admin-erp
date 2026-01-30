'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useOrganization } from '@/lib/hooks/useOrganization';
import EmploymentsService from '@/lib/services/employmentsService';
import { EmployeeCreateForm } from '@/components/hrm/empleados/nuevo';
import type {
  EmployeeCreateFormData,
  OrganizationMemberOption,
  BranchOption,
  DepartmentOption,
  PositionOption,
  ManagerOption,
} from '@/components/hrm/empleados/nuevo';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { ArrowLeft, UserPlus } from 'lucide-react';
import Link from 'next/link';

export default function NuevoEmpleadoPage() {
  const router = useRouter();
  const { organization, isLoading: orgLoading } = useOrganization();
  const { toast } = useToast();

  // Estados
  const [members, setMembers] = useState<OrganizationMemberOption[]>([]);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [positions, setPositions] = useState<PositionOption[]>([]);
  const [managers, setManagers] = useState<ManagerOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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
      const [membersData, branchData, deptData, posData, mgrData] = await Promise.all([
        service.getOrganizationMembers(),
        service.getBranches(),
        service.getDepartments(),
        service.getPositions(),
        service.getManagers(),
      ]);

      setMembers(membersData);
      setBranches(branchData);
      setDepartments(deptData);
      setPositions(posData);
      setManagers(mgrData);
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
    const service = getService();
    if (!service) return true;
    return service.validateEmployeeCode(code);
  };

  // Submit del formulario
  const handleSubmit = async (data: EmployeeCreateFormData) => {
    const service = getService();
    if (!service) return;

    await service.create({
      organization_member_id: data.organization_member_id,
      employee_code: data.employee_code || undefined,
      hire_date: data.hire_date,
      probation_end_date: data.probation_end_date || undefined,
      employment_type: data.employment_type,
      contract_type: data.contract_type || undefined,
      contract_end_date: data.contract_end_date || undefined,
      position_id: data.position_id || undefined,
      department_id: data.department_id || undefined,
      manager_id: data.manager_id || undefined,
      branch_id: data.branch_id || undefined,
      base_salary: data.base_salary ?? undefined,
      salary_period: data.salary_period,
      currency_code: data.currency_code,
      work_hours_per_week: data.work_hours_per_week,
      eps_code: data.eps_code || undefined,
      afp_code: data.afp_code || undefined,
      arl_code: data.arl_code || undefined,
      arl_risk_level: data.arl_risk_level || undefined,
      severance_fund_code: data.severance_fund_code || undefined,
      bank_name: data.bank_name || undefined,
      bank_account_type: data.bank_account_type || undefined,
      bank_account_number: data.bank_account_number || undefined,
    });

    toast({
      title: 'Empleado registrado',
      description: 'El empleado se ha registrado correctamente',
    });
  };

  // Cancelar y volver
  const handleCancel = () => {
    router.push('/app/hrm/empleados');
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
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-4 mb-4">
            <Link href="/app/hrm/empleados">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <UserPlus className="h-6 w-6 text-blue-600" />
                Nuevo Empleado
              </h1>
              <p className="text-gray-500 dark:text-gray-400 mt-1">
                Registra un nuevo empleado en la organización
              </p>
            </div>
          </div>

          {/* Breadcrumb */}
          <nav className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <Link href="/app/hrm" className="hover:text-blue-600 dark:hover:text-blue-400">
              HRM
            </Link>
            <span>/</span>
            <Link href="/app/hrm/empleados" className="hover:text-blue-600 dark:hover:text-blue-400">
              Empleados
            </Link>
            <span>/</span>
            <span className="text-gray-900 dark:text-white">Nuevo</span>
          </nav>
        </div>

        {/* Formulario */}
        <EmployeeCreateForm
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          members={members}
          branches={branches}
          departments={departments}
          positions={positions}
          managers={managers}
          isLoading={isLoading}
          validateCode={validateCode}
        />
      </div>
    </div>
  );
}
