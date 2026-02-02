'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Upload } from 'lucide-react';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { Button } from '@/components/ui/button';
import { ImportWizard } from '@/components/calendario/importar';

export default function ImportarEventosPage() {
  const router = useRouter();
  const { organization } = useOrganization();
  const organizationId = organization?.id || null;

  const handleComplete = useCallback(() => {
    router.push('/app/calendario');
  }, [router]);

  const handleCancel = useCallback(() => {
    router.push('/app/calendario');
  }, [router]);

  return (
    <div className="min-h-full">
      {/* Header */}
      <div className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <Upload className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Importar Eventos
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Importa eventos desde un archivo CSV
                </p>
              </div>
            </div>
            <Link href="/app/calendario">
              <Button variant="outline" size="sm">
                <ArrowLeft className="h-4 w-4 mr-1" />
                Calendario
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Contenido */}
      <div className="p-6 max-w-4xl mx-auto">
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-6">
          <ImportWizard
            organizationId={organizationId}
            onComplete={handleComplete}
            onCancel={handleCancel}
          />
        </div>
      </div>
    </div>
  );
}
