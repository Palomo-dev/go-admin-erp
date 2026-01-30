'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useOrganization } from '@/lib/hooks/useOrganization';
import PayrollService from '@/lib/services/payrollService';
import type { CreatePeriodDTO } from '@/lib/services/payrollService';
import { PeriodForm } from '@/components/hrm/nomina/periodos/nuevo';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { ArrowLeft, Calculator } from 'lucide-react';

export default function NuevoPeriodoPage() {
  const router = useRouter();
  const { organization, isLoading: orgLoading } = useOrganization();
  const { toast } = useToast();

  const getService = useCallback(() => {
    if (!organization?.id) return null;
    return new PayrollService(organization.id);
  }, [organization?.id]);

  const handleSubmit = async (data: CreatePeriodDTO) => {
    const service = getService();
    if (!service) return;

    try {
      const period = await service.createPeriod(data);
      toast({ title: 'Periodo creado correctamente' });
      router.push(`/app/hrm/nomina/periodos/${period.id}`);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'No se pudo crear el periodo',
        variant: 'destructive',
      });
      throw error;
    }
  };

  const handleCancel = () => {
    router.push('/app/hrm/nomina');
  };

  const frequencies = getService()?.getFrequencies() || [
    { value: 'weekly', label: 'Semanal' },
    { value: 'biweekly', label: 'Quincenal' },
    { value: 'monthly', label: 'Mensual' },
  ];

  if (orgLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Link href="/app/hrm/nomina">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Calculator className="h-7 w-7 text-blue-600" />
              Nuevo Periodo
            </h1>
            <p className="text-gray-500 dark:text-gray-400">
              HRM / Nómina / Nuevo Periodo
            </p>
          </div>
        </div>

        {/* Form */}
        <PeriodForm
          frequencies={frequencies}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
        />
      </div>
    </div>
  );
}
