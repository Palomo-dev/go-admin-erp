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
import {
  RefreshCw,
  Loader2,
  Search,
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

  const [leads, setLeads] = useState<Lead[]>([]);
  const [customers, setCustomers] = useState<Record<string, CustomerRef>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [convertTarget, setConvertTarget] = useState<Lead | null>(null);
  const [isConverting, setIsConverting] = useState(false);

  const loadLeads = useCallback(async () => {
    setIsLoading(true);
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
        const { data: custData } = await supabase
          .from('customers')
          .select('id, full_name')
          .in('id', customerIds);
        if (custData) {
          const map: Record<string, CustomerRef> = {};
          custData.forEach((c) => {
            map[c.id] = { id: c.id, full_name: c.full_name };
          });
          setCustomers(map);
        }
      }
    } catch (err) {
      console.error('Error cargando leads:', err);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los leads',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

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

      // Si el gate falló (soft-gate), mostrar advertencia pero la conversión ya se hizo
      if (data.gateResult && !data.gateResult.ok) {
        toast({
          title: 'Lead convertido (con advertencias)',
          description: `"${convertTarget.name}" ahora es un deal. Faltan: ${data.gateResult.missing?.map((m: any) => m.label).join(', ') || 'criterios'}`,
          variant: 'default',
        });
      } else {
        toast({
          title: 'Lead convertido',
          description: `"${convertTarget.name}" ahora es un deal`,
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
        ) : filteredLeads.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-3">
              <Search className="h-6 w-6 text-gray-400" />
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {search ? 'No se encontraron leads con ese filtro.' : 'No hay leads registrados.'}
            </p>
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
