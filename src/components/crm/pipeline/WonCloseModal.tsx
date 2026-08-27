'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, CheckCircle2, XCircle, Trophy, AlertCircle } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { CotizacionesService } from '@/lib/services/cotizacionesService';
import { commissionService } from '@/lib/services/crm/commissionService';
import { proposalService } from '@/lib/services/crm/proposalService';

interface WonCloseModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  opportunityId: string;
  opportunityName?: string;
  onComplete?: () => void;
  onCancel?: () => void;
}

type StepStatus = 'pending' | 'running' | 'done' | 'skipped' | 'error';

interface CloseStep {
  id: string;
  label: string;
  description: string;
  autoExecute: boolean;
  status: StepStatus;
  result?: string;
  optional?: boolean;
}

interface OpportunityData {
  id: string;
  name: string;
  customer_id: string | null;
  amount: number;
  currency: string;
  salesperson_id: string | null;
  pipeline_id: string;
  stage_id: string;
  billing_cycle_months: number | null;
  metadata: Record<string, unknown> | null;
  created_by: string | null;
}

const RENEWAL_MILESTONES = [120, 90, 60, 30, 15, 7];

function buildInitialSteps(): CloseStep[] {
  return [
    {
      id: 'invoice',
      label: 'Generar factura',
      description: 'Convierte la última cotización en factura (invoice_sales.opportunity_id)',
      autoExecute: true,
      status: 'pending',
    },
    {
      id: 'pos_sale',
      label: 'Generar venta POS',
      description: 'Crea venta en POS vinculada a la oportunidad (sales.opportunity_id)',
      autoExecute: false,
      status: 'pending',
      optional: true,
    },
    {
      id: 'stock',
      label: 'Reservar stock / sugerir OC',
      description: 'Reserva stock de productos o sugiere orden de compra',
      autoExecute: false,
      status: 'pending',
      optional: true,
    },
    {
      id: 'reservations',
      label: 'Crear reservas',
      description: 'Crea reservas desde opportunity_spaces con opportunity_id',
      autoExecute: true,
      status: 'pending',
    },
    {
      id: 'onboarding',
      label: 'Crear oportunidad de Onboarding',
      description: 'Crea oportunidad hija en pipeline type=onboarding',
      autoExecute: true,
      status: 'pending',
    },
    {
      id: 'renewal',
      label: 'Programar renovación',
      description: 'Hitos de renovación 120/90/60/30/15/7 días antes del vencimiento',
      autoExecute: true,
      status: 'pending',
    },
    {
      id: 'referral',
      label: 'Pedir referido',
      description: 'Crea tarea de referido activada post-30-días + plantilla de mensaje',
      autoExecute: true,
      status: 'pending',
    },
    {
      id: 'commission',
      label: 'Devengar comisión',
      description: 'Registra comisión del vendedor via commissionService',
      autoExecute: true,
      status: 'pending',
    },
  ];
}

