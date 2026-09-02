'use client';

import { useState, useEffect } from 'react';
import { Users, Target, MapPin, TrendingUp, Award, UserCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/lib/supabase/config';
import { formatCurrency } from '@/utils/Utils';
import Link from 'next/link';
import { requireOrgId } from './useEquipoData';

export function EquipoSidebar() {
  const [stats, setStats] = useState({
    teams: 0,
    members: 0,
    territories: 0,
    openOpps: 0,
    pipelineValue: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const orgId = requireOrgId();
        const [teamsRes, membersRes, terrRes, oppsRes] = await Promise.all([
          supabase.from('sales_teams').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).eq('is_active', true),
          supabase.from('sales_team_members').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).eq('is_active', true),
          supabase.from('territories').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).eq('is_active', true),
          supabase.from('opportunities').select('amount, currency, status').eq('organization_id', orgId).in('status', ['open', 'qualified', 'proposal', 'negotiation']),
        ]);
        const openOpps = (oppsRes.data || []) as { amount: number | null; currency: string | null; status: string | null }[];
        const pipelineValue = openOpps.reduce((sum, o) => sum + (Number(o.amount) || 0), 0);
        setStats({
          teams: teamsRes.count || 0,
          members: membersRes.count || 0,
          territories: terrRes.count || 0,
          openOpps: openOpps.length,
          pipelineValue,
        });
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="space-y-5">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-32 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Card de pipeline total - destacado */}
      <Card className="bg-gradient-to-br from-rose-600 to-rose-700 dark:from-rose-700 dark:to-rose-800 border-0 text-white">
        <CardContent className="pt-6">
          <p className="text-rose-100 text-xs font-medium uppercase tracking-wide">Pipeline activo</p>
          <p className="text-3xl font-bold mt-1">{formatCurrency(stats.pipelineValue, 'COP')}</p>
          <p className="text-rose-200 text-xs mt-2">{stats.openOpps} oportunidades abiertas</p>
        </CardContent>
      </Card>

      {/* Card de métricas */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardContent className="pt-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-rose-100 dark:bg-rose-900/30 rounded-lg">
                <Users className="h-4 w-4 text-rose-600 dark:text-rose-400" />
              </div>
              <span className="text-sm text-gray-600 dark:text-gray-400">Equipos activos</span>
            </div>
            <span className="font-bold text-sm text-gray-900 dark:text-white">{stats.teams}</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <UserCircle className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </div>
              <span className="text-sm text-gray-600 dark:text-gray-400">Miembros</span>
            </div>
            <span className="font-bold text-sm text-gray-900 dark:text-white">{stats.members}</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
                <MapPin className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              </div>
              <span className="text-sm text-gray-600 dark:text-gray-400">Territorios</span>
            </div>
            <span className="font-bold text-sm text-gray-900 dark:text-white">{stats.territories}</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />
              </div>
              <span className="text-sm text-gray-600 dark:text-gray-400">Oportunidades abiertas</span>
            </div>
            <span className="font-bold text-sm text-gray-900 dark:text-white">{stats.openOpps}</span>
          </div>
        </CardContent>
      </Card>

      {/* Card de acceso rápido */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
            <Award className="h-4 w-4 text-rose-500" />
            Acceso rápido
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-2">
          <Link href="/app/crm/pipeline" className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors">
            <Target className="h-3.5 w-3.5" /> Ir al Pipeline
          </Link>
          <Link href="/app/crm/oportunidades" className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors">
            <TrendingUp className="h-3.5 w-3.5" /> Ver Oportunidades
          </Link>
          <Link href="/app/configuracion" className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors">
            <Users className="h-3.5 w-3.5" /> Configurar estructura
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
