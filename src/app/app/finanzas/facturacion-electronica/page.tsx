'use client';
 
import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { 
  FileCheck, 
  RefreshCw, 
  Zap,
  ChevronLeft,
  ExternalLink,
} from 'lucide-react';
import { cn } from '@/utils/Utils';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import Link from 'next/link';
 
import {
  JobsTable,
  StatsCards,
  JobDetailDialog,
  JobFilters,
  type ElectronicInvoicingJob,
  type JobStats,
} from '@/components/finanzas/facturacion-electronica';
 
export default function FacturacionElectronicaPage() {
  const { toast } = useToast();
  const [organizationId, setOrganizationId] = useState<number>(0);
 
  // Estados de datos
  const [jobs, setJobs] = useState<ElectronicInvoicingJob[]>([]);
  const [stats, setStats] = useState<JobStats>({
    total: 0,
    pending: 0,
    processing: 0,
    accepted: 0,
    rejected: 0,
    failed: 0,
    successRate: 0,
  });
 
  // Estados de UI
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
 
  // Diálogos
  const [selectedJob, setSelectedJob] = useState<ElectronicInvoicingJob | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
 
  // Paginación
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const pageSize = 20;
 
  useEffect(() => {
    const orgId = getOrganizationId();
    setOrganizationId(orgId);
  }, []);
 
  const loadJobs = useCallback(async () => {
    if (!organizationId) return;
 
    try {
      const response = await fetch(
        `/api/factus/jobs?organizationId=${organizationId}&status=${statusFilter}&limit=${pageSize}&offset=${page * pageSize}`
      );
 
      if (!response.ok) throw new Error('Error cargando jobs');
 
      const result = await response.json();
      setJobs(result.data || []);
      setTotal(result.total || 0);
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los jobs de facturación',
        variant: 'destructive',
      });
    }
  }, [organizationId, statusFilter, page, toast]);
 
  const loadStats = useCallback(async () => {
    if (!organizationId) return;
 
    try {
      const { data, error } = await supabase
        .from('electronic_invoicing_jobs')
        .select('status')
        .eq('organization_id', organizationId);
 
      if (error) throw error;
 
      const counts = {
        total: data?.length || 0,
        pending: 0,
        processing: 0,
        accepted: 0,
        rejected: 0,
        failed: 0,
      };
 
      data?.forEach((job) => {
        if (job.status in counts) {
          counts[job.status as keyof typeof counts]++;
        }
      });
 
      const successRate = counts.total > 0 
        ? (counts.accepted / counts.total) * 100 
        : 0;
 
      setStats({
        ...counts,
        successRate,
      });
    } catch (error) {
      console.error('Error cargando stats:', error);
    }
  }, [organizationId]);
 
  useEffect(() => {
    if (organizationId) {
      setIsLoading(true);
      Promise.all([loadJobs(), loadStats()])
        .finally(() => setIsLoading(false));
    }
  }, [organizationId, loadJobs, loadStats]);
 
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([loadJobs(), loadStats()]);
    setIsRefreshing(false);
    toast({
      title: 'Actualizado',
      description: 'Los datos se han actualizado correctamente',
    });
  };
 
  const handleRetry = async (jobId: string) => {
    try {
      const response = await fetch('/api/factus/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, action: 'retry' }),
      });
 
      if (!response.ok) throw new Error('Error reintentando job');
 
      toast({
        title: 'Reintento programado',
        description: 'El job se ha marcado para reintento',
      });
 
      loadJobs();
      loadStats();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudo programar el reintento',
        variant: 'destructive',
      });
    }
  };
 
  const handleCancel = async (jobId: string) => {
    try {
      const response = await fetch(`/api/factus/jobs?jobId=${jobId}`, {
        method: 'DELETE',
      });
 
      if (!response.ok) throw new Error('Error cancelando job');
 
      toast({
        title: 'Job cancelado',
        description: 'El job se ha cancelado correctamente',
      });
 
      loadJobs();
      loadStats();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudo cancelar el job',
        variant: 'destructive',
      });
    }
  };
 
  const handleViewDetails = (job: ElectronicInvoicingJob) => {
    setSelectedJob(job);
    setIsDetailOpen(true);
  };
 
  const handleDownload = async (job: ElectronicInvoicingJob, type: 'pdf' | 'xml') => {
    try {
      const invoiceNumber = job.invoice?.number || job.cufe?.substring(0, 20);
      if (!invoiceNumber) {
        throw new Error('No hay número de factura disponible');
      }
 
      const response = await fetch(
        `/api/factus/download?type=${type}&invoiceNumber=${invoiceNumber}`
      );
 
      if (!response.ok) throw new Error(`Error descargando ${type.toUpperCase()}`);
 
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `factura-${invoiceNumber}.${type}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
 
      toast({
        title: 'Descarga completada',
        description: `El archivo ${type.toUpperCase()} se ha descargado`,
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || `No se pudo descargar el ${type.toUpperCase()}`,
        variant: 'destructive',
      });
    }
  };
 
  const handleClearFilters = () => {
    setStatusFilter('all');
    setSearchTerm('');
    setPage(0);
  };
 
  // Filtrar jobs por búsqueda
  const filteredJobs = searchTerm
    ? jobs.filter((job) =>
        job.invoice?.number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        job.cufe?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : jobs;
 
  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link 
            href="/app/finanzas"
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <ChevronLeft className="h-5 w-5 text-gray-600 dark:text-gray-400" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Zap className="h-7 w-7 text-blue-600 dark:text-blue-400" />
              Facturación Electrónica
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Monitoreo y gestión de facturas electrónicas DIAN
            </p>
          </div>
        </div>
 
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="h-9"
          >
            <RefreshCw className={cn('h-4 w-4 mr-2', isRefreshing && 'animate-spin')} />
            Actualizar
          </Button>
          <a
            href="https://developers.factus.com.co"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            <ExternalLink className="h-4 w-4" />
            Docs API
          </a>
        </div>
      </div>
 
      {/* Stats Cards */}
      <StatsCards stats={stats} isLoading={isLoading} />
 
      {/* Filtros y Tabla */}
      <Card className="dark:bg-gray-800/50">
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <FileCheck className="h-5 w-5 text-blue-600" />
              Cola de Facturación Electrónica
            </CardTitle>
 
            <JobFilters
              statusFilter={statusFilter}
              onStatusChange={(status) => {
                setStatusFilter(status);
                setPage(0);
              }}
              searchTerm={searchTerm}
              onSearchChange={setSearchTerm}
              onClearFilters={handleClearFilters}
            />
          </div>
        </CardHeader>
        <CardContent>
          <JobsTable
            jobs={filteredJobs}
            isLoading={isLoading}
            onRetry={handleRetry}
            onCancel={handleCancel}
            onViewDetails={handleViewDetails}
            onDownloadPDF={(job) => handleDownload(job, 'pdf')}
            onDownloadXML={(job) => handleDownload(job, 'xml')}
          />
 
          {/* Paginación */}
          {total > pageSize && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t dark:border-gray-700">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Mostrando {page * pageSize + 1} - {Math.min((page + 1) * pageSize, total)} de {total}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                >
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={(page + 1) * pageSize >= total}
                >
                  Siguiente
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
 
      {/* Diálogos */}
      <JobDetailDialog
        job={selectedJob}
        isOpen={isDetailOpen}
        onClose={() => {
          setIsDetailOpen(false);
          setSelectedJob(null);
        }}
        onDownloadPDF={(job) => handleDownload(job, 'pdf')}
        onDownloadXML={(job) => handleDownload(job, 'xml')}
      />
    </div>
  );
}