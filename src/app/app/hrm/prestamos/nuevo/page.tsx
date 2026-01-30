'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useOrganization } from '@/lib/hooks/useOrganization';
import EmployeeLoansService from '@/lib/services/employeeLoansService';
import type { CreateLoanDTO } from '@/lib/services/employeeLoansService';
import { LoanForm } from '@/components/hrm/prestamos/nuevo';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { ArrowLeft, Banknote } from 'lucide-react';

export default function NuevoPrestamoPage() {
  const router = useRouter();
  const { organization, isLoading: orgLoading } = useOrganization();
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [employees, setEmployees] = useState<{ id: string; name: string; code: string | null }[]>([]);
  const [loanTypes, setLoanTypes] = useState<{ value: string; label: string }[]>([]);
  const [currencies, setCurrencies] = useState<string[]>([]);

  const getService = useCallback(() => {
    if (!organization?.id) return null;
    return new EmployeeLoansService(organization.id);
  }, [organization?.id]);

  const loadData = useCallback(async () => {
    const service = getService();
    if (!service) return;

    setIsLoading(true);
    try {
      const [empData] = await Promise.all([
        service.getEmployees(),
      ]);

      setEmployees(empData);
      setLoanTypes(service.getLoanTypes());
      setCurrencies(service.getCurrencies());
    } catch (error: any) {
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

  const handleSubmit = async (data: CreateLoanDTO) => {
    const service = getService();
    if (!service) return;

    try {
      await service.create(data);
      toast({ title: 'Solicitud de préstamo creada correctamente' });
      router.push('/app/hrm/prestamos');
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'No se pudo crear el préstamo',
        variant: 'destructive',
      });
      throw error;
    }
  };

  const handleCancel = () => {
    router.push('/app/hrm/prestamos');
  };

  if (orgLoading || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Link href="/app/hrm/prestamos">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Banknote className="h-7 w-7 text-blue-600" />
              Nuevo Préstamo
            </h1>
            <p className="text-gray-500 dark:text-gray-400">
              HRM / Préstamos / Nueva Solicitud
            </p>
          </div>
        </div>

        {/* Form */}
        <LoanForm
          employees={employees}
          loanTypes={loanTypes}
          currencies={currencies}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}
