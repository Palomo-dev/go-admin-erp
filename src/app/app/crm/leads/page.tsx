'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { LoadErrorState } from '@/components/common/LoadErrorState';
import { describeError, logError } from '@/lib/utils/errorMessage';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabase/config';
import { useBranch } from '@/lib/context/BranchContext';
import { NewLeadDialog } from '@/components/crm/leads/NewLeadDialog';
import {
  RefreshCw,
  Loader2,
  Search,
  Plus,
  ArrowUpRight,
  Flame,
  TrendingUp,
  TrendingDown,
  Minus,
} from 'lucide-react';

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface Lead {
  id: string;
  name: string;
  customer_id: string | null;
  salesperson_id: string | null;
  stage_id: string | null;
  pipeline_id: string | null;
  amount: number;
  currency: string;
  expected_close_date: string | null;
  status: string;
  source: string | null;
  temperature: string | null;
  score_total: number | null;
  icp_band: string | null;
  next_contact_at: string | null;
  last_contact_at: string | null;
  created_at: string;
  updated_at: string;
}

interface CustomerRef {
  id: string;
  full_name: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatRelativeDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Hoy';
  if (diffDays === 1) return 'Ayer';
  if (diffDays < 7) return `Hace ${diffDays}d`;
  if (diffDays < 30) return `Hace ${Math.floor(diffDays / 7)}sem`;
  if (diffDays < 365) return `Hace ${Math.floor(diffDays / 30)}m`;
  return `Hace ${Math.floor(diffDays / 365)}a`;
}

function getScoreBadge(score: number | null) {
  if (score == null) {
    return <Badge variant="secondary" className="text-[10px]">N/A</Badge>;
  }
  if (score >= 70) {
    return (
      <Badge className="text-[10px] bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 border-green-200 dark:border-green-800">
        <TrendingUp className="h-3 w-3 mr-0.5" />
        {score}
      </Badge>
    );
  }
  if (score >= 40) {
    return (
      <Badge className="text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200 dark:border-amber-800">
        <Minus className="h-3 w-3 mr-0.5" />
        {score}
      </Badge>
    );
  }
  return (
    <Badge className="text-[10px] bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 border-red-200 dark:border-red-800">
      <TrendingDown className="h-3 w-3 mr-0.5" />
      {score}
    </Badge>
  );
}

function getTemperatureIcon(temperature: string | null) {
  if (temperature === 'hot') return <Flame className="h-3.5 w-3.5 text-red-500" />;
  if (temperature === 'warm') return <Flame className="h-3.5 w-3.5 text-amber-500" />;
  return null;
}

// ─── Página ──────────────────────────────────────────────────────────────────

