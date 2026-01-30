'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useOrganization } from '@/lib/hooks/useOrganization';
import EmploymentsService from '@/lib/services/employmentsService';
import type { CreateEmploymentDTO } from '@/lib/services/employmentsService';
import { EmployeeImporter } from '@/components/hrm/empleados/importar';
import type { ImportRow } from '@/components/hrm/empleados/importar';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { ArrowLeft, Upload } from 'lucide-react';
import Link from 'next/link';

export default function ImportarEmpleadosPage() {
  const router = useRouter();
  const { organization, isLoading: orgLoading } = useOrganization();
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(false);

  // Servicio
  const getService = useCallback(() => {
    if (!organization?.id) return null;
    return new EmploymentsService(organization.id);
  }, [organization?.id]);

  // Descargar plantilla
  const handleDownloadTemplate = () => {
    const headers = [
      'organization_member_id',
      'employee_code',
      'hire_date',
      'employment_type',
      'contract_type',
      'position_id',
      'department_id',
      'branch_id',
      'base_salary',
      'salary_period',
      'currency_code',
      'work_hours_per_week',
      'eps_code',
      'afp_code',
      'arl_code',
      'arl_risk_level',
      'severance_fund_code',
      'bank_name',
      'bank_account_type',
      'bank_account_number',
    ];

    const exampleRow = [
      '123', // organization_member_id
      'EMP-001', // employee_code
      '2024-01-15', // hire_date
      'employee', // employment_type
      'indefinite', // contract_type
      '', // position_id (UUID)
      '', // department_id (UUID)
      '', // branch_id
      '3000000', // base_salary
      'monthly', // salary_period
      'COP', // currency_code
      '48', // work_hours_per_week
      'Sura EPS', // eps_code
      'Porvenir', // afp_code
      'Sura ARL', // arl_code
      '1', // arl_risk_level
      'Porvenir', // severance_fund_code
      'Bancolombia', // bank_name
      'savings', // bank_account_type
      '12345678901', // bank_account_number
    ];

    const csvContent = [
      headers.join(','),
      exampleRow.join(','),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'plantilla_empleados.csv';
    link.click();
  };

  // Importar
  const handleImport = async (data: ImportRow[]) => {
    const service = getService();
    if (!service) {
      throw new Error('Servicio no disponible');
    }

    const dtos: CreateEmploymentDTO[] = data.map((row) => ({
      organization_member_id: row.organization_member_id!,
      employee_code: row.employee_code,
      hire_date: row.hire_date,
      employment_type: row.employment_type || 'employee',
      contract_type: row.contract_type,
      position_id: row.position_id,
      department_id: row.department_id,
      branch_id: row.branch_id,
      base_salary: row.base_salary,
    }));

    const result = await service.importEmployments(dtos);

    if (result.success > 0) {
      toast({
        title: 'Importación completada',
        description: `Se importaron ${result.success} empleados correctamente`,
      });
    }

    return result;
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
                <Upload className="h-6 w-6 text-blue-600" />
                Importar Empleados
              </h1>
              <p className="text-gray-500 dark:text-gray-400 mt-1">
                Carga masiva de empleados desde archivo CSV
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
            <span className="text-gray-900 dark:text-white">Importar</span>
          </nav>
        </div>

        {/* Importador */}
        <EmployeeImporter
          onImport={handleImport}
          onDownloadTemplate={handleDownloadTemplate}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}
