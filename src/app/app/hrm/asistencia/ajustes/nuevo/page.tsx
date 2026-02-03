'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useOrganization } from '@/lib/hooks/useOrganization';
import TimesheetAdjustmentsService from '@/lib/services/timesheetAdjustmentsService';
import type { CreateAdjustmentDTO } from '@/lib/services/timesheetAdjustmentsService';
import { AdjustmentForm } from '@/components/hrm/asistencia/ajustes';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { ArrowLeft, FileText } from 'lucide-react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/config';

export default function NuevoAjustePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedTimesheetId = searchParams.get('timesheet') || undefined;
  const { organization, isLoading: orgLoading } = useOrganization();
  const { toast } = useToast();

  // Estados
  const [timesheets, setTimesheets] = useState<{ id: string; label: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUserId(user?.id || null);
    };
    getUser();
  }, []);

  // Servicio
  const getService = useCallback(() => {
    if (!organization?.id) return null;
    return new TimesheetAdjustmentsService(organization.id);
  }, [organization?.id]);

  // Cargar timesheets disponibles
  const loadTimesheets = useCallback(async () => {
    const service = getService();
    if (!service) return;

    setIsLoading(true);
    try {
      const data = await service.getTimesheets();
      setTimesheets(data);
    } catch (error) {
      console.error('Error loading timesheets:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los timesheets',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [getService, toast]);

  useEffect(() => {
    if (organization?.id && !orgLoading) {
      loadTimesheets();
    }
  }, [organization?.id, orgLoading, loadTimesheets]);

  // Handlers
  const handleSubmit = async (data: CreateAdjustmentDTO) => {
    if (!currentUserId) {
      toast({
        title: 'Error',
        description: 'No se pudo identificar al usuario',
        variant: 'destructive',
      });
      return;
    }

    const service = getService();
    if (!service) return;

    try {
      await service.create(data, currentUserId);
      toast({ title: 'Ajuste creado correctamente' });
      router.push('/app/hrm/asistencia/ajustes');
    } catch (error: any) {
      throw error;
    }
  };

  const handleCancel = () => {
    router.push('/app/hrm/asistencia/ajustes');
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
          <Link href="/app/hrm/asistencia/ajustes">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <FileText className="h-7 w-7 text-blue-600" />
              Nuevo Ajuste
            </h1>
            <p className="text-gray-500 dark:text-gray-400">
              HRM / Asistencia / Ajustes / Nuevo
            </p>
          </div>
        </div>

        {/* Form */}
        <AdjustmentForm
          timesheets={timesheets}
          preselectedTimesheetId={preselectedTimesheetId}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}
