'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useOrganization } from '@/lib/hooks/useOrganization';
import TimeClocksService from '@/lib/services/timeClocksService';
import type { CreateTimeClockDTO } from '@/lib/services/timeClocksService';
import { DeviceForm } from '@/components/hrm/marcacion/dispositivos';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { ArrowLeft, Plus } from 'lucide-react';
import Link from 'next/link';

interface BranchOption {
  id: number;
  name: string;
}

export default function NuevoDispositivoPage() {
  const router = useRouter();
  const { organization, isLoading: orgLoading } = useOrganization();
  const { toast } = useToast();

  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const getService = useCallback(() => {
    if (!organization?.id) return null;
    return new TimeClocksService(organization.id);
  }, [organization?.id]);

  const loadData = useCallback(async () => {
    const service = getService();
    if (!service) return;

    setIsLoading(true);
    try {
      const branchesData = await service.getBranches();
      setBranches(branchesData);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [getService]);

  useEffect(() => {
    if (organization?.id && !orgLoading) {
      loadData();
    }
  }, [organization?.id, orgLoading, loadData]);

  const handleSubmit = async (data: CreateTimeClockDTO) => {
    const service = getService();
    if (!service) return;

    await service.create(data);
    toast({
      title: 'Dispositivo creado',
      description: 'El dispositivo se registró correctamente',
    });
    router.push('/app/hrm/marcacion/dispositivos');
  };

  const handleValidateCode = async (code: string) => {
    const service = getService();
    if (!service) return true;
    return service.validateCode(code);
  };

  const handleCancel = () => {
    router.push('/app/hrm/marcacion/dispositivos');
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
            <Link href="/app/hrm/marcacion/dispositivos">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Plus className="h-6 w-6 text-blue-600" />
                Nuevo Dispositivo
              </h1>
              <p className="text-gray-500 dark:text-gray-400 mt-1">
                Registra un nuevo punto de marcación
              </p>
            </div>
          </div>

          {/* Breadcrumb */}
          <nav className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 ml-12">
            <Link href="/app/hrm" className="hover:text-blue-600">HRM</Link>
            <span>/</span>
            <Link href="/app/hrm/marcacion" className="hover:text-blue-600">Marcación</Link>
            <span>/</span>
            <Link href="/app/hrm/marcacion/dispositivos" className="hover:text-blue-600">Dispositivos</Link>
            <span>/</span>
            <span className="text-gray-900 dark:text-white">Nuevo</span>
          </nav>
        </div>

        {/* Form */}
        <DeviceForm
          branches={branches}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          validateCode={handleValidateCode}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}
