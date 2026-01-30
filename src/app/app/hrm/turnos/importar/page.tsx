'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useOrganization } from '@/lib/hooks/useOrganization';
import ShiftsService from '@/lib/services/shiftsService';
import { ShiftImporter } from '@/components/hrm/turnos/importar';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { ArrowLeft, Upload } from 'lucide-react';
import Link from 'next/link';

export default function ImportarTurnosPage() {
  const router = useRouter();
  const { organization, isLoading: orgLoading } = useOrganization();
  const { toast } = useToast();

  // Servicio
  const getService = useCallback(() => {
    if (!organization?.id) return null;
    return new ShiftsService(organization.id);
  }, [organization?.id]);

  // Download template
  const handleDownloadTemplate = () => {
    const headers = ['employee_code', 'template_code', 'work_date', 'branch_id'];

    const exampleRows = [
      ['EMP-001', 'MAÑANA', '2025-01-15', ''],
      ['EMP-002', 'TARDE', '2025-01-15', '1'],
      ['EMP-001', 'NOCHE', '2025-01-16', ''],
    ];

    const csvContent = [headers.join(','), ...exampleRows.map((r) => r.join(','))].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'plantilla_turnos.csv';
    link.click();
  };

  // Import
  const handleImport = async (
    data: { employee_code: string; template_code: string; branch_id?: number; work_date: string }[]
  ) => {
    const service = getService();
    if (!service) {
      throw new Error('Servicio no disponible');
    }

    const result = await service.importAssignments(data);

    if (result.success > 0) {
      toast({
        title: 'Importación completada',
        description: `Se importaron ${result.success} turnos correctamente`,
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
            <Link href="/app/hrm/turnos">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Upload className="h-6 w-6 text-blue-600" />
                Importar Turnos
              </h1>
              <p className="text-gray-500 dark:text-gray-400 mt-1">
                Carga masiva de asignaciones de turnos desde archivo CSV
              </p>
            </div>
          </div>

          {/* Breadcrumb */}
          <nav className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <Link href="/app/hrm" className="hover:text-blue-600 dark:hover:text-blue-400">
              HRM
            </Link>
            <span>/</span>
            <Link href="/app/hrm/turnos" className="hover:text-blue-600 dark:hover:text-blue-400">
              Turnos
            </Link>
            <span>/</span>
            <span className="text-gray-900 dark:text-white">Importar</span>
          </nav>
        </div>

        {/* Importer */}
        <ShiftImporter onImport={handleImport} onDownloadTemplate={handleDownloadTemplate} />
      </div>
    </div>
  );
}
