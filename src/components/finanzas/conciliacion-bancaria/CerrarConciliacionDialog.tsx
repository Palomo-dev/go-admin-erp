'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Lock } from 'lucide-react';
import { AvisoTonal, CampoNumero, ConfirmDialog, Dialogo, DialogoMotivo, FormField } from '@/components/kit';
import type { PlanCierre } from '@/lib/finanzas/conciliacion/diferencia';

interface CerrarConciliacionDialogProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  /** «Cuenta corriente principal · 1 nov 2026 - 30 nov 2026». */
  contexto: string;
  plan: PlanCierre;
  formatear: (valor: number) => string;
  cargando: boolean;
  error: string | null;
  onConfirmar: (motivo: string | null) => void | Promise<void>;
}

/**
 * Cerrar una conciliación (Figma «Diálogo / Cerrar conciliación»). Con diferencia
 * el motivo es obligatorio y la diferencia pasa como partida pendiente; nunca se
 * ajusta contra resultados. El servidor valida lo mismo en `fn_conciliacion_cerrar`.
 */
export function CerrarConciliacionDialog({
  abierto,
  onAbiertoChange,
  contexto,
  plan,
  formatear,
  cargando,
  error,
  onConfirmar,
}: CerrarConciliacionDialogProps) {
  const t = useTranslations('conciliacionCierre');

  if (!plan.exigeMotivo) {
    return (
      <ConfirmDialog
        abierto={abierto}
        onAbiertoChange={onAbiertoChange}
        titulo={t('cerrar.titulo')}
        descripcion={t('cerrar.sinDiferencia')}
        textoConfirmar={t('cerrar.confirmar')}
        tono="marca"
        icono={Lock}
        cargando={cargando}
        onConfirmar={() => onConfirmar(null)}
      >
        {error && (
          <p role="alert" className="text-sm text-danger-text">
            {error}
          </p>
        )}
      </ConfirmDialog>
    );
  }

  return (
    <DialogoMotivo
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={t('cerrar.titulo')}
      descripcion={contexto}
      textoConfirmar={plan.creaPartida ? t('cerrar.conPartida') : t('cerrar.confirmar')}
      etiquetaMotivo={t('cerrar.motivo')}
      placeholder={t('cerrar.motivoEjemplo')}
      destructiva={false}
      icono={Lock}
      cargando={cargando}
      error={error}
      onConfirmar={(motivo) => onConfirmar(motivo)}
    >
      <AvisoTonal
        tono="advertencia"
        titulo={
          plan.creaPartida
            ? t('cerrar.quedaPendiente', { valor: formatear(Math.abs(plan.partidaNueva)) })
            : t('cerrar.yaExplicada', { valor: formatear(Math.abs(plan.diferencia)) })
        }
        descripcion={plan.creaPartida ? t('cerrar.quedaPendienteDetalle') : t('cerrar.yaExplicadaDetalle')}
      />
      <p className="text-xs text-fg-muted">{t('cerrar.registro')}</p>
    </DialogoMotivo>
  );
}

interface SaldoExtractoDialogProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  cargando: boolean;
  onGuardar: (saldo: number) => void | Promise<void>;
}

/** Sin saldo del extracto la diferencia se desconoce: se pide antes de cerrar. */
export function SaldoExtractoDialog({ abierto, onAbiertoChange, cargando, onGuardar }: SaldoExtractoDialogProps) {
  const t = useTranslations('conciliacionCierre');
  const [saldo, setSaldo] = useState<number | null>(null);

  useEffect(() => {
    if (abierto) setSaldo(null);
  }, [abierto]);

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={t('saldoExtracto.titulo')}
      descripcion={t('saldoExtracto.descripcion')}
      ancho={440}
      primario={{
        etiqueta: t('saldoExtracto.guardar'),
        cargando,
        deshabilitada: saldo === null,
        motivo: saldo === null ? t('saldoExtracto.falta') : undefined,
        onClick: () => {
          if (saldo !== null) void onGuardar(saldo);
        },
      }}
    >
      <FormField etiqueta={t('tarjetas.saldoExtracto')} obligatorio>
        <CampoNumero valor={saldo} onValorChange={setSaldo} />
      </FormField>
    </Dialogo>
  );
}
