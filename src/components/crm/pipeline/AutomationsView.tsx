'use client';

/**
 * Pestaña "Automatización" del pipeline (FASE-08 §5.1).
 *
 * Antes leía y ESCRIBÍA la tabla legacy `automations` con el cliente de
 * navegador y mostraba "estará disponible próximamente". Ahora muestra las
 * reglas reales de `automation_rules` que aplican a este pipeline, leídas por
 * la ruta de servidor `/api/crm/automation-rules`, y enlaza al editor completo
 * en `/app/crm/automatizaciones`. El navegador no escribe ninguna tabla.
 *
 * Contención (tester r2 §5): ocultar la entrada del menú NO bastaba, porque
 * esta vista está montada en el pipeline y sus enlaces dejaban entrar a la
 * página igual. Ahora el enlace se muestra SOLO si la entrada
 * `automatizaciones` de `src/config/crmNav.ts` está `enabled`, así que la
 * casilla del menú es el único interruptor real de la página.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Zap, ExternalLink, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TableSkeleton } from '@/components/common/PageSkeletons';
import { CRM_NAV } from '@/config/crmNav';

/** La página de automatizaciones solo es alcanzable si el menú la habilita. */
const AUTOMATIONS_PAGE_ENABLED = CRM_NAV.some((i) => i.key === 'automatizaciones' && i.enabled);

interface AutomationsViewProps {
  pipelineId: string;
}

interface RuleRow {
  id: string;
  name: string;
  description: string | null;
  trigger_type: string;
  pipeline_id: string | null;
  is_active: boolean;
  actions: { type: string }[] | null;
  last_run_at: string | null;
  runs_count: number | null;
}

const AutomationsView: React.FC<AutomationsViewProps> = ({ pipelineId }) => {
  const [rules, setRules] = useState<RuleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/crm/automation-rules', { cache: 'no-store' });
        const body = (await res.json().catch(() => ({}))) as { data?: RuleRow[]; error?: string };
        if (!res.ok) throw new Error(body.error || 'No se pudieron cargar las reglas');
        if (!cancelled) setRules(body.data ?? []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Error desconocido');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  const visible = useMemo(
    () => rules.filter((r) => !r.pipeline_id || r.pipeline_id === pipelineId),
    [rules, pipelineId],
  );

  return (
    <Card className="border-gray-200 dark:border-gray-700">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-gray-100">
              <Zap className="h-5 w-5" aria-hidden="true" /> Automatizaciones de este pipeline
            </CardTitle>
            <CardDescription>
              Las ejecuta la cola del servidor cuando ocurre el evento; el historial de cada ejecución queda en
              Automatizaciones.
            </CardDescription>
          </div>
          {AUTOMATIONS_PAGE_ENABLED && (
            <Button asChild variant="outline">
              <Link href="/app/crm/automatizaciones">
                Gestionar <ExternalLink className="ml-1.5 h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <TableSkeleton rows={3} />
        ) : error ? (
          <div role="alert" className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        ) : visible.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {AUTOMATIONS_PAGE_ENABLED ? (
              <>
                Este pipeline todavía no tiene reglas. Crea la primera desde{' '}
                <Link href="/app/crm/automatizaciones" className="underline">Automatizaciones</Link>.
              </>
            ) : (
              <>Este pipeline todavía no tiene reglas. El editor de automatizaciones aún no está habilitado.</>
            )}
          </p>
        ) : (
          <ul className="divide-y divide-gray-200 dark:divide-gray-700">
            {visible.map((rule) => (
              <li key={rule.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <p className="font-medium text-gray-900 dark:text-gray-100">{rule.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {rule.trigger_type} · {(rule.actions ?? []).length} acción(es) · {rule.runs_count ?? 0} ejecuciones
                  </p>
                </div>
                <Badge variant={rule.is_active ? 'default' : 'secondary'}>
                  {rule.is_active ? 'Activa' : 'Inactiva'}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
};

export default AutomationsView;
