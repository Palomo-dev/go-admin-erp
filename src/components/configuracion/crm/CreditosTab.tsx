'use client';

/**
 * Pestaña "Créditos y sistema" (F0 §5.2): saldos IA/comunicaciones, consumo
 * del mes por modelo y canal (gráfico simple), presupuesto y tabla de precios.
 * La cola de trabajos la muestra `JobsMonitor` (agente JOBS, F0 PR-03),
 * importado dinámicamente con skeleton de carga.
 */

import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const JobsMonitor = dynamic(() => import('@/components/crm/config/JobsMonitor').then((m) => m.JobsMonitor), {
  ssr: false,
  loading: () => <Skeleton className="h-40 w-full rounded-lg" aria-label="Cargando cola de trabajos" />,
});

interface CreditsResponse {
  success: boolean;
  error?: string;
  ai: {
    credits_remaining: number | null;
    purchased_credits: number;
    monthly_budget_usd: number | null;
    spent_month_usd: number;
    spent_month_credits: number;
    budget_used_pct: number | null;
    by_model: { model: string; credits: number; cost_usd: number; tokens: number; calls: number }[];
    by_day: { day: string; credits: number; cost_usd: number }[];
  };
  comm: {
    sms_remaining: number | null;
    whatsapp_remaining: number | null;
    voice_minutes_remaining: number | null;
    is_active: boolean;
    spent_month_usd: number;
    by_channel: { channel: string; credits: number; cost_usd: number; count: number }[];
  };
  pricing: { provider: string; sku: string; unit: string; unit_cost_usd: number; verified: boolean }[];
}

const usd = (n: number | null | undefined) => (n == null ? '—' : `$${n.toFixed(n < 1 ? 4 : 2)}`);
const num = (n: number | null | undefined) => (n == null ? 'Ilimitado' : n.toLocaleString('es-CO'));

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700 dark:bg-gray-900">
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">{value}</p>
      {hint && <p className="text-xs text-gray-500 dark:text-gray-400">{hint}</p>}
    </div>
  );
}

