'use client';

import { useState, useEffect, useCallback, type ReactElement } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, CheckCircle2, XCircle, Trophy, AlertCircle } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { useBranch } from '@/lib/context/BranchContext';
import { CotizacionesService } from '@/lib/services/cotizacionesService';
import { commissionService } from '@/lib/services/crm/commissionService';
import { proposalService } from '@/lib/services/crm/proposalService';
import { useOrgTimezone } from '@/lib/context/OrganizationTimezoneContext';
import { buildInitialSteps, WON_STEP_EXECUTORS, type CloseStep, type OpportunityData, type StepStatus, type WonCloseDeps, type WonStepId } from '@/lib/services/crm/wonCloseSteps';

/**
 * WonCloseModal — cierre «al ganar» (F10). La lógica de cada paso vive en
 * `wonCloseSteps.ts` (puro, probado con el doble de F10); aquí solo se arma
 * `WonCloseDeps` con el cliente de navegador y se pinta el progreso.
 * Ronda 2: sin paso «stock» (leía `inventory`, que no existe); la comisión se
 * informa como «ya devengada» cuando el trigger de BD la creó al ganar.
 * Ronda 3: el tester reconstruyó el archivo (render del r1 + cableado a
 * `wonCloseSteps`) tras un fallo de restauración; el constructor lo cotejó
 * contra su versión (idéntico en comportamiento) y lo compactó a ≤ 300 líneas.
 */
interface WonCloseModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  opportunityId: string;
  opportunityName?: string;
  onComplete?: () => void;
  onCancel?: () => void;
}

const STATUS_ICON: Record<StepStatus, () => ReactElement> = {
  done: () => <CheckCircle2 className="h-5 w-5 text-green-500" />,
  error: () => <XCircle className="h-5 w-5 text-red-500" />,
  running: () => <Loader2 className="h-5 w-5 animate-spin text-blue-500" />,
  skipped: () => <AlertCircle className="h-5 w-5 text-gray-400" />,
  pending: () => <div className="h-5 w-5 rounded-full border-2 border-gray-300" />,
};

