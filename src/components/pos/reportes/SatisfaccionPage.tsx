'use client';

/**
 * Reportes › POS › «Satisfacción en caja» (Fase 4 de la pantalla del
 * cliente): promedio, distribución de 1 a 5 y conteo por sucursal y por
 * terminal de lo que el cliente calificó en la pantalla del POS.
 *
 * Mismo filtro que los demás informes del POS: dos días calendario y la
 * sucursal del contexto, convertidos a instantes con la zona horaria de la
 * organización (`getSatisfactionReport` → `getDateRange`). Aquí no se
 * construye ninguna fecha a mano.
 *
 * No hay ningún dato personal que pintar: la tabla solo guarda el número.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, RefreshCw, Smile, Store, Terminal as TerminalIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { CardListSkeleton, PageHeaderSkeleton, StatsSkeleton } from '@/components/common/PageSkeletons';
import { useOrgTimezone } from '@/lib/context/OrganizationTimezoneContext';
import { todayInTz, toPlainDate } from '@/lib/utils/dateDisplay';
import { useBranch } from '@/lib/context/BranchContext';
import { ReportesService } from './reportesService';
import { aggregateSatisfaction, getSatisfactionReport, type SatisfactionGroup, type SatisfactionReport } from './satisfaccionService';

/** Etiqueta de cada nota, de peor a mejor. Solo texto: el informe no es un juego de emojis. */
const RATING_LABELS: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: 'Muy mala',
  2: 'Mala',
  3: 'Regular',
  4: 'Buena',
  5: 'Muy buena',
};

const RATING_ORDER = [5, 4, 3, 2, 1] as const;

export function SatisfaccionPage() {
  const { toast } = useToast();
  const { timezone } = useOrgTimezone();
  const { branchFilter, setSelectedBranch: setGlobalBranch } = useBranch();
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [report, setReport] = useState<SatisfactionReport>(() => aggregateSatisfaction([]));
  const [branches, setBranches] = useState<{ id: number; name: string }[]>([]);

  const [startDate, setStartDate] = useState(() => {
    const ref = new Date();
    ref.setDate(ref.getDate() - 30);
    return toPlainDate(ref, timezone);
  });
  const [endDate, setEndDate] = useState(() => todayInTz(timezone));
  const [selectedBranch, setSelectedBranch] = useState<string>('all');

  useEffect(() => {
    setSelectedBranch(branchFilter != null ? String(branchFilter) : 'all');
  }, [branchFilter]);

  const loadData = useCallback(
    async (showRefresh = false) => {
      if (showRefresh) setIsRefreshing(true);
      else setLoading(true);
      try {
        const [data, branchesData] = await Promise.all([
          getSatisfactionReport({
            startDate,
            endDate,
            timezone,
            branchId: selectedBranch !== 'all' ? Number(selectedBranch) : undefined,
          }),
          ReportesService.getBranches(),
        ]);
        setReport(data);
        setBranches(branchesData);
      } catch (error) {
        console.error('Error cargando satisfacción:', error);
        toast({ title: 'Error', description: 'No se pudo cargar la satisfacción en caja', variant: 'destructive' });
      } finally {
        setLoading(false);
        setIsRefreshing(false);
      }
    },
    [startDate, endDate, timezone, selectedBranch, toast],
  );

  useEffect(() => {
    void loadData();
  }, [loadData]);

  if (loading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
        <PageHeaderSkeleton />
        <StatsSkeleton count={3} />
        <CardListSkeleton cards={2} columns="1" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/app/pos/reportes">
            <Button variant="ghost" size="icon" aria-label="Volver a reportes">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
              <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-xl">
                <Smile className="h-6 w-6 text-amber-600" />
              </div>
              Satisfacción en caja
            </h1>
            <p className="text-gray-500 dark:text-gray-400">POS / Reportes / Satisfacción · lo que el cliente calificó en la pantalla</p>
          </div>
        </div>
        <Button variant="outline" size="icon" onClick={() => loadData(true)} disabled={isRefreshing} aria-label="Actualizar">
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
            <div>
              <Label className="text-gray-700 dark:text-gray-300">Fecha Inicio</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="mt-1 dark:bg-gray-900 dark:border-gray-600 dark:[color-scheme:dark]"
              />
            </div>
            <div>
              <Label className="text-gray-700 dark:text-gray-300">Fecha Fin</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="mt-1 dark:bg-gray-900 dark:border-gray-600 dark:[color-scheme:dark]"
              />
            </div>
            <div>
              <Label className="text-gray-700 dark:text-gray-300">Sucursal</Label>
              <Select value={selectedBranch} onValueChange={(v) => setGlobalBranch(v === 'all' ? 'all' : parseInt(v))}>
                <SelectTrigger className="mt-1 dark:bg-gray-900 dark:border-gray-600">
                  <SelectValue placeholder="Todas las sucursales" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las sucursales</SelectItem>
                  {branches.map((branch) => (
                    <SelectItem key={branch.id} value={branch.id.toString()}>
                      {branch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">Promedio</p>
            <p className="text-3xl font-bold text-gray-900 dark:text-white tabular-nums">
              {report.total > 0 ? report.average.toFixed(1) : '—'}
              <span className="text-base font-normal text-gray-400"> / 5</span>
            </p>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">Calificaciones</p>
            <p className="text-3xl font-bold text-gray-900 dark:text-white tabular-nums">{report.total}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="text-gray-900 dark:text-white">Distribución</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {report.total === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">Sin calificaciones en el rango elegido.</p>
          ) : (
            RATING_ORDER.map((value) => {
              const count = report.distribution[value];
              const percent = report.total > 0 ? Math.round((count / report.total) * 100) : 0;
              return (
                <div key={value} className="flex items-center gap-3" data-rating-row={value}>
                  <span className="w-28 shrink-0 text-sm text-gray-700 dark:text-gray-200">{RATING_LABELS[value]}</span>
                  <div className="h-3 flex-1 rounded-full bg-gray-100 dark:bg-gray-700">
                    <div className="h-3 rounded-full bg-amber-500" style={{ width: `${percent}%` }} />
                  </div>
                  <span className="w-20 shrink-0 text-right text-sm tabular-nums text-gray-600 dark:text-gray-300">
                    {count} · {percent}%
                  </span>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <GroupCard title="Por sucursal" icon={<Store className="h-5 w-5 text-blue-600" />} groups={report.byBranch} />
        <GroupCard title="Por terminal" icon={<TerminalIcon className="h-5 w-5 text-purple-600" />} groups={report.byTerminal} />
      </div>
    </div>
  );
}

function GroupCard({ title, icon, groups }: { title: string; icon: React.ReactNode; groups: SatisfactionGroup[] }) {
  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-white">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {groups.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">Sin datos en el rango elegido.</p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-700">
            {groups.map((group) => (
              <li key={group.id} className="flex items-center justify-between gap-4 py-2">
                <span className="min-w-0 truncate text-sm text-gray-700 dark:text-gray-200">{group.name}</span>
                <span className="shrink-0 text-sm tabular-nums text-gray-600 dark:text-gray-300">
                  {group.average.toFixed(1)} / 5 · {group.count}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
