'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useToast } from '@/components/ui/use-toast';
import {
  integrationsService,
  IntegrationConnection,
  IntegrationJob,
} from '@/lib/services/integrationsService';
import {
  JobsHeader,
  JobsFilters,
  JobsList,
  JobDialog,
  JobFormData,
} from '@/components/integraciones/jobs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export default function JobsPage() {
  const { organization } = useOrganization();
  const { toast } = useToast();

  // Estados principales
  const [jobs, setJobs] = useState<IntegrationJob[]>([]);
  const [connections, setConnections] = useState<IntegrationConnection[]>([]);
  const [jobTypes, setJobTypes] = useState<string[]>([]);
  const [resourceTypes, setResourceTypes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [totalJobs, setTotalJobs] = useState(0);

  // Paginación
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(50);

  // Filtros
  const [filters, setFilters] = useState({
    connectionId: 'all',
    status: 'all',
    jobType: 'all',
    resourceType: 'all',
  });

  // Dialogs
  const [newJobDialogOpen, setNewJobDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [resetCursorDialogOpen, setResetCursorDialogOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState<IntegrationJob | null>(null);

  // Cargar datos
  const loadData = useCallback(async () => {
    if (!organization?.id) return;

    try {
      const offset = (currentPage - 1) * pageSize;

      // Preparar filtros para la API
      const apiFilters: any = {};
      if (filters.connectionId !== 'all') apiFilters.connectionId = filters.connectionId;
      if (filters.status !== 'all') apiFilters.status = filters.status;
      if (filters.jobType !== 'all') apiFilters.jobType = filters.jobType;
      if (filters.resourceType !== 'all') apiFilters.resourceType = filters.resourceType;

      const [jobsResult, connectionsData, typesData] = await Promise.all([
        integrationsService.getJobs(organization.id, apiFilters, pageSize, offset),
        integrationsService.getConnections(organization.id),
        integrationsService.getJobTypes(organization.id),
      ]);

      setJobs(jobsResult.data);
      setTotalJobs(jobsResult.total);
      setConnections(connectionsData);
      setJobTypes(typesData.jobTypes);
      setResourceTypes(typesData.resourceTypes);
    } catch (error) {
      console.error('Error loading jobs:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudieron cargar los jobs',
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [organization?.id, currentPage, pageSize, filters, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handlers
  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleFilterChange = (key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setCurrentPage(1);
  };

  const handleClearFilters = () => {
    setFilters({
      connectionId: 'all',
      status: 'all',
      jobType: 'all',
      resourceType: 'all',
    });
    setCurrentPage(1);
  };

  const handleNewJob = () => {
    setNewJobDialogOpen(true);
  };

  const handleCreateJob = async (data: JobFormData): Promise<boolean> => {
    const result = await integrationsService.createJob(data.connectionId, {
      job_type: data.jobType,
      resource_type: data.resourceType,
    });

    if (result) {
      toast({
        title: 'Job creado',
        description: 'El job ha sido creado y puesto en cola',
      });
      loadData();
      return true;
    } else {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudo crear el job',
      });
      return false;
    }
  };

  const handleRetry = async (job: IntegrationJob) => {
    const success = await integrationsService.retryJob(job.id);

    if (success) {
      toast({
        title: 'Job reencolado',
        description: 'El job ha sido puesto en cola para reintentar',
      });
      loadData();
    } else {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudo reencolar el job',
      });
    }
  };

  const handleDuplicate = async (job: IntegrationJob) => {
    const result = await integrationsService.duplicateJob(job.id);

    if (result) {
      toast({
        title: 'Job duplicado',
        description: 'Se ha creado un nuevo job en cola',
      });
      loadData();
    } else {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudo duplicar el job',
      });
    }
  };

  const handleCancel = async (job: IntegrationJob) => {
    const success = await integrationsService.cancelJob(job.id);

    if (success) {
      toast({
        title: 'Job cancelado',
        description: 'El job ha sido cancelado',
      });
      loadData();
    } else {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudo cancelar el job',
      });
    }
  };

  const handleResetCursor = (job: IntegrationJob) => {
    setSelectedJob(job);
    setResetCursorDialogOpen(true);
  };

  const confirmResetCursor = async () => {
    if (!selectedJob) return;

    const success = await integrationsService.resetJobCursor(selectedJob.id);

    if (success) {
      toast({
        title: 'Cursor reiniciado',
        description: 'El cursor del job ha sido reiniciado',
      });
      loadData();
    } else {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudo reiniciar el cursor',
      });
    }

    setResetCursorDialogOpen(false);
    setSelectedJob(null);
  };

  const handleDelete = (job: IntegrationJob) => {
    setSelectedJob(job);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!selectedJob) return;

    const success = await integrationsService.deleteJob(selectedJob.id);

    if (success) {
      toast({
        title: 'Job eliminado',
        description: 'El job ha sido eliminado correctamente',
      });
      loadData();
    } else {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudo eliminar el job',
      });
    }

    setDeleteDialogOpen(false);
    setSelectedJob(null);
  };

  // Calcular estadísticas
  const runningCount = jobs.filter((j) => j.status === 'running').length;
  const failedCount = jobs.filter((j) => j.status === 'failed').length;
  const queuedCount = jobs.filter((j) => j.status === 'queued').length;

  // Skeleton de carga
  if (loading) {
    return (
      <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-950">
        <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 p-6">
          <div className="animate-pulse space-y-4">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 bg-gray-200 dark:bg-gray-700 rounded-xl" />
              <div className="space-y-2">
                <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-48" />
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-64" />
              </div>
            </div>
          </div>
        </div>
        <div className="flex-1 p-6">
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4 animate-pulse"
              >
                <div className="flex items-center gap-4">
                  <div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/4" />
                    <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <JobsHeader
        totalJobs={totalJobs}
        runningCount={runningCount}
        failedCount={failedCount}
        queuedCount={queuedCount}
        onRefresh={handleRefresh}
        onNewJob={handleNewJob}
        refreshing={refreshing}
      />

      {/* Filtros */}
      <JobsFilters
        connections={connections}
        jobTypes={jobTypes}
        resourceTypes={resourceTypes}
        filters={filters}
        onFilterChange={handleFilterChange}
        onClearFilters={handleClearFilters}
      />

      {/* Lista de jobs */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 sm:px-6 lg:px-8 py-6">
          <JobsList
            jobs={jobs}
            loading={refreshing}
            onRetry={handleRetry}
            onDuplicate={handleDuplicate}
            onCancel={handleCancel}
            onResetCursor={handleResetCursor}
            onDelete={handleDelete}
          />
        </div>
      </div>

      {/* Dialog de nuevo job */}
      <JobDialog
        open={newJobDialogOpen}
        onOpenChange={setNewJobDialogOpen}
        connections={connections}
        onSave={handleCreateJob}
      />

      {/* Dialog de confirmación de eliminación */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="dark:bg-gray-900 dark:border-gray-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="dark:text-white">
              ¿Eliminar job?
            </AlertDialogTitle>
            <AlertDialogDescription className="dark:text-gray-400">
              Esta acción no se puede deshacer. El job será eliminado permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="dark:border-gray-700 dark:text-gray-300">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog de confirmación de reinicio de cursor */}
      <AlertDialog open={resetCursorDialogOpen} onOpenChange={setResetCursorDialogOpen}>
        <AlertDialogContent className="dark:bg-gray-900 dark:border-gray-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="dark:text-white">
              ¿Reiniciar cursor del job?
            </AlertDialogTitle>
            <AlertDialogDescription className="dark:text-gray-400">
              <span className="text-orange-500 font-medium">⚠️ Acción peligrosa:</span> Esto
              reiniciará el cursor de sincronización, lo que puede causar duplicados o
              re-sincronización completa de datos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="dark:border-gray-700 dark:text-gray-300">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmResetCursor}
              className="bg-orange-600 hover:bg-orange-700 text-white"
            >
              Reiniciar Cursor
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