export function CreditosTab() {
  const [data, setData] = useState<CreditsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/crm/config/credits', { cache: 'no-store', credentials: 'include' });
      const json = (await res.json()) as CreditsResponse;
      if (!res.ok || !json.success) throw new Error(json.error || `Error ${res.status}`);
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !data) {
    return (
      <div className="space-y-4" aria-busy="true">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
        </div>
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" aria-hidden="true" />
        <AlertTitle>No se pudo cargar el estado de créditos</AlertTitle>
        <AlertDescription className="flex items-center justify-between gap-3">
          <span>{error}</span>
          <Button size="sm" variant="outline" onClick={() => void load()}><RefreshCw className="mr-1.5 h-4 w-4" aria-hidden="true" />Reintentar</Button>
        </AlertDescription>
      </Alert>
    );
  }
  if (!data) return null;

  const pct = data.ai.budget_used_pct;
  const overBudget = pct != null && pct >= 80;
  const chartData = data.ai.by_day.map((d) => ({ day: d.day.slice(5), créditos: d.credits, usd: Number(d.cost_usd.toFixed(4)) }));

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Créditos y sistema</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">Saldos, consumo del mes en curso y precios de referencia de los proveedores.</p>
        </div>
        <Button size="sm" variant="ghost" onClick={() => void load()} disabled={loading} aria-label="Recargar">
          <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} aria-hidden="true" />
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Créditos de IA" value={num(data.ai.credits_remaining)} hint={`Consumidos este mes: ${data.ai.spent_month_credits.toLocaleString('es-CO')}`} />
        <Kpi label="SMS restantes" value={num(data.comm.sms_remaining)} />
        <Kpi label="WhatsApp restantes" value={num(data.comm.whatsapp_remaining)} />
        <Kpi label="Minutos de voz" value={num(data.comm.voice_minutes_remaining)} />
      </div>

      <Card className="border-gray-200 dark:border-gray-700 dark:bg-gray-900">
        <CardHeader className="pb-2"><CardTitle className="text-base text-gray-900 dark:text-white">Presupuesto mensual de IA</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center justify-between text-sm text-gray-700 dark:text-gray-200">
            <span>Gasto estimado: <strong>{usd(data.ai.spent_month_usd)}</strong>{data.ai.monthly_budget_usd != null && <> de {usd(data.ai.monthly_budget_usd)}</>}</span>
            {pct != null && <span className={overBudget ? 'font-semibold text-amber-700 dark:text-amber-300' : ''}>{pct}%</span>}
          </div>
          {pct != null ? (
            <Progress value={Math.min(100, pct)} aria-label="Presupuesto usado" />
          ) : (
            <p className="text-xs text-gray-500 dark:text-gray-400">Define un presupuesto en Proveedores e IA › OpenAI › Presupuesto mensual.</p>
          )}
          {overBudget && (
            <p role="status" className="text-xs text-amber-700 dark:text-amber-300">Has usado el {pct}% del presupuesto del mes.</p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-gray-200 dark:border-gray-700 dark:bg-gray-900">
          <CardHeader className="pb-2"><CardTitle className="text-base text-gray-900 dark:text-white">Consumo diario de IA (créditos)</CardTitle></CardHeader>
          <CardContent className="h-56">
            {chartData.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">Sin consumo registrado este mes.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-gray-200 dark:text-gray-700" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="currentColor" />
                  <YAxis tick={{ fontSize: 11 }} stroke="currentColor" allowDecimals={false} />
                  <Tooltip formatter={(v: number, n: string) => (n === 'usd' ? usd(v) : v)} />
                  <Bar dataKey="créditos" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="border-gray-200 dark:border-gray-700 dark:bg-gray-900">
          <CardHeader className="pb-2"><CardTitle className="text-base text-gray-900 dark:text-white">Por modelo y canal (mes)</CardTitle></CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-gray-500 dark:text-gray-400">
                <tr><th className="py-1">Modelo / canal</th><th className="py-1 text-right">Llamadas</th><th className="py-1 text-right">Créditos</th><th className="py-1 text-right">USD</th></tr>
              </thead>
              <tbody className="text-gray-800 dark:text-gray-100">
                {data.ai.by_model.map((m) => (
                  <tr key={`m-${m.model}`} className="border-t border-gray-100 dark:border-gray-800"><td className="py-1">{m.model}</td><td className="py-1 text-right">{m.calls}</td><td className="py-1 text-right">{m.credits}</td><td className="py-1 text-right">{usd(m.cost_usd)}</td></tr>
                ))}
                {data.comm.by_channel.map((c) => (
                  <tr key={`c-${c.channel}`} className="border-t border-gray-100 dark:border-gray-800"><td className="py-1 capitalize">{c.channel}</td><td className="py-1 text-right">{c.count}</td><td className="py-1 text-right">{c.credits}</td><td className="py-1 text-right">{usd(c.cost_usd)}</td></tr>
                ))}
                {data.ai.by_model.length + data.comm.by_channel.length === 0 && (
                  <tr><td colSpan={4} className="py-3 text-center text-gray-500 dark:text-gray-400">Sin consumo este mes.</td></tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      <Card className="border-gray-200 dark:border-gray-700 dark:bg-gray-900">
        <CardHeader className="pb-2"><CardTitle className="text-base text-gray-900 dark:text-white">Precios de referencia (USD, sin impuestos)</CardTitle></CardHeader>
        <CardContent>
          {data.pricing.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">La tabla de precios (provider_pricing) aún no está cargada.</p>
          ) : (
            <div className="max-h-72 overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white text-left text-xs text-gray-500 dark:bg-gray-900 dark:text-gray-400">
                  <tr><th className="py-1">Proveedor</th><th className="py-1">SKU</th><th className="py-1">Unidad</th><th className="py-1 text-right">USD</th></tr>
                </thead>
                <tbody className="text-gray-800 dark:text-gray-100">
                  {data.pricing.map((p) => (
                    <tr key={`${p.provider}-${p.sku}`} className="border-t border-gray-100 dark:border-gray-800">
                      <td className="py-1">{p.provider}</td>
                      <td className="py-1 font-mono text-xs">{p.sku}{!p.verified && <span className="ml-1 text-amber-600 dark:text-amber-300" title="No verificado">*</span>}</td>
                      <td className="py-1">{p.unit}</td>
                      <td className="py-1 text-right">{p.unit_cost_usd.toFixed(4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <section aria-labelledby="jobs-monitor-title" className="space-y-3">
        <h4 id="jobs-monitor-title" className="text-base font-semibold text-gray-900 dark:text-white">Cola de trabajos</h4>
        <JobsMonitor />
      </section>
    </div>
  );
}
