'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useOrganization } from '@/lib/hooks/useOrganization';
import LeaveRequestsService from '@/lib/services/leaveRequestsService';
import LeaveBalancesService from '@/lib/services/leaveBalancesService';
import type { CreateLeaveRequestDTO } from '@/lib/services/leaveRequestsService';
import { LeaveRequestForm } from '@/components/hrm/ausencias/nuevo';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { ArrowLeft, Calendar } from 'lucide-react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/config';

export default function NuevoAusenciaPage() {
  const router = useRouter();
  const { organization, isLoading: orgLoading } = useOrganization();
  const { toast } = useToast();

  // Estados
  const [leaveTypes, setLeaveTypes] = useState<{ id: string; code: string; name: string; color: string | null }[]>([]);
  const [employees, setEmployees] = useState<{ id: string; name: string; code: string | null }[]>([]);
  const [balances, setBalances] = useState<{ leave_type_id: string; available: number }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentEmploymentId, setCurrentEmploymentId] = useState<string | null>(null);

  // Obtener employment del usuario actual
  useEffect(() => {
    const getEmployment = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !organization?.id) return;

      const { data } = await supabase
        .from('employments')
        .select('id')
        .eq('organization_id', organization.id)
        .eq('organization_members.user_id', user.id)
        .single();

      if (data) {
        setCurrentEmploymentId(data.id);
      }
    };
    if (organization?.id) {
      getEmployment();
    }
  }, [organization?.id]);

  // Servicios
  const getRequestsService = useCallback(() => {
    if (!organization?.id) return null;
    return new LeaveRequestsService(organization.id);
  }, [organization?.id]);

  const getBalancesService = useCallback(() => {
    if (!organization?.id) return null;
    return new LeaveBalancesService(organization.id);
  }, [organization?.id]);

  // Cargar datos
  const loadData = useCallback(async () => {
    const requestsService = getRequestsService();
    const balancesService = getBalancesService();
    if (!requestsService || !balancesService) return;

    setIsLoading(true);
    try {
      const [typesData, employeesData] = await Promise.all([
        requestsService.getLeaveTypes(),
        requestsService.getEmployees(),
      ]);

      setLeaveTypes(typesData);
      setEmployees(employeesData);

      // Load balances for current year
      const currentYear = new Date().getFullYear();
      const balancesData = await balancesService.getAll({ year: currentYear });
      setBalances(balancesData.map((b) => ({
        leave_type_id: b.leave_type_id,
        available: b.available,
      })));
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
  }, [getRequestsService, getBalancesService, toast]);

  useEffect(() => {
    if (organization?.id && !orgLoading) {
      loadData();
    }
  }, [organization?.id, orgLoading, loadData]);

  // Handlers
  const handleSubmit = async (data: CreateLeaveRequestDTO) => {
    const service = getRequestsService();
    if (!service) return;

    try {
      await service.create(data);
      toast({ title: 'Solicitud creada correctamente' });
      router.push('/app/hrm/ausencias');
    } catch (error: any) {
      throw error;
    }
  };

  const handleCheckOverlap = async (
    employmentId: string,
    startDate: string,
    endDate: string
  ): Promise<boolean> => {
    const service = getRequestsService();
    if (!service) return false;

    try {
      const overlapping = await service.getOverlappingRequests(
        employmentId,
        startDate,
        endDate
      );
      return overlapping.length > 0;
    } catch {
      return false;
    }
  };

  const handleCancel = () => {
    router.push('/app/hrm/ausencias');
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
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Link href="/app/hrm/ausencias">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Calendar className="h-7 w-7 text-blue-600" />
              Nueva Solicitud
            </h1>
            <p className="text-gray-500 dark:text-gray-400">
              HRM / Ausencias / Nueva Solicitud
            </p>
          </div>
        </div>

        {/* Form */}
        <LeaveRequestForm
          leaveTypes={leaveTypes}
          employees={employees}
          balances={balances}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          onCheckOverlap={handleCheckOverlap}
          isLoading={isLoading}
          isSelfService={false}
        />
      </div>
    </div>
  );
}
