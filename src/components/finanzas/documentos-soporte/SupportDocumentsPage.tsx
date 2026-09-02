'use client';

import React, { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  FileText,
  Plus,
  RefreshCw,
  ArrowLeft,
  Search,
  FileCheck2,
  Clock,
  XCircle,
  CheckCircle2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { SupportDocumentsTable, type SupportDocumentRow } from './SupportDocumentsTable';

const STATUS_OPTIONS = [
  { value: 'all', label: 'Todos los estados' },
  { value: 'draft', label: 'Borrador' },
  { value: 'pending', label: 'Pendiente' },
  { value: 'processing', label: 'Procesando' },
  { value: 'sent', label: 'Enviado' },
  { value: 'accepted', label: 'Aceptado' },
  { value: 'rejected', label: 'Rechazado' },
  { value: 'failed', label: 'Fallido' },
  { value: 'cancelled', label: 'Cancelado' },
];

export function SupportDocumentsPage() {
  const [organizationId, setOrganizationId] = useState<number>(0);
  const [documents, setDocuments] = useState<SupportDocumentRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 20;

  // Stats
  const [stats, setStats] = useState({
    total: 0,
    draft: 0,
    accepted: 0,
    failed: 0,
  });

  useEffect(() => {
    const orgId = getOrganizationId();
    setOrganizationId(orgId);
  }, []);

  const loadDocuments = useCallback(async () => {
    if (!organizationId) return;
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        organizationId: String(organizationId),
        status: statusFilter,
        page: String(page),
        limit: String(pageSize),
      });
      const res = await fetch(`/api/factus/support-document?${params}`);
      if (!res.ok) throw new Error('Error cargando documentos soporte');
      const result = await res.json();
      setDocuments(result.data || []);
      setTotal(result.total || 0);
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [organizationId, statusFilter, page]);

  const loadStats = useCallback(async () => {
    if (!organizationId) return;
    try {
      const { data, error } = await supabase
        .from('support_documents')
        .select('status')
        .eq('organization_id', organizationId);

      if (error) throw error;

      const counts = { total: 0, draft: 0, accepted: 0, failed: 0 };
      data?.forEach((d) => {
        counts.total++;
        if (d.status === 'draft') counts.draft++;
        if (d.status === 'accepted') counts.accepted++;
        if (d.status === 'failed') counts.failed++;
      });
      setStats(counts);
    } catch (err) {
      console.error('Error cargando stats:', err);
    }
  }, [organizationId]);

  useEffect(() => {
    if (organizationId) {
      Promise.all([loadDocuments(), loadStats()]).finally(() => setIsRefreshing(false));
    }
  }, [organizationId, loadDocuments, loadStats]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([loadDocuments(), loadStats()]);
    setIsRefreshing(false);
  };

  const handleClearFilters = () => {
    setStatusFilter('all');
    setSearchTerm('');
    setPage(1);
  };

  const filteredDocuments = searchTerm
    ? documents.filter(
        (d) =>
          d.reference_code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          d.number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          d.provider?.names?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : documents;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/app/finanzas"
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <ArrowLeft className="h-5 w-5 text-gray-600 dark:text-gray-400" />
          </Link>
          <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-xl">
            <FileCheck2 className="h-6 w-6 text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Documentos Soporte
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Finanzas / Documentos Soporte Electrónicos DIAN
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
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
          <Link href="/app/finanzas/documentos-soporte/nuevo">
            <Button size="sm" className="h-9 bg-purple-600 hover:bg-purple-700">
              <Plus className="h-4 w-4 mr-2" />
              Nuevo Documento
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          label="Total"
          value={stats.total}
          icon={<FileText className="h-5 w-5 text-blue-600" />}
          color="blue"
        />
        <StatCard
          label="Borradores"
          value={stats.draft}
          icon={<Clock className="h-5 w-5 text-yellow-600" />}
          color="yellow"
        />
        <StatCard
          label="Aceptados DIAN"
          value={stats.accepted}
          icon={<CheckCircle2 className="h-5 w-5 text-green-600" />}
          color="green"
        />
        <StatCard
          label="Fallidos"
          value={stats.failed}
          icon={<XCircle className="h-5 w-5 text-red-600" />}
          color="red"
        />
      </div>

      {/* Filtros */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardContent className="pt-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Buscar por referencia, número o proveedor..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
              <SelectTrigger className="w-full sm:w-56">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(statusFilter !== 'all' || searchTerm) && (
              <Button variant="ghost" size="sm" onClick={handleClearFilters}>
                Limpiar
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tabla */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardContent className="pt-4">
          <SupportDocumentsTable
            documents={filteredDocuments}
            isLoading={isLoading}
          />

          {/* Paginación */}
          {total > pageSize && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t dark:border-gray-700">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Mostrando {(page - 1) * pageSize + 1} - {Math.min(page * pageSize, total)} de {total}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page * pageSize >= total}
                >
                  Siguiente
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: 'blue' | 'yellow' | 'green' | 'red';
}) {
  const colorClasses: Record<string, string> = {
    blue: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
    yellow: 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800',
    green: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
    red: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
  };

  return (
    <Card className={`${colorClasses[color]} border`}>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              {label}
            </p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{value}</p>
          </div>
          <div className="p-2 bg-white dark:bg-gray-800 rounded-lg">{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}

export default SupportDocumentsPage;
