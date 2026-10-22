'use client';

import { FormularioMovimientoTesoreria } from '@/components/finanzas/movimientos/FormularioMovimientoTesoreria';

interface NuevoIngresoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function NuevoIngresoDialog(props: NuevoIngresoDialogProps) {
  return <FormularioMovimientoTesoreria tipo="ingreso" {...props} />;
}
