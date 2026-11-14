'use client';

/**
 * Pestaña "Créditos y sistema" (F0 §5.2): saldos IA/comunicaciones, consumo
 * del mes por modelo y canal (gráfico simple), presupuesto y tabla de precios.
 * La cola de trabajos la muestra `JobsMonitor` (agente JOBS, F0 PR-03),
 * importado dinámicamente con skeleton de carga.
 */

import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

function CargandoCola() {
  const t = useTranslations('configuracionTextos.creditosTab');
  return <Skeleton className="h-40 w-full rounded-lg" aria-label={t('cargandoCola')} />;
}

const JobsMonitor = dynamic(() => import('@/components/crm/config/JobsMonitor').then((m) => m.JobsMonitor), {
  ssr: false,
  loading: () => <CargandoCola />,
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
const num = (n: number | null | undefined, ilimitado: string) => (n == null ? ilimitado : n.toLocaleString('es-CO'));

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
  const t = useTranslations('configuracionTextos.creditosTab');
  const [data, setData] = useState<CreditsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/crm/config/credits', { cache: 'no-store', credentials: 'include' });
      const json = (await res.json()) as CreditsResponse;
      if (!res.ok || !json.success) throw new Error(json.error || t('errorHttp', { status: String(res.status) }));
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errorDesconocido'));
    } finally {
      setLoading(false);
    }
  }, [t]);

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
        <AlertTitle>{t('errorCarga')}</AlertTitle>
        <AlertDescription className="flex items-center justify-between gap-3">
          <span>{error}</span>
          <Button size="sm" variant="outline" onClick={() => void load()}><RefreshCw className="mr-1.5 h-4 w-4" aria-hidden="true" />{t('reintentar')}</Button>
        </AlertDescription>
      </Alert>
    );
  }
  if (!data) return null;

  const pct = data.ai.budget_used_pct;
  const overBudget = pct != null && pct >= 80;
  const ilimitado = t('ilimitado');
  const chartData = data.ai.by_day.map((d) => ({ day: d.day.slice(5), créditos: d.credits, usd: Number(d.cost_usd.toFixed(4)) }));

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{t('titulo')}</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('descripcion')}</p>
        </div>
        <Button size="sm" variant="ghost" onClick={() => void load()} disabled={loading} aria-label={t('recargar')}>
          <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} aria-hidden="true" />
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label={t('kpi.creditosIa')} value={num(data.ai.credits_remaining, ilimitado)} hint={t('kpi.consumidosMes', { cantidad: data.ai.spent_month_credits.toLocaleString('es-CO') })} />
        <Kpi label={t('kpi.smsRestantes')} value={num(data.comm.sms_remaining, ilimitado)} />
        <Kpi label={t('kpi.whatsappRestantes')} value={num(data.comm.whatsapp_remaining, ilimitado)} />
        <Kpi label={t('kpi.minutosVoz')} value={num(data.comm.voice_minutes_remaining, ilimitado)} />
      </div>

      <Card className="border-gray-200 dark:border-gray-700 dark:bg-gray-900">
        <CardHeader className="pb-2"><CardTitle className="text-base text-gray-900 dark:text-white">{t('presupuesto.titulo')}</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center justify-between text-sm text-gray-700 dark:text-gray-200">
            <span>
              {data.ai.monthly_budget_usd != null
                ? t.rich('presupuesto.gastoDe', { b: (c) => <strong>{c}</strong>, gasto: usd(data.ai.spent_month_usd), presupuesto: usd(data.ai.monthly_budget_usd) })
                : t.rich('presupuesto.gasto', { b: (c) => <strong>{c}</strong>, gasto: usd(data.ai.spent_month_usd) })}
            </span>
            {pct != null && <span className={overBudget ? 'font-semibold text-amber-700 dark:text-amber-300' : ''}>{pct}%</span>}
          </div>
          {pct != null ? (
            <Progress value={Math.min(100, pct)} aria-label={t('presupuesto.usado')} />
          ) : (
            <p className="text-xs text-gray-500 dark:text-gray-400">{t('presupuesto.sinPresupuesto')}</p>
          )}
          {overBudget && (
            <p role="status" className="text-xs text-amber-700 dark:text-amber-300">{t('presupuesto.alerta', { pct: String(pct) })}</p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-gray-200 dark:border-gray-700 dark:bg-gray-900">
          <CardHeader className="pb-2"><CardTitle className="text-base text-gray-900 dark:text-white">{t('consumoDiario.titulo')}</CardTitle></CardHeader>
          <CardContent className="h-56">
            {chartData.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">{t('consumoDiario.vacio')}</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-gray-200 dark:text-gray-700" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="currentColor" />
                  <YAxis tick={{ fontSize: 11 }} stroke="currentColor" allowDecimals={false} />
                  <Tooltip formatter={(v: number, n: string) => (n === 'usd' ? usd(v) : v)} />
                  <Bar dataKey="créditos" name={t('consumoDiario.serie')} fill="#3b82f6" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="border-gray-200 dark:border-gray-700 dark:bg-gray-900">
          <CardHeader className="pb-2"><CardTitle className="text-base text-gray-900 dark:text-white">{t('porModelo.titulo')}</CardTitle></CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-gray-500 dark:text-gray-400">
                <tr><th className="py-1">{t('porModelo.modeloCanal')}</th><th className="py-1 text-right">{t('porModelo.llamadas')}</th><th className="py-1 text-right">{t('porModelo.creditos')}</th><th className="py-1 text-right">USD</th></tr>
              </thead>
              <tbody className="text-gray-800 dark:text-gray-100">
                {data.ai.by_model.map((m) => (
                  <tr key={`m-${m.model}`} className="border-t border-gray-100 dark:border-gray-800"><td className="py-1">{m.model}</td><td className="py-1 text-right">{m.calls}</td><td className="py-1 text-right">{m.credits}</td><td className="py-1 text-right">{usd(m.cost_usd)}</td></tr>
                ))}
                {data.comm.by_channel.map((c) => (
                  <tr key={`c-${c.channel}`} className="border-t border-gray-100 dark:border-gray-800"><td className="py-1 capitalize">{c.channel}</td><td className="py-1 text-right">{c.count}</td><td className="py-1 text-right">{c.credits}</td><td className="py-1 text-right">{usd(c.cost_usd)}</td></tr>
                ))}
                {data.ai.by_model.length + data.comm.by_channel.length === 0 && (
                  <tr><td colSpan={4} className="py-3 text-center text-gray-500 dark:text-gray-400">{t('porModelo.vacio')}</td></tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      <Card className="border-gray-200 dark:border-gray-700 dark:bg-gray-900">
        <CardHeader className="pb-2"><CardTitle className="text-base text-gray-900 dark:text-white">{t('precios.titulo')}</CardTitle></CardHeader>
        <CardContent>
          {data.pricing.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">{t('precios.vacio')}</p>
          ) : (
            <div className="max-h-72 overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white text-left text-xs text-gray-500 dark:bg-gray-900 dark:text-gray-400">
                  <tr><th className="py-1">{t('precios.proveedor')}</th><th className="py-1">SKU</th><th className="py-1">{t('precios.unidad')}</th><th className="py-1 text-right">USD</th></tr>
                </thead>
                <tbody className="text-gray-800 dark:text-gray-100">
                  {data.pricing.map((p) => (
                    <tr key={`${p.provider}-${p.sku}`} className="border-t border-gray-100 dark:border-gray-800">
                      <td className="py-1">{p.provider}</td>
                      <td className="py-1 font-mono text-xs">{p.sku}{!p.verified && <span className="ml-1 text-amber-600 dark:text-amber-300" title={t('precios.noVerificado')}>*</span>}</td>
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
        <h4 id="jobs-monitor-title" className="text-base font-semibold text-gray-900 dark:text-white">{t('colaTrabajos')}</h4>
        <JobsMonitor />
      </section>
    </div>
  );
}
