'use client';

import { useState, useEffect, useCallback } from 'react';
import { Gauge, RefreshCw, TrendingUp, Trophy, Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from '@/components/ui/table';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabase/config';
import { formatCurrency } from '@/utils/Utils';
import Link from 'next/link';
import { requireOrgId } from '../useEquipoData';
import { memberName } from '../types';
import type { SalesTeamMember, Opportunity } from '../types';

interface PerfRow {
  member: SalesTeamMember;
  active: number;
  won: number;
  lost: number;
  pipelineAmount: number;
  wonAmount: number;
  quota: number;
  currency: string;
}

export function PerformanceTab() {
  const { toast } = useToast();
  const [members, setMembers] = useState<SalesTeamMember[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const load = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const orgId = requireOrgId();
      const [membersRes, oppRes] = await Promise.all([
        supabase
          .from('sales_team_members')
          .select(`*, sales_roles:sales_role_id(id, name, code), profiles:user_id(id, first_name, last_name, email), territories:territory_id(id, name)`)
          .eq('organization_id', orgId)
          .eq('is_active', true),
        supabase
          .from('opportunities')
          .select('id, name, amount, currency, status, salesperson_id, stage_id, stages(name, probability)')
          .eq('organization_id', orgId),
      ]);
      if (membersRes.error) throw membersRes.error;
      if (oppRes.error) throw oppRes.error;
      setMembers((membersRes.data || []) as SalesTeamMember[]);
      setOpportunities((oppRes.data || []) as unknown as Opportunity[]);
    } catch (err) {
      console.error('Error:', err);
      toast({ title: 'Error', description: 'No se pudo cargar performance', variant: 'destructive' });
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const rows: PerfRow[] = members.map((m) => {
    const memberOpps = opportunities.filter((o) => o.salesperson_id === m.user_id);
    const active = memberOpps.filter((o) => !['won', 'lost'].includes(o.status || '')).length;
    const won = memberOpps.filter((o) => o.status === 'won').length;
    const lost = memberOpps.filter((o) => o.status === 'lost').length;
    const pipelineAmount = memberOpps.filter((o) => !['won', 'lost'].includes(o.status || '')).reduce((s, o) => s + (Number(o.amount) || 0), 0);
    const wonAmount = memberOpps.filter((o) => o.status === 'won').reduce((s, o) => s + (Number(o.amount) || 0), 0);
    return { member: m, active, won, lost, pipelineAmount, wonAmount, quota: Number(m.quota_amount) || 0, currency: m.quota_currency || 'COP' };
  });

  // Stats agregadas
  const totalActive = rows.reduce((s, r) => s + r.active, 0);
  const totalWon = rows.reduce((s, r) => s + r.won, 0);
  const totalPipeline = rows.reduce((s, r) => s + r.pipelineAmount, 0);
  const totalWonAmount = rows.reduce((s, r) => s + r.wonAmount, 0);

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => <div key={i} className="h-20 rounded-lg border animate-pulse bg-gray-100 dark:bg-gray-800" />)}
      </div>
    );
  }

  if (members.length === 0) {
    return (
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardContent className="pt-12 pb-12 text-center">
          <Gauge className="h-12 w-12 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-sm text-gray-500">No hay miembros en equipos para mostrar performance</p>
          <Link href="/app/crm/equipo" className="text-sm text-blue-600 hover:underline mt-2 inline-block">Asigna miembros desde la tab Equipos</Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="p-3 sm:pt-4 sm:px-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                <Target className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="min-w-0">
                <div className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white">{totalActive}</div>
                <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">Activas</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="p-3 sm:pt-4 sm:px-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center shrink-0">
                <Trophy className="h-4 w-4 sm:h-5 sm:w-5 text-green-600 dark:text-green-400" />
              </div>
              <div className="min-w-0">
                <div className="text-lg sm:text-2xl font-bold text-green-600 dark:text-green-400">{totalWon}</div>
                <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">Ganadas</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="p-3 sm:pt-4 sm:px-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center shrink-0">
                <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div className="min-w-0">
                <div className="text-xs sm:text-sm font-bold text-gray-900 dark:text-white truncate">
                  {formatCurrency(totalPipeline, 'COP')}
                </div>
                <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">Pipeline</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 col-span-2 sm:col-span-1">
          <CardContent className="p-3 sm:pt-4 sm:px-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center shrink-0">
                <Trophy className="h-4 w-4 sm:h-5 sm:w-5 text-green-600 dark:text-green-400" />
              </div>
              <div className="min-w-0">
                <div className="text-xs sm:text-sm font-bold text-green-600 dark:text-green-400 truncate">
                  {formatCurrency(totalWonAmount, 'COP')}
                </div>
                <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">Ganado</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Header con acciones */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600 dark:text-gray-400">{members.length} vendedores</p>
        <Button variant="outline" size="sm" onClick={load} disabled={isRefreshing}>
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Tabla */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardContent className="px-2 sm:px-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Vendedor</TableHead>
                <TableHead className="text-xs">Rol</TableHead>
                <TableHead className="text-xs">Activas</TableHead>
                <TableHead className="text-xs">Ganadas</TableHead>
                <TableHead className="text-xs">Perdidas</TableHead>
                <TableHead className="text-xs">Pipeline</TableHead>
                <TableHead className="text-xs">Ganado</TableHead>
                <TableHead className="text-xs">Cuota</TableHead>
                <TableHead className="text-xs">%</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const pct = r.quota > 0 ? Math.round((r.wonAmount / r.quota) * 100) : 0;
                const pctColor = pct >= 100 ? 'text-green-600' : pct >= 50 ? 'text-blue-600' : 'text-gray-500';
                return (
                  <TableRow key={r.member.id}>
                    <TableCell className="text-xs font-medium">{memberName(r.member)}</TableCell>
                    <TableCell className="text-xs">{r.member.sales_roles?.name || '—'}</TableCell>
                    <TableCell className="text-xs"><Badge variant="secondary">{r.active}</Badge></TableCell>
                    <TableCell className="text-xs"><span className="text-green-600">{r.won}</span></TableCell>
                    <TableCell className="text-xs"><span className="text-red-500">{r.lost}</span></TableCell>
                    <TableCell className="text-xs">{formatCurrency(r.pipelineAmount, r.currency)}</TableCell>
                    <TableCell className="text-xs font-medium text-green-600">{formatCurrency(r.wonAmount, r.currency)}</TableCell>
                    <TableCell className="text-xs">{r.quota > 0 ? formatCurrency(r.quota, r.currency) : '—'}</TableCell>
                    <TableCell className={`text-xs font-bold ${pctColor}`}>{r.quota > 0 ? `${pct}%` : '—'}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
