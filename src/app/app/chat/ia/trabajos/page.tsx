'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { supabase } from '@/lib/supabase/config';
import { Card } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import AIJobsService, {
  AIJob,
  AIJobStats
} from '@/lib/services/aiJobsService';
import {
  JobsHeader,
  JobsFilters,
  JobsTable,
  JobDetailDialog
} from '@/components/chat/ia/trabajos';
import { IANavTabs } from '@/components/chat/ia/IANavTabs';

export default function TrabajosPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { organization } = useOrganization();
  const organizationId = organization?.id;

  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<AIJob[]>([]);
  const [stats, setStats] = useState<AIJobStats | null>(null);
  const [memberId, setMemberId] = useState<number | null>(null);

  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [selectedJob, setSelectedJob] = useState<AIJob | null>(null);
  const [jobLogs, setJobLogs] = useState<string[]>([]);
  const [showDetailDialog, setShowDetailDialog] = useState(false);

  useEffect(() => {
    const getMemberId = async () => {
      if (!organizationId) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('organization_members')
        .select('id')
        .eq('user_id', user.id)
        .eq('organization_id', organizationId)
        .single();

      if (data) {
        setMemberId(data.id);
      }
    };

    getMemberId();
  }, [organizationId]);

  const loadData = useCallback(async () => {
    if (!organizationId) return;

    setLoading(true);
    try {
      const service = new AIJobsService(organizationId);

      const [jobsData, statsData] = await Promise.all([
        service.getJobs({
          status: statusFilter !== 'all' ? statusFilter : undefined,
          jobType: typeFilter !== 'all' ? typeFilter : undefined,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined
        }),
        service.getStats()
      ]);

      setJobs(jobsData);
      setStats(statsData);
    } catch (error) {
      console.error('Error cargando datos:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los trabajos',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  }, [organizationId, statusFilter, typeFilter, dateFrom, dateTo, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!organizationId) return;

    const channel = supabase
      .channel('ai_jobs_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ai_jobs',
          filter: `organization_id=eq.${organizationId}`
        },
        () => {
          loadData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [organizationId, loadData]);

  const handleViewDetails = async (job: AIJob) => {
    if (!organizationId) return;

    setSelectedJob(job);
    setShowDetailDialog(true);

    try {
      const service = new AIJobsService(organizationId);
      const logs = await service.getJobLogs(job.id);
      setJobLogs(logs);
    } catch (error) {
      console.error('Error obteniendo logs:', error);
      setJobLogs([]);
    }
  };

  const handleRetry = async (job: AIJob) => {
    if (!organizationId || !memberId) return;

    try {
      const service = new AIJobsService(organizationId);
      await service.retryJob(job.id, memberId);

      toast({
        title: 'Job reintentado',
        description: 'Se creó un nuevo job para reintentar la operación'
      });

      setShowDetailDialog(false);
      await loadData();
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'No se pudo reintentar el job',
        variant: 'destructive'
      });
    }
  };

  const handleCancel = async (job: AIJob) => {
    if (!organizationId || !memberId) return;

    try {
      const service = new AIJobsService(organizationId);
      await service.cancelJob(job.id, memberId);

      toast({
        title: 'Job cancelado',
        description: 'El trabajo fue cancelado correctamente'
      });

      setShowDetailDialog(false);
      await loadData();
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'No se pudo cancelar el job',
        variant: 'destructive'
      });
    }
  };

  const handleClearFilters = () => {
    setStatusFilter('all');
    setTypeFilter('all');
    setDateFrom('');
    setDateTo('');
  };

  const hasFilters = statusFilter !== 'all' || typeFilter !== 'all' || dateFrom !== '' || dateTo !== '';

  if (loading && jobs.length === 0) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <p className="text-gray-500 dark:text-gray-400">Cargando trabajos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
      <div className="p-4 sm:p-6 pb-0">
        <IANavTabs />
      </div>
      <JobsHeader
        stats={stats}
        loading={loading}
        onRefresh={loadData}
        onSettings={() => router.push('/app/chat/ia/configuracion')}
      />

      <JobsFilters
        statusFilter={statusFilter}
        typeFilter={typeFilter}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onStatusChange={setStatusFilter}
        onTypeChange={setTypeFilter}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
        onClearFilters={handleClearFilters}
        hasFilters={hasFilters}
      />

      <div className="flex-1 overflow-y-auto p-6">
        <Card className="border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
          <JobsTable
            jobs={jobs}
            loading={loading}
            onViewDetails={handleViewDetails}
            onRetry={handleRetry}
            onCancel={handleCancel}
          />
        </Card>
      </div>

      <JobDetailDialog
        job={selectedJob}
        logs={jobLogs}
        open={showDetailDialog}
        onClose={() => setShowDetailDialog(false)}
        onRetry={handleRetry}
        onCancel={handleCancel}
      />
    </div>
  );
}
