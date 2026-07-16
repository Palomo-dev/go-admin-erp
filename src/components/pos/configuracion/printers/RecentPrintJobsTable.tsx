'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RefreshCw, ListChecks } from 'lucide-react';
import { PrintJobsService, type PrintJobWithPrinter } from '@/lib/services/printJobsService';
import { supabase } from '@/lib/supabase/config';

interface RecentPrintJobsTableProps {
  branchId: number | null;
}

const STATUS_LABELS: Record<PrintJobWithPrinter['status'], string> = {
  pending: 'Pendiente',
  sent: 'Enviado',
  printed: 'Impreso',
  error: 'Error',
};

const STATUS_CLASSES: Record<PrintJobWithPrinter['status'], string> = {
  pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  sent: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  printed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  error: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

const JOB_TYPE_LABELS: Record<PrintJobWithPrinter['job_type'], string> = {
  kitchen_ticket: 'Comanda',
  pre_cuenta: 'Pre-cuenta',
  sale_ticket: 'Venta',
};

export function RecentPrintJobsTable({ branchId }: RecentPrintJobsTableProps) {
  const [jobs, setJobs] = useState<PrintJobWithPrinter[]>([]);
  const [loading, setLoading] = useState(true);

  const loadJobs = useCallback(async () => {
    if (!branchId) return;
    setLoading(true);
    try {
      const data = await PrintJobsService.getRecentJobs(branchId, 20);
      setJobs(data);
    } catch (error) {
      console.error('Error obteniendo trabajos de impresión recientes:', error);
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  // Actualización en vivo: se refresca cuando cambia cualquier print_job de la sucursal
  useEffect(() => {
    if (!branchId) return;

    const channel = supabase
      .channel(`print_jobs-config-${branchId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'print_jobs', filter: `branch_id=eq.${branchId}` },
        () => loadJobs()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [branchId, loadJobs]);

  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <ListChecks className="h-5 w-5 text-slate-600" />
            Trabajos de Impresión Recientes
          </CardTitle>
          <CardDescription className="text-gray-500 dark:text-gray-400">
            Últimos 20 trabajos enviados al Print Agent de esta sucursal
          </CardDescription>
        </div>
        <Button variant="outline" size="icon" onClick={loadJobs} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </CardHeader>
      <CardContent>
        {jobs.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400 text-center py-4 text-sm">
            Aún no se ha encolado ningún trabajo de impresión
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-2 px-3 text-gray-600 dark:text-gray-400">Fecha</th>
                  <th className="text-left py-2 px-3 text-gray-600 dark:text-gray-400">Tipo</th>
                  <th className="text-left py-2 px-3 text-gray-600 dark:text-gray-400">Impresora</th>
                  <th className="text-left py-2 px-3 text-gray-600 dark:text-gray-400">Estación</th>
                  <th className="text-center py-2 px-3 text-gray-600 dark:text-gray-400">Estado</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id} className="border-b border-gray-100 dark:border-gray-800">
                    <td className="py-2 px-3 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                      {new Date(job.created_at).toLocaleString('es-CO')}
                    </td>
                    <td className="py-2 px-3 text-gray-900 dark:text-white">{JOB_TYPE_LABELS[job.job_type]}</td>
                    <td className="py-2 px-3 text-gray-900 dark:text-white">{job.printers?.name || '-'}</td>
                    <td className="py-2 px-3 text-gray-600 dark:text-gray-400">{job.station || '-'}</td>
                    <td className="py-2 px-3 text-center">
                      <Badge className={STATUS_CLASSES[job.status]} title={job.error_message || undefined}>
                        {STATUS_LABELS[job.status]}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