export function WonCloseModal({
  open,
  onOpenChange,
  opportunityId,
  opportunityName,
  onComplete,
  onCancel,
}: WonCloseModalProps) {
  const [steps, setSteps] = useState<CloseStep[]>(buildInitialSteps);
  const [running, setRunning] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [opportunity, setOpportunity] = useState<OpportunityData | null>(null);

  const loadOpportunity = useCallback(async () => {
    if (!opportunityId) return;
    const { data, error } = await supabase
      .from('opportunities')
      .select(
        'id, name, customer_id, amount, currency, salesperson_id, pipeline_id, stage_id, billing_cycle_months, metadata, created_by'
      )
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

  const updateStep = (id: string, updates: Partial<CloseStep>) => {
    setSteps((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...updates } : s))
    );
  };

  const toggleStep = (id: string) => {
    if (running || completed) return;
    setSteps((prev) =>
      prev.map((s) =>
        s.id === id
          ? {
              ...s,
              autoExecute: !s.autoExecute,
              status: !s.autoExecute ? 'pending' : s.status,
            }
          : s
      )
    );
  };

  // ============== Step executors ==============

  const executeInvoice = async (opp: OpportunityData): Promise<string> => {
    const latestProposal = await proposalService.getLatestProposalForOpportunity(
      opp.id
    );
    if (!latestProposal) {
      return 'Sin cotización vinculada — se omitió la factura';
    }

    const orgId = getOrganizationId();
    const branchId = latestProposal.branch_id || 1;

    const invoiceId = await CotizacionesService.convertToInvoice(
      latestProposal.id,
      orgId,
      branchId
    );

    // Vincular factura a la oportunidad
    await supabase
      .from('invoice_sales')
      .update({ opportunity_id: opp.id })
      .eq('id', invoiceId);

    return `Factura generada: ${invoiceId.substring(0, 8)}...`;
  };

  const executePosSale = async (opp: OpportunityData): Promise<string> => {
    if (!opp.customer_id) return 'Sin cliente — se omitió venta POS';

    const orgId = getOrganizationId();
    const { data: userData } = await supabase.auth.getUser();

    const { data: sale, error } = await supabase
      .from('sales')
      .insert({
        organization_id: orgId,
        branch_id: 1,
        customer_id: opp.customer_id,
        user_id: userData.user?.id || opp.created_by || '',
        total: opp.amount,
        subtotal: opp.amount,
        tax_total: 0,
        balance: opp.amount,
        status: 'completed',
        payment_status: 'pending',
        tax_included: false,
        sale_date: new Date().toISOString(),
        opportunity_id: opp.id,
        salesperson_id: opp.salesperson_id,
        source: 'crm',
        include_in_cash_register: false,
      })
      .select('id')
      .single();

    if (error) throw error;
    return `Venta CRM creada: ${(sale as { id: string }).id.substring(0, 8)}...`;
  };

  const executeStock = async (opp: OpportunityData): Promise<string> => {
    const { data: products } = await supabase
      .from('opportunity_products')
      .select('product_id, quantity, product:products(id, name, sku)')
      .eq('opportunity_id', opp.id);

    if (!products || products.length === 0) {
      return 'Sin productos — se omitió reserva de stock';
    }

    let reserved = 0;
    let suggested = 0;

    for (const p of products as Array<Record<string, unknown>>) {
      const { data: stock } = await supabase
        .from('inventory')
        .select('quantity')
        .eq('product_id', p.product_id as number)
        .limit(1)
        .maybeSingle();

      const available = Number((stock as { quantity?: number } | null)?.quantity) || 0;
      const needed = Number(p.quantity) || 0;

      if (available >= needed) {
        // Reservar: descontar del inventario
        await supabase
          .from('inventory')
          .update({ quantity: available - needed })
          .eq('product_id', p.product_id);
        reserved++;
      } else {
        // Sugerir orden de compra (registrar tarea)
        suggested++;
      }
    }

    return `Reservados: ${reserved}, OC sugeridas: ${suggested}`;
  };

  const executeReservations = async (opp: OpportunityData): Promise<string> => {
    const { data: spaces } = await supabase
      .from('opportunity_spaces')
      .select('space_id, nights, unit_price, checkin_date, checkout_date')
      .eq('opportunity_id', opp.id);

    if (!spaces || spaces.length === 0) {
      return 'Sin espacios — se omitieron reservas';
    }

    const orgId = getOrganizationId();
    let created = 0;

    for (const s of spaces as Array<Record<string, unknown>>) {
      const checkinDate = s.checkin_date as string | null;
      const checkoutDate = s.checkout_date as string | null;
      const nights = Number(s.nights) || 1;
      const startDate = checkinDate
        ? new Date(checkinDate).toISOString()
        : new Date().toISOString();
      const endDate = checkoutDate
        ? new Date(checkoutDate).toISOString()
        : new Date(Date.now() + nights * 24 * 60 * 60 * 1000).toISOString();

      const { error } = await supabase.from('reservations').insert({
        organization_id: orgId,
        customer_id: opp.customer_id,
        space_id: s.space_id as string,
        start_date: startDate,
        end_date: endDate,
        checkin: checkinDate || null,
        checkout: checkoutDate || null,
        opportunity_id: opp.id,
        status: 'confirmed',
        total_estimated: Number(s.unit_price) * nights,
      });

      if (!error) created++;
    }

    return `Reservas creadas: ${created}`;
  };

  const executeOnboarding = async (opp: OpportunityData): Promise<string> => {
    const orgId = getOrganizationId();

    // Buscar pipeline de onboarding
    const { data: onboardingPipeline } = await supabase
      .from('pipelines')
      .select('id')
      .eq('organization_id', orgId)
      .eq('pipeline_type', 'onboarding')
      .limit(1)
      .maybeSingle();

    if (!onboardingPipeline) {
      return 'Sin pipeline de onboarding — se omitió oportunidad hija';
    }

    const pipelineId = (onboardingPipeline as { id: string }).id;

    // Obtener primera etapa del pipeline de onboarding
    const { data: firstStage } = await supabase
      .from('stages')
      .select('id')
      .eq('pipeline_id', pipelineId)
      .order('position', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!firstStage) {
      return 'Sin etapas en pipeline de onboarding — se omitió';
    }

    const stageId = (firstStage as { id: string }).id;

    const { data: childOpp, error } = await supabase
      .from('opportunities')
      .insert({
        organization_id: orgId,
        pipeline_id: pipelineId,
        stage_id: stageId,
        customer_id: opp.customer_id,
        name: `Onboarding - ${opp.name}`,
        amount: 0,
        currency: opp.currency,
        status: 'open',
        source: 'won_close',
        parent_opportunity_id: opp.id,
        created_by: opp.created_by,
        salesperson_id: opp.salesperson_id,
        next_contact_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      })
      .select('id')
      .single();

    if (error) throw error;
    return `Onboarding creado: ${(childOpp as { id: string }).id.substring(0, 8)}...`;
  };

  const executeRenewal = async (opp: OpportunityData): Promise<string> => {
    if (!opp.billing_cycle_months || opp.billing_cycle_months <= 0) {
      return 'Sin billing_cycle_months — se omitió renovación';
    }

    const orgId = getOrganizationId();
    const renewalDate = new Date();
    renewalDate.setMonth(renewalDate.getMonth() + opp.billing_cycle_months);
    const renewalIso = renewalDate.toISOString();

    // Crear hitos de renovación como tareas
    let created = 0;
    for (const daysBefore of RENEWAL_MILESTONES) {
      const milestoneDate = new Date(renewalDate);
      milestoneDate.setDate(milestoneDate.getDate() - daysBefore);

      const { error } = await supabase.from('tasks').insert({
        organization_id: orgId,
        title: `Renovación ${opp.name} — hito ${daysBefore}d`,
        description: `Recordatorio de renovación a ${daysBefore} días del vencimiento (${renewalDate.toLocaleDateString('es-ES')}). Contactar al cliente para confirmar renovación.`,
        due_date: milestoneDate.toISOString(),
        assigned_to: opp.salesperson_id || opp.created_by,
        priority: daysBefore <= 30 ? 'high' : 'med',
        status: 'open',
        related_to_id: opp.id,
        related_to_type: 'opportunity',
        customer_id: opp.customer_id,
        created_by: opp.created_by,
      });

      if (!error) created++;
    }

    // Guardar fecha de renovación en metadata
    await supabase
      .from('opportunities')
      .update({
        metadata: {
          ...(opp.metadata || {}),
          renewal_date: renewalIso,
          billing_cycle_months: opp.billing_cycle_months,
        },
      })
      .eq('id', opp.id);

    return `Hitos creados: ${created} (renovación: ${renewalDate.toLocaleDateString('es-ES')})`;
  };

  const executeReferral = async (opp: OpportunityData): Promise<string> => {
    const orgId = getOrganizationId();
    const referralDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    // Crear tarea de referido (activada post-30-días)
    const { error: taskError } = await supabase.from('tasks').insert({
      organization_id: orgId,
      title: `Pedir referido — ${opp.name}`,
      description: `Plantilla: "Hola, nos alegra que hayas elegido nuestros servicios. ¿Conoces a alguien que pueda beneficiarse de lo que ofrecemos? Por cada referido exitoso, te otorgamos un beneficio especial."`,
      due_date: referralDate.toISOString(),
      assigned_to: opp.salesperson_id || opp.created_by,
      priority: 'med',
      status: 'open',
      related_to_id: opp.id,
      related_to_type: 'opportunity',
      customer_id: opp.customer_id,
      created_by: opp.created_by,
    });

    if (taskError) throw taskError;
    return `Tarea de referido programada para ${referralDate.toLocaleDateString('es-ES')}`;
  };

  const executeCommission = async (opp: OpportunityData): Promise<string> => {
    if (!opp.salesperson_id) {
      return 'Sin vendedor — se omitió comisión';
    }

    const result = await commissionService.accrueCommission(
      opp.id,
      opp.salesperson_id,
      Number(opp.amount) || 0
    );

    if (!result) {
      return 'Comisión no devengada (tasa = 0)';
    }

    return `Comisión devengada: ${result.commission_amount} (tasa ${result.commission_rate}%)`;
  };

  // ============== Orchestrator ==============

  const runSteps = async () => {
    if (!opportunity) return;
    setRunning(true);

    const opp = opportunity;
    const executors: Record<string, (opp: OpportunityData) => Promise<string>> = {
      invoice: executeInvoice,
      pos_sale: executePosSale,
      stock: executeStock,
      reservations: executeReservations,
      onboarding: executeOnboarding,
      renewal: executeRenewal,
      referral: executeReferral,
      commission: executeCommission,
    };

    for (const step of steps) {
      if (!step.autoExecute) {
        updateStep(step.id, { status: 'skipped', result: 'Omitido por el usuario' });
        continue;
      }

      updateStep(step.id, { status: 'running' });

      try {
        const executor = executors[step.id];
        if (!executor) {
          updateStep(step.id, { status: 'error', result: 'Ejecutor no encontrado' });
          continue;
        }
        const result = await executor(opp);
        updateStep(step.id, { status: 'done', result });
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : 'Error desconocido';
        updateStep(step.id, {
          status: 'error',
          result: errorMsg,
        });
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

  const statusIcon = (status: StepStatus) => {
    switch (status) {
      case 'done':
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case 'error':
        return <XCircle className="h-5 w-5 text-red-500" />;
      case 'running':
        return <Loader2 className="h-5 w-5 animate-spin text-blue-500" />;
      case 'skipped':
        return <AlertCircle className="h-5 w-5 text-gray-400" />;
      default:
        return <div className="h-5 w-5 rounded-full border-2 border-gray-300" />;
    }
  };

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
