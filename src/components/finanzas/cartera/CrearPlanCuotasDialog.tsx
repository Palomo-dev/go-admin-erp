'use client';

/**
 * Crear (o reemplazar) el plan de cuotas de una cuenta por cobrar sobre la
 * pieza del kit (`kit/documento/PlanCuotasDialog`, compartida con CxP). Aquí
 * queda lo del dominio: la propuesta la arma `generarPlanCuotas` (frecuencia
 * mensual, quincenal o semanal, sin interés) y la guarda
 * `POST /api/cartera/[id]/cuotas` (`fn_cxc_crear_plan_cuotas`).
 */
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { PlanCuotasDialog } from '@/components/kit';
import type { ContextoMoneda } from '@/lib/utils/moneda';
import { toastSuccess } from '@/components/ui/use-toast';
import { generarPlanCuotas, type FrecuenciaCuotas } from '@/lib/finanzas/cartera/cuotas';
import { ErrorPeticionCartera, crearPlanCuotasCuenta } from '@/lib/finanzas/cartera/clienteCartera';

export interface CrearPlanCuotasDialogProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  cuentaId: string;
  saldo: number;
  moneda: ContextoMoneda | string;
  decimales: number;
  hoy: string;
  formatearDia: (dia: string) => string;
  onCreado?: () => void;
}

const FRECUENCIAS: readonly FrecuenciaCuotas[] = ['mensual', 'quincenal', 'semanal'];

export function CrearPlanCuotasDialog({ abierto, onAbiertoChange, cuentaId, saldo, moneda, decimales, hoy, formatearDia, onCreado }: CrearPlanCuotasDialogProps) {
  const t = useTranslations('cartera.cuotas');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (abierto) setError(null);
  }, [abierto]);

  return (
    <PlanCuotasDialog
      abierto={abierto}
      onAbiertoChange={(v) => !guardando && onAbiertoChange(v)}
      saldo={saldo}
      moneda={moneda}
      hoy={hoy}
      formatearDia={formatearDia}
      titulo={t('crearTitulo')}
      textoConfirmar={t('crear')}
      frecuencias={FRECUENCIAS.map((f) => ({ valor: f, etiqueta: t(`frecuencias.${f}`) }))}
      frecuenciaInicial="mensual"
      cuotasIniciales={3}
      maxCuotas={120}
      calcular={(p) => generarPlanCuotas(saldo, p.numero, p.primera, (p.frecuencia ?? 'mensual') as FrecuenciaCuotas, decimales)}
      cargando={guardando}
      error={error}
      onConfirmar={async (plan) => {
        setGuardando(true);
        setError(null);
        try {
          await crearPlanCuotasCuenta(cuentaId, plan.map((c) => ({ vence: c.vence, capital: c.capital, valor: c.valor })));
          toastSuccess(t('creado'), t('creadoDescripcion', { count: plan.length }));
          onCreado?.();
          onAbiertoChange(false);
        } catch (e) {
          const k = `errores.${e instanceof ErrorPeticionCartera ? e.codigo : 'error_desconocido'}`;
          setError(t.has(k) ? t(k as never) : t('errores.error_desconocido'));
        } finally {
          setGuardando(false);
        }
      }}
    />
  );
}
