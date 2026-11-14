'use client';

/**
 * Configuración → CRM → Programa de referidos.
 *
 * F12 la dividió: el formulario vive en
 * `components/crm/referidos/ReferralProgramForm.tsx` (el mismo de la página
 * de referidos) y todo pasa por `/api/crm/referrals/**`. Antes escribía
 * `referral_programs` y `referrals.status` desde el navegador con un `Select`
 * libre, que permitía saltos como pending → converted; ahora el estado lo
 * decide la máquina del servidor y aquí solo se ofrecen los pasos válidos.
 */

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowRight, Award, Gift, RefreshCw, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/components/ui/use-toast';
import { nextReferralStatuses } from '@/lib/services/crm/referralStateMachine';
import { describeReward } from '@/lib/services/crm/referralReward';
import { ReferralProgramForm } from '@/components/crm/referidos/ReferralProgramForm';
import { ReferralStatusBadge } from '@/components/crm/referidos/referralMeta';
import { useReferrals } from '@/components/crm/referidos/useReferrals';
import { cn } from '@/utils/Utils';

export function ReferralsProgramCard() {
  const { referrals, programs, currency, loading, error, reload, transition, saveProgram } = useReferrals();
  const program = programs[0] ?? null;
  const t = useTranslations('configuracionTextos.referralsProgramCard');

  const onTransition = async (id: string, name: string, to: 'contacted' | 'qualified' | 'rejected') => {
    try {
      await transition(id, to);
      toast({ title: t(`estadoCambiado.${to}`, { nombre: name }) });
    } catch (err) {
      toast({ title: t('errorEstado'), description: err instanceof Error ? err.message : t('errorDesconocido'), variant: 'destructive' });
    }
  };

  if (loading) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label={t('cargando')}>
        {[1, 2, 3].map((i) => <div key={i} className="h-24 animate-pulse rounded-lg border border-gray-200 bg-gray-100 dark:border-gray-700 dark:bg-gray-800" />)}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-white">{t('titulo')}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{t('subtitulo')}</p>
          </div>
        </div>
        <Button variant="outline" size="sm" aria-label={t('actualizar')} onClick={() => void reload()}>
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>

      {error && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{error}</p>}

      <Card className="border-gray-200 dark:border-gray-700">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Gift className="h-4 w-4 text-indigo-500" aria-hidden="true" />
            {program ? t('programa', { nombre: program.name }) : t('crearPrograma')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ReferralProgramForm program={program} currency={currency} idPrefix="ref-config" onSave={async (payload, id) => {
            await saveProgram(payload, id);
            toast({ title: t('programaGuardado'), description: describeReward(payload, currency)?.summary });
          }} submitLabel={t('guardarConfiguracion')} />
          {programs.length > 1 && (
            <p className="mt-3 text-xs text-gray-600 dark:text-gray-400">
              {t.rich('variosProgramas', {
                n: programs.length,
                enlace: (c) => <Link href="/app/crm/referidos" className="text-blue-700 underline-offset-2 hover:underline dark:text-blue-300">{c}</Link>,
              })}
            </p>
          )}
        </CardContent>
      </Card>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h4 className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-white">
            <Award className="h-4 w-4 text-muted-foreground" aria-hidden="true" /> {t('registrados', { n: referrals.length })}
          </h4>
          <Link href="/app/crm/referidos" className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 underline-offset-2 hover:underline dark:text-blue-300">
            {t('irAReferidos')} <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>
        {referrals.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-200 py-8 text-center dark:border-gray-700">
            <Users className="mx-auto mb-2 h-8 w-8 text-gray-400" aria-hidden="true" />
            <p className="text-sm text-gray-500 dark:text-gray-400">{t('vacio')}</p>
          </div>
        ) : (
          <ul className="space-y-2" aria-label={t('listaAria')}>
            {referrals.slice(0, 10).map((ref) => {
              const next = nextReferralStatuses(ref.status).filter((s): s is 'contacted' | 'qualified' | 'rejected' => s !== 'converted');
              return (
                <li key={ref.id} className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900 dark:text-white">{ref.referred_name}</p>
                      <p className="truncate text-xs text-gray-500 dark:text-gray-400">{t('referidoPor', { nombre: ref.referrer?.full_name ?? t('clienteNoDisponible') })}</p>
                      {ref.reward_paid && <p className="mt-0.5 text-xs text-emerald-800 dark:text-emerald-200">{t('recompensaPagada')}</p>}
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                      <ReferralStatusBadge status={ref.status} />
                      {next.map((s) => (
                        <Button key={s} type="button" size="sm" variant={s === 'rejected' ? 'ghost' : 'outline'} className={cn('h-7 text-xs', s === 'rejected' && 'text-red-700 dark:text-red-300')} onClick={() => void onTransition(ref.id, ref.referred_name, s)}>
                          {t(`acciones.${s}`)}
                        </Button>
                      ))}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