export function WonCloseModal({ open, onOpenChange, opportunityId, opportunityName, onComplete, onCancel }: WonCloseModalProps) {
  const { timezone } = useOrgTimezone();
  const [steps, setSteps] = useState<CloseStep[]>(buildInitialSteps);
  const [running, setRunning] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [opportunity, setOpportunity] = useState<OpportunityData | null>(null);

  // Sucursal seleccionada del contexto global; en modo "Todas" no hay sucursal concreta.
  const { selectedBranchId, isAllSelected } = useBranch();
  const contextBranchId = isAllSelected ? null : selectedBranchId;

  const loadOpportunity = useCallback(async () => {
    if (!opportunityId) return;
    const { data, error } = await supabase
      .from('opportunities')
      .select('id, name, customer_id, amount, currency, salesperson_id, pipeline_id, stage_id, billing_cycle_months, metadata, created_by')
      .eq('id', opportunityId)
      .maybeSingle();
    if (error || !data) {
      console.error('No se pudo cargar la oportunidad:', error);
      return;
    }
    setOpportunity(data as OpportunityData);
  }, [opportunityId]);

  useEffect(() => {
    if (open && opportunityId) {
      setSteps(buildInitialSteps());
      setCompleted(false);
      setRunning(false);
      loadOpportunity();
    }
  }, [open, opportunityId, loadOpportunity]);

  const updateStep = (id: WonStepId, updates: Partial<CloseStep>) => {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...updates } : s)));
  };

  const toggleStep = (id: WonStepId) => {
    if (running || completed) return;
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, autoExecute: !s.autoExecute, status: !s.autoExecute ? 'pending' : s.status } : s)));
  };

  // ============== Orchestrator ==============

  const runSteps = async () => {
    if (!opportunity) return;
    setRunning(true);

    const opp = opportunity;
    const deps: WonCloseDeps = {
      supabase,
      orgId: getOrganizationId(),
      contextBranchId,
      timezone,
      getLatestProposal: async (id) => {
        const p = await proposalService.getLatestProposalForOpportunity(id);
        return p ? { id: p.id, branch_id: p.branch_id ?? null } : null;
      },
      convertToInvoice: (quotationId, orgId, branchId, oppId) => CotizacionesService.convertToInvoice(quotationId, orgId, branchId, oppId),
      accrueCommission: (id, salespersonId, baseAmount) => commissionService.accrueCommission(id, salespersonId, baseAmount),
    };

    for (const step of steps) {
      if (!step.autoExecute) {
        updateStep(step.id, { status: 'skipped', result: 'Omitido por el usuario' });
        continue;
      }
      updateStep(step.id, { status: 'running' });
      try {
        const executor = WON_STEP_EXECUTORS[step.id];
        if (!executor) {
          updateStep(step.id, { status: 'error', result: 'Ejecutor no encontrado' });
          continue;
        }
        const result = await executor(opp, deps);
        updateStep(step.id, { status: 'done', result });
      } catch (err: unknown) {
        updateStep(step.id, { status: 'error', result: err instanceof Error ? err.message : 'Error desconocido' });
      }
    }

    setRunning(false);
    setCompleted(true);
    onComplete?.();
  };

  const handleCancel = () => {
    if (running) return;
    onCancel?.();
    onOpenChange(false);
  };

  const doneCount = steps.filter((s) => s.status === 'done').length;
  const errorCount = steps.filter((s) => s.status === 'error').length;
  const skippedCount = steps.filter((s) => s.status === 'skipped').length;
  const progress = Math.round((doneCount / steps.length) * 100);
  const statusIcon = (status: StepStatus) => STATUS_ICON[status]();

  return (
    <Dialog open={open} onOpenChange={(v) => !running && onOpenChange(v)}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-green-500" />
            Cierre de oportunidad ganada: {opportunityName || '...'}
          </DialogTitle>
          <DialogDescription>
            {completed
              ? 'Cierre completado. Revisa el resumen de acciones ejecutadas.'
              : 'Selecciona las acciones a ejecutar y confirma el cierre. Cada acción genera trazabilidad financiera.'}
          </DialogDescription>
        </DialogHeader>

        {/* Progress bar */}
        {(running || completed) && (
          <div className="w-full">
            <div className="flex justify-between text-xs mb-1">
              <span className="font-medium">
                {doneCount}/{steps.length} completadas
                {errorCount > 0 && ` · ${errorCount} errores`}
                {skippedCount > 0 && ` · ${skippedCount} omitidas`}
              </span>
              <span className="font-medium">{progress}%</span>
            </div>
            <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className={cn(
                  'h-full transition-all duration-300',
                  errorCount > 0 ? 'bg-yellow-500' : 'bg-green-500'
                )}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Steps list */}
        <div className="space-y-2">
          {steps.map((step) => (
            <div
              key={step.id}
              className={cn(
                'flex items-start gap-3 rounded-md border p-3',
                step.status === 'done' && 'border-green-200 bg-green-50 dark:bg-green-900/20 dark:border-green-800',
                step.status === 'error' && 'border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800',
                step.status === 'running' && 'border-blue-200 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-800',
                step.status === 'pending' && 'border-gray-200 dark:border-gray-700',
                step.status === 'skipped' && 'border-gray-100 bg-gray-50 dark:bg-gray-800/50 dark:border-gray-800'
              )}
            >
              <div className="mt-0.5">{statusIcon(step.status)}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {!completed && !running && (
                    <Checkbox
                      checked={step.autoExecute}
                      onCheckedChange={() => toggleStep(step.id)}
                      disabled={running}
                    />
                  )}
                  <span className="text-sm font-medium">{step.label}</span>
                  {step.optional && (
                    <span className="text-xs text-gray-400">(opcional)</span>
                  )}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {step.description}
                </p>
                {step.result && (
                  <p
                    className={cn(
                      'text-xs mt-1 font-mono',
                      step.status === 'error' ? 'text-red-600' : 'text-gray-600 dark:text-gray-300'
                    )}
                  >
                    {step.result}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Summary */}
        {completed && (
          <div className="rounded-md border border-gray-200 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-800/50">
            <h4 className="text-sm font-semibold mb-2">Resumen del cierre</h4>
            <div className="grid grid-cols-3 gap-2 text-center text-sm">
              <div>
                <div className="text-lg font-bold text-green-600">{doneCount}</div>
                <div className="text-xs text-gray-500">Exitosas</div>
              </div>
              <div>
                <div className="text-lg font-bold text-red-600">{errorCount}</div>
                <div className="text-xs text-gray-500">Errores</div>
              </div>
              <div>
                <div className="text-lg font-bold text-gray-400">{skippedCount}</div>
                <div className="text-xs text-gray-500">Omitidas</div>
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          {!completed ? (
            <>
              <Button
                variant="outline"
                onClick={handleCancel}
                disabled={running}
              >
                Cancelar
              </Button>
              <Button onClick={runSteps} disabled={running || !opportunity}>
                {running ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    Ejecutando...
                  </>
                ) : (
                  <>
                    <Trophy className="h-4 w-4 mr-1" />
                    Confirmar cierre
                  </>
                )}
              </Button>
            </>
          ) : (
            <Button onClick={() => onOpenChange(false)}>
              <CheckCircle2 className="h-4 w-4 mr-1" />
              Finalizar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default WonCloseModal;
