'use client';

import { useState, useEffect, useCallback } from 'react';
import { Target, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from '@/components/ui/table';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabase/config';
import { formatCurrency } from '@/utils/Utils';
import Link from 'next/link';
import { requireOrgId } from '../useEquipoData';
import type { Opportunity, SalesTeam, OrgMember } from '../types';

export function AsignarTab() {
  const { toast } = useToast();
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [teams, setTeams] = useState<SalesTeam[]>([]);
  const [orgMembers, setOrgMembers] = useState<OrgMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [filterTeam, setFilterTeam] = useState('all');
  const [filterUnassigned, setFilterUnassigned] = useState(true);

  const load = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const orgId = requireOrgId();
      const [oppRes, teamsRes, membersRes] = await Promise.all([
        supabase
          .from('opportunities')
          .select('id, name, amount, currency, status, stage_id, salesperson_id, sales_team_id, territory_id, customer_id, expected_close_date, customers(full_name), stages(name, probability)')
          .eq('organization_id', orgId)
          .in('status', ['open', 'qualified', 'proposal', 'negotiation'])
          .order('updated_at', { ascending: false }),
        supabase.from('sales_teams').select('*, territories(id, name)').eq('organization_id', orgId).eq('is_active', true).order('name'),
        supabase.from('organization_members').select('user_id, profiles:user_id(id, first_name, last_name, email)').eq('organization_id', orgId).eq('is_active', true),
      ]);
      if (oppRes.error) throw oppRes.error;
      setOpportunities((oppRes.data || []) as unknown as Opportunity[]);
      setTeams((teamsRes.data || []) as SalesTeam[]);
      const orgMemberList = (membersRes.data || [] as { user_id: string; profiles: { id: string; first_name: string | null; last_name: string | null; email: string | null }[] }[]).map((m) => {
        const p = m.profiles?.[0] || null;
        const full = p ? [p.first_name, p.last_name].filter(Boolean).join(' ') : '';
        return { id: m.user_id, name: full || p?.email || m.user_id.slice(0, 8), email: p?.email || undefined };
      });
      setOrgMembers(orgMemberList);
    } catch (err) {
      console.error('Error cargando:', err);
      toast({ title: 'Error', description: 'No se pudieron cargar las oportunidades', variant: 'destructive' });
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const assignTeam = async (oppId: string, teamId: string | null) => {
    try {
      const { error } = await supabase.from('opportunities').update({ sales_team_id: teamId, updated_at: new Date().toISOString() }).eq('id', oppId);
      if (error) throw error;
      setOpportunities((prev) => prev.map((o) => o.id === oppId ? { ...o, sales_team_id: teamId } : o));
      toast({ title: 'Equipo asignado' });
    } catch {
      toast({ title: 'Error', description: 'No se pudo asignar', variant: 'destructive' });
    }
  };

  const assignSeller = async (oppId: string, userId: string | null) => {
    try {
      const { error } = await supabase.from('opportunities').update({ salesperson_id: userId, updated_at: new Date().toISOString() }).eq('id', oppId);
      if (error) throw error;
      setOpportunities((prev) => prev.map((o) => o.id === oppId ? { ...o, salesperson_id: userId } : o));
      toast({ title: 'Vendedor asignado' });
    } catch {
      toast({ title: 'Error', description: 'No se pudo asignar', variant: 'destructive' });
    }
  };

  const filtered = opportunities.filter((o) => {
    if (filterTeam !== 'all' && o.sales_team_id !== filterTeam) return false;
    if (filterUnassigned && o.salesperson_id) return false;
    return true;
  });

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => <div key={i} className="h-16 rounded-lg border animate-pulse bg-gray-100 dark:bg-gray-800" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardContent className="p-4">
          <div className="flex items-center gap-3 flex-wrap">
            <Select value={filterTeam} onValueChange={setFilterTeam}>
              <SelectTrigger className="w-48 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los equipos</SelectItem>
                {teams.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
              <Switch checked={filterUnassigned} onCheckedChange={setFilterUnassigned} />
              Solo sin asignar
            </label>
            <Button variant="outline" size="sm" onClick={load} disabled={isRefreshing}>
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </Button>
            <span className="text-sm text-gray-500">{filtered.length} oportunidades</span>
          </div>
        </CardContent>
      </Card>

      {/* Tabla */}
      {filtered.length === 0 ? (
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-12 pb-12 text-center">
            <Target className="h-12 w-12 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-sm text-gray-500">No hay oportunidades para asignar</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="px-2 sm:px-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Oportunidad</TableHead>
                  <TableHead className="text-xs">Cliente</TableHead>
                  <TableHead className="text-xs">Monto</TableHead>
                  <TableHead className="text-xs">Etapa</TableHead>
                  <TableHead className="text-xs">Equipo</TableHead>
                  <TableHead className="text-xs">Vendedor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="text-xs">
                      <Link href={`/app/crm/oportunidades/${o.id}`} className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
                        {o.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-xs">{o.customers?.[0]?.full_name || '—'}</TableCell>
                    <TableCell className="text-xs">{o.amount ? formatCurrency(Number(o.amount), o.currency || 'COP') : '—'}</TableCell>
                    <TableCell className="text-xs">{o.stages?.[0]?.name || '—'}</TableCell>
                    <TableCell>
                      <Select value={o.sales_team_id || 'none'} onValueChange={(v) => assignTeam(o.id, v === 'none' ? null : v)}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Sin equipo</SelectItem>
                          {teams.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Select value={o.salesperson_id || 'none'} onValueChange={(v) => assignSeller(o.id, v === 'none' ? null : v)}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Sin asignar</SelectItem>
                          {orgMembers.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
