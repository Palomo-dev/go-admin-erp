'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useOrganization } from '@/lib/hooks/useOrganization';
import TimeClocksService from '@/lib/services/timeClocksService';
import type { TimeClock, CreateTimeClockDTO } from '@/lib/services/timeClocksService';
import { DeviceForm } from '@/components/hrm/marcacion/dispositivos';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { ArrowLeft, Edit3, AlertTriangle } from 'lucide-react';
import Link from 'next/link';

interface BranchOption {
  id: number;
  name: string;
}

export default function EditarDispositivoPage() {
  const params = useParams();
  const router = useRouter();
  const deviceId = params.id as string;
  const { organization, isLoading: orgLoading } = useOrganization();
  const { toast } = useToast();

  const [device, setDevice] = useState<TimeClock | null>(null);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const getService = useCallback(() => {
    if (!organization?.id) return null;
    return new TimeClocksService(organization.id);
  }, [organization?.id]);

  const loadData = useCallback(async () => {
    const service = getService();
    if (!service || !deviceId) return;

    setIsLoading(true);
    try {
      const [deviceData, branchesData] = await Promise.all([
        service.getById(deviceId),
        service.getBranches(),
      ]);

      if (!deviceData) {
        setNotFound(true);
        return;
      }

      setDevice(deviceData);
      setBranches(branchesData);
    } catch (error) {
      console.error('Error loading data:', error);
      toast({
        title: 'Error',
        description: 'No se pudo cargar el dispositivo',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [getService, deviceId, toast]);

  useEffect(() => {
    if (organization?.id && !orgLoading && deviceId) {
      loadData();
    }
  }, [organization?.id, orgLoading, deviceId, loadData]);

  const handleSubmit = async (data: CreateTimeClockDTO) => {
    const service = getService();
    if (!service) return;

    await service.update(deviceId, data);
    toast({
      title: 'Dispositivo actualizado',
      description: 'Los cambios se guardaron correctamente',
    });
    router.push('/app/hrm/marcacion/dispositivos');
  };

  const handleValidateCode = async (code: string, excludeId?: string) => {
    const service = getService();
    if (!service) return true;
    return service.validateCode(code, excludeId);
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

  if (notFound) {
    return (
      <div className="p-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
        <div className="max-w-3xl mx-auto text-center py-12">
          <AlertTriangle className="h-16 w-16 text-yellow-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Dispositivo no encontrado
          </h2>
          <p className="text-gray-500 dark:text-gray-400 mb-6">
            El dispositivo que intentas editar no existe.
          </p>
          <Link href="/app/hrm/marcacion/dispositivos">
            <Button>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Volver a Dispositivos
            </Button>
          </Link>
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
            <Link href="/app/hrm/marcacion/dispositivos">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Edit3 className="h-6 w-6 text-blue-600" />
                Editar Dispositivo
              </h1>
              <p className="text-gray-500 dark:text-gray-400 mt-1">
                {device?.name}
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
            <span className="text-gray-900 dark:text-white">Editar</span>
          </nav>
        </div>

        {/* Form */}
        <DeviceForm
          device={device}
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
