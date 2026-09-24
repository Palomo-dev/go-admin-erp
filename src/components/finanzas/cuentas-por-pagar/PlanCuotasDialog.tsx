'use client';

/**
 * Plan de cuotas de una cuenta por pagar (plan F9) sobre la pieza del kit
 * (`kit/documento/PlanCuotasDialog`, compartida con CxC). Aquí queda lo del
 * dominio: el reparto sale de `planCuotas` (centavos, última cuota absorbe la
 * diferencia, meses calendario recortados al fin de mes) y la base lo vuelve a
 * validar (`fn_cxp_crear_plan_cuotas`: suma = saldo, sin abonos previos).
 */
import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { PlanCuotasDialog as PlanCuotasKit, type CuotaVista, type ParametrosPlan } from '@/components/kit';
import { toastSuccess } from '@/components/ui/use-toast';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import type { ContextoMoneda } from '@/lib/utils/moneda';
import { planCuotas } from '@/lib/services/compras/logica';
import { clienteCompras, ErrorPeticionCompra } from '@/lib/services/compras/clienteCompras';

export interface PlanCuotasDialogProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  cuentaId: string;
  saldo: number;
  moneda: ContextoMoneda;
  hoy: string;
  onCreado: () => void;
}

export function PlanCuotasDialog({ abierto, onAbiertoChange, cuentaId, saldo, moneda, hoy, onCreado }: PlanCuotasDialogProps) {
  const t = useTranslations('cuentasPorPagar.plan');
  const te = useTranslations('cuentasPorPagar.errores');
  const { formatPlain } = useFormatDate();
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (abierto) setError(null);
  }, [abierto]);

  const calcular = useCallback((p: ParametrosPlan) => planCuotas(saldo, p.numero, p.primera, p.interes), [saldo]);

  const crear = async (plan: readonly CuotaVista[]) => {
    setEnviando(true);
    setError(null);
    try {
      await clienteCompras.crearPlanCuotas(
        cuentaId,
        plan.map((c) => ({ vence: c.vence, capital: c.capital, interes: c.interes ?? 0, valor: c.valor })),
      );
      toastSuccess(t('creado', { n: plan.length }));
      onAbiertoChange(false);
      onCreado();
    } catch (e) {
      const codigo = e instanceof ErrorPeticionCompra ? e.codigo : 'error_desconocido';
      setError(te.has(codigo) ? te(codigo as never) : te('error_desconocido'));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <PlanCuotasKit
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      saldo={saldo}
      moneda={moneda}
      hoy={hoy}
      formatearDia={formatPlain}
      calcular={calcular}
      onConfirmar={(plan) => crear(plan)}
      cargando={enviando}
      error={error}
      conInteres
    />
  );
}
