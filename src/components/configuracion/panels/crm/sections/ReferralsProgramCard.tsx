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
import { ArrowRight, Award, Gift, RefreshCw, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/components/ui/use-toast';
import { nextReferralStatuses } from '@/lib/services/crm/referralStateMachine';
import { describeReward } from '@/lib/services/crm/referralReward';
import { ReferralProgramForm } from '@/components/crm/referidos/ReferralProgramForm';
import { REFERRAL_STATUS_META, ReferralStatusBadge } from '@/components/crm/referidos/referralMeta';
import { useReferrals } from '@/components/crm/referidos/useReferrals';
import { cn } from '@/utils/Utils';

export function ReferralsProgramCard() {
  const { referrals, programs, currency, loading, error, reload, transition, saveProgram } = useReferrals();
  const program = programs[0] ?? null;

  const onTransition = async (id: string, name: string, to: 'contacted' | 'qualified' | 'rejected') => {
    try {
      await transition(id, to);
      toast({ title: `«${name}»: ${REFERRAL_STATUS_META[to].label.toLowerCase()}` });
    } catch (err) {
      toast({ title: 'No se pudo cambiar el estado', description: err instanceof Error ? err.message : 'Error desconocido', variant: 'destructive' });
    }
  };

  if (loading) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Cargando programa de referidos">
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
            <p className="text-sm font-medium text-gray-900 dark:text-white">Programa de Referidos</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Configura la recompensa; los referidos se gestionan en su página</p>
          </div>
        </div>
        <Button variant="outline" size="sm" aria-label="Actualizar" onClick={() => void reload()}>
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>

      {error && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{error}</p>}

      <Card className="border-gray-200 dark:border-gray-700">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Gift className="h-4 w-4 text-indigo-500" aria-hidden="true" />
            {program ? `Programa «${program.name}»` : 'Crear el programa'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ReferralProgramForm program={program} currency={currency} idPrefix="ref-config" onSave={async (payload, id) => {
            await saveProgram(payload, id);
            toast({ title: 'Programa guardado', description: describeReward(payload, currency)?.summary });
          }} submitLabel="Guardar configuración" />
          {programs.length > 1 && (
            <p className="mt-3 text-xs text-gray-600 dark:text-gray-400">
              Hay {programs.length} programas; aquí se edita el más reciente. Los demás, en <Link href="/app/crm/referidos" className="text-blue-700 underline-offset-2 hover:underline dark:text-blue-300">Referidos → Programas</Link>.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h4 className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-white">
            <Award className="h-4 w-4 text-muted-foreground" aria-hidden="true" /> Referidos registrados ({referrals.length})
          </h4>
          <Link href="/app/crm/referidos" className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 underline-offset-2 hover:underline dark:text-blue-300">
            Ir a Referidos <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>
        {referrals.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-200 py-8 text-center dark:border-gray-700">
            <Users className="mx-auto mb-2 h-8 w-8 text-gray-400" aria-hidden="true" />
            <p className="text-sm text-gray-500 dark:text-gray-400">Todavía no hay referidos. Regístralos desde la página de Referidos.</p>
          </div>
        ) : (
          <ul className="space-y-2" aria-label="Referidos registrados">
            {referrals.slice(0, 10).map((ref) => {
              const next = nextReferralStatuses(ref.status).filter((s): s is 'contacted' | 'qualified' | 'rejected' => s !== 'converted');
              return (
                <li key={ref.id} className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900 dark:text-white">{ref.referred_name}</p>
                      <p className="truncate text-xs text-gray-500 dark:text-gray-400">Referido por: {ref.referrer?.full_name ?? 'cliente no disponible'}</p>
                      {ref.reward_paid && <p className="mt-0.5 text-xs text-emerald-800 dark:text-emerald-200">Recompensa registrada como pagada</p>}
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                      <ReferralStatusBadge status={ref.status} />
                      {next.map((s) => (
                        <Button key={s} type="button" size="sm" variant={s === 'rejected' ? 'ghost' : 'outline'} className={cn('h-7 text-xs', s === 'rejected' && 'text-red-700 dark:text-red-300')} onClick={() => void onTransition(ref.id, ref.referred_name, s)}>
                          {REFERRAL_STATUS_META[s].action}
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