export default function LeadsPage() {
  const router = useRouter();
  const { branchFilter } = useBranch();

  const [leads, setLeads] = useState<Lead[]>([]);
  const [customers, setCustomers] = useState<Record<string, CustomerRef>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [isNewLeadOpen, setIsNewLeadOpen] = useState(false);
  const [convertTarget, setConvertTarget] = useState<Lead | null>(null);
  const [isConverting, setIsConverting] = useState(false);

  const loadLeads = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/crm/leads', { cache: 'no-store' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Error al cargar leads');
      const leadsData = (json.data || []) as Lead[];
      setLeads(leadsData);

      // Resolver nombres de customer para los customer_id presentes
      const customerIds = Array.from(
        new Set(leadsData.map((l) => l.customer_id).filter(Boolean) as string[])
      );
      if (customerIds.length > 0) {
        let custQuery = supabase
          .from('customers')
          .select('id, full_name')
          .in('id', customerIds);
        if (branchFilter != null) custQuery = custQuery.eq('branch_id', branchFilter);
        const { data: custData, error: custError } = await custQuery;
        // No es fatal: los leads se muestran igual, pero el fallo se registra
        // en vez de dejar la columna «Cliente» vacía sin explicación.
        if (custError) logError('[LeadsPage] resolver nombres de cliente', custError);
        if (custData) {
          const map: Record<string, CustomerRef> = {};
          custData.forEach((c) => {
            map[c.id] = { id: c.id, full_name: c.full_name };
          });
          setCustomers(map);
        }
      }
    } catch (err) {
      logError('[LeadsPage] cargar leads', err);
      setLoadError(describeError(err));
    } finally {
      setIsLoading(false);
    }
  }, [branchFilter]);

  useEffect(() => {
    loadLeads();
  }, [loadLeads]);

  const filteredLeads = leads.filter((lead) => {
    if (!search) return true;
    const q = search.toLowerCase();
    const customerName = lead.customer_id ? customers[lead.customer_id]?.full_name || '' : '';
    return (
      lead.name.toLowerCase().includes(q) ||
      customerName.toLowerCase().includes(q)
    );
  });

  const handleConvertToDeal = async () => {
    if (!convertTarget) return;
    setIsConverting(true);
    try {
      // Usar el endpoint POST /api/crm/leads/[id]/convert que valida admin + gate
      const response = await fetch(`/api/crm/leads/${convertTarget.id}/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skipGateCheck: false }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error || `Error ${response.status}`);
      }

      const data = await response.json();

      // La ruta devuelve el gate en `gate` (antes se leía `gateResult`, que no
      // existe en la respuesta: la advertencia del soft-gate nunca se mostraba).
      const gate = data.gate;
      // El trigger `trg_sync_customer_lifecycle` sube la etapa del cliente a
      // 'opportunity'; la ruta la relee y la devuelve para poder confirmarlo.
      const lifecycle = data.customer?.lifecycle_stage as string | undefined;
      const lifecycleNote =
        lifecycle === 'opportunity'
          ? ' El cliente pasó a etapa «oportunidad».'
          : '';

      if (gate && !gate.ok) {
        toast({
          title: 'Lead convertido (con advertencias)',
          description: `"${convertTarget.name}" ahora es un deal. Faltan: ${gate.missing?.map((m: any) => m.label).join(', ') || 'criterios'}.${lifecycleNote}`,
          variant: 'default',
        });
      } else {
        toast({
          title: 'Lead convertido',
          description: `"${convertTarget.name}" ahora es un deal.${lifecycleNote}`,
        });
      }

      setConvertTarget(null);
      await loadLeads();
    } catch (err) {
      console.error('Error al convertir lead:', err);
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'No se pudo convertir el lead a deal',
        variant: 'destructive',
      });
    } finally {
      setIsConverting(false);
    }
  };

  return (
    <div className="p-3 sm:p-4 md:p-6 space-y-4 sm:space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
            Leads
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {leads.length} lead{leads.length !== 1 ? 's' : ''} sin convertir a deal
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadLeads}
            disabled={isLoading}
            className="h-8"
          >
            {isLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Actualizar
          </Button>
          <Button
            size="sm"
            onClick={() => setIsNewLeadOpen(true)}
            className="h-8 bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Nuevo lead
          </Button>
        </div>
      </div>

      {/* Buscador */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre o cliente..."
          className="pl-9 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700"
        />
      </div>

      {/* Tabla */}
      <Card className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : loadError ? (
          <div className="p-4">
            <LoadErrorState
              title="No se pudieron cargar los leads"
              message={loadError}
              onRetry={() => void loadLeads()}
              isRetrying={isLoading}
            />
          </div>
        ) : filteredLeads.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-3">
              <Search className="h-6 w-6 text-gray-400" />
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {search ? 'No se encontraron leads con ese filtro.' : 'No hay leads registrados.'}
            </p>
            {!search && (
              <Button
                size="sm"
                onClick={() => setIsNewLeadOpen(true)}
                className="mt-4 bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Crear el primer lead
              </Button>
            )}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-gray-200 dark:border-gray-700 hover:bg-transparent">
                <TableHead className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                  Nombre
                </TableHead>
                <TableHead className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                  Cliente
                </TableHead>
                <TableHead className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                  Score
                </TableHead>
                <TableHead className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                  Última actividad
                </TableHead>
                <TableHead className="text-xs font-semibold text-gray-500 dark:text-gray-400 text-right">
                  Acciones
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLeads.map((lead) => {
                const customerName = lead.customer_id
                  ? customers[lead.customer_id]?.full_name || 'Cliente no encontrado'
                  : 'Sin cliente';
                return (
                  <TableRow
                    key={lead.id}
                    className="border-gray-100 dark:border-gray-800 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50"
                    onClick={() => router.push(`/app/crm/oportunidades/${lead.id}`)}
                  >
                    <TableCell className="py-3">
                      <div className="flex items-center gap-2">
                        {getTemperatureIcon(lead.temperature)}
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {lead.name}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="py-3">
                      <span className="text-sm text-gray-600 dark:text-gray-300">
                        {customerName}
                      </span>
                    </TableCell>
                    <TableCell className="py-3">
                      {getScoreBadge(lead.score_total)}
                    </TableCell>
                    <TableCell className="py-3">
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {formatRelativeDate(lead.last_contact_at || lead.updated_at)}
                      </span>
                    </TableCell>
                    <TableCell className="py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setConvertTarget(lead)}
                        className="h-7 px-2 text-xs border-gray-200 dark:border-gray-700"
                      >
                        <ArrowUpRight className="h-3.5 w-3.5" />
                        Convertir a deal
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Alta manual de lead */}
      <NewLeadDialog
        open={isNewLeadOpen}
        onOpenChange={setIsNewLeadOpen}
        branchId={branchFilter}
        onCreated={loadLeads}
      />

      {/* Dialog de confirmación: Convertir a deal */}
      <Dialog open={!!convertTarget} onOpenChange={(open) => !open && setConvertTarget(null)}>
        <DialogContent className="sm:max-w-md bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
          <DialogHeader>
            <DialogTitle className="text-gray-900 dark:text-white">
              Convertir lead a deal
            </DialogTitle>
            <DialogDescription className="text-gray-500 dark:text-gray-400">
              ¿Confirmas que quieres convertir el lead{' '}
              <span className="font-semibold text-gray-700 dark:text-gray-200">
                &ldquo;{convertTarget?.name}&rdquo;
              </span>{' '}
              en un deal? Esta acción lo moverá al pipeline de oportunidades como
              registro tipo <code className="text-xs">deal</code>.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setConvertTarget(null)}
              className="border-gray-200 dark:border-gray-700"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleConvertToDeal}
              disabled={isConverting}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isConverting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                  Convirtiendo...
                </>
              ) : (
                <>
                  <ArrowUpRight className="h-3.5 w-3.5 mr-1" />
                  Convertir
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
