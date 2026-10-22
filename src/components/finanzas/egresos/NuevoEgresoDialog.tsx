'use client';

import { FormularioMovimientoTesoreria } from '@/components/finanzas/movimientos/FormularioMovimientoTesoreria';

interface NuevoEgresoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function NuevoEgresoDialog(props: NuevoEgresoDialogProps) {
  return <FormularioMovimientoTesoreria tipo="egreso" {...props} />;
}
