'use client';

/**
 * Bloque «Objeciones» de la oportunidad (FASE-02; se monta en el drawer del
 * pipeline y en el detalle). Muestra las registradas (`opportunity_objections`)
 * con su estado en icono + texto, permite marcarlas resueltas y registrar
 * otra del catálogo en dos clics. Solo rutas de servidor; nada de lógica de
 * negocio aquí.
 */

import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, CircleAlert, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/use-toast';
import type { Objection, OpportunityObjection } from '@/lib/services/crm/objectionService';
import { focusAfterResolve } from '@/lib/services/crm/objectionModel';
import { cn } from '@/utils/Utils';
import { CategoryBadge } from './categoryMeta';
import { ObjectionGuidance } from './ObjectionCard';
import { RegisterObjectionDialog } from './RegisterObjectionDialog';
import { useOpportunityObjections } from './useOpportunityObjections';

interface Props {
  opportunityId: string;
  /** Se llama tras registrar (la oportunidad guarda `objection_id`). */
  onChanged?: () => void;
}

function LinkedItem({ item, justRegistered, resolving, onResolve }: { item: OpportunityObjection; justRegistered: boolean; resolving: boolean; onResolve: () => void }) {
  const obj = item.objection;
  return (
    <li
      id={`opportunity-objection-${item.id}`}
      tabIndex={-1}
      className={cn(
        'rounded-lg border bg-white p-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:bg-gray-900',
        item.resolved ? 'border-gray-200 dark:border-gray-800' : 'border-amber-200 dark:border-amber-900/60',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <p className="flex items-center gap-1.5 text-sm font-medium text-gray-900 dark:text-gray-100">
            {item.resolved
              ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              : <CircleAlert className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />}
            <span className="truncate">{obj?.title ?? 'Objeción eliminada del catálogo'}</span>
          </p>
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {obj && <CategoryBadge value={obj.category} />}
            <span className={cn('font-medium', item.resolved ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300')}>
              {item.resolved ? 'Resuelta' : 'Pendiente'}
            </span>
          </div>
          {item.notes && <p className="text-xs text-gray-600 dark:text-gray-400">{item.notes}</p>}
        </div>
        {!item.resolved && (
          <Button type="button" size="sm" variant="outline" className="h-7 shrink-0 text-xs" disabled={resolving} onClick={onResolve}>
            {resolving ? 'Guardando…' : 'Marcar resuelta'}
          </Button>
        )}
      </div>
      {obj && !item.resolved && (
        <div className="mt-2">
          <ObjectionGuidance objection={obj} defaultOpen={justRegistered} compact />
        </div>
      )}
    </li>
  );
}

export function OpportunityObjectionsBlock({ opportunityId, onChanged }: Props) {
  const { linked, catalog, loading, error, register, resolve } = useOpportunityObjections(opportunityId);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [registering, setRegistering] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [justRegisteredId, setJustRegisteredId] = useState<string | null>(null);
  const [refocusId, setRefocusId] = useState<string | null>(null);
  const registerButtonRef = useRef<HTMLButtonElement>(null);

  // «Marcar resuelta» se deshabilita al guardar y se desmonta al resolverse:
  // el foco caería al body (brief §4). Mismo patrón que `refocusSwitchId` en
  // la página: al terminar, si nadie movió el foco, va al ítem resuelto.
  useEffect(() => {
    if (!refocusId) return;
    focusAfterResolve(document.activeElement, document.body, document.getElementById(`opportunity-objection-${refocusId}`), registerButtonRef.current)?.focus();
    setRefocusId(null);
  }, [refocusId]);

  const pendingIds = new Set(linked.filter((l) => !l.resolved).map((l) => l.objection_id));
  const pending = pendingIds.size;

  const onPick = async (objection: Objection, notes: string) => {
    setRegistering(objection.id);
    try {
      const id = await register(objection.id, notes);
      setJustRegisteredId(id);
      setPickerOpen(false);
      toast({ title: `«${objection.title}» registrada`, description: 'Abajo tienes la respuesta recomendada y las preguntas.' });
      onChanged?.();
    } catch (err) {
      toast({ title: 'No se pudo registrar', description: err instanceof Error ? err.message : 'Error desconocido', variant: 'destructive' });
    } finally {
      setRegistering(null);
    }
  };

  const onResolve = async (item: OpportunityObjection) => {
    setResolvingId(item.id);
    try {
      await resolve(item.id);
      toast({ title: `«${item.objection?.title ?? 'Objeción'}» resuelta` });
    } catch (err) {
      toast({ title: 'No se pudo marcar como resuelta', description: err instanceof Error ? err.message : 'Error desconocido', variant: 'destructive' });
    } finally {
      setResolvingId(null);
      setRefocusId(item.id);
    }
  };

  return (
    <section aria-labelledby={`objections-heading-${opportunityId}`} className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 id={`objections-heading-${opportunityId}`} className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
          <CircleAlert className="h-4 w-4 text-blue-500" aria-hidden="true" />
          Objeciones
          {linked.length > 0 && (
            <span className="text-xs font-normal text-gray-600 dark:text-gray-400">
              {pending === 0 ? `${linked.length} resuelta${linked.length === 1 ? '' : 's'}` : `${pending} pendiente${pending === 1 ? '' : 's'}`}
            </span>
          )}
        </h3>
        <Button ref={registerButtonRef} type="button" size="sm" className="h-7 bg-blue-600 text-xs text-white hover:bg-blue-700" onClick={() => setPickerOpen(true)}>
          <Plus className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Registrar objeción
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2" aria-busy="true" aria-label="Cargando objeciones">
          <Skeleton className="h-16 w-full rounded-lg" />
        </div>
      ) : error ? (
        <p role="alert" className="text-xs text-red-700 dark:text-red-300">{error}.</p>
      ) : linked.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-300 p-3 text-xs text-gray-600 dark:border-gray-700 dark:text-gray-400">
          Ninguna todavía. Cuando el cliente diga «es muy caro» o «tengo que consultarlo», regístrala aquí y tendrás la respuesta a mano.
        </p>
      ) : (
        <ul className="space-y-2" aria-label="Objeciones registradas">
          {linked.map((item) => (
            <LinkedItem key={item.id} item={item} justRegistered={item.id === justRegisteredId} resolving={resolvingId === item.id} onResolve={() => void onResolve(item)} />
          ))}
        </ul>
      )}

      <RegisterObjectionDialog
        open={pickerOpen}
        catalog={catalog}
        pendingIds={pendingIds}
        registering={registering}
        onOpenChange={setPickerOpen}
        onPick={(o, notes) => void onPick(o, notes)}
        returnFocusFallback={() => registerButtonRef.current}
      />
    </section>
  );
}
