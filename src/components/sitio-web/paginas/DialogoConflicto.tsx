'use client';

/**
 * Conflicto de versión del borrador (409): otra persona o pestaña guardó antes. No se pisa su
 * trabajo: se ofrece recargar. Lo usan Páginas y Menú y navegación.
 */
import { RefreshCw } from 'lucide-react';
import { ConfirmDialog } from '@/components/kit';
import { useTextosPaginas } from './textos';

export interface DialogoConflictoProps {
  abierto: boolean;
  onCerrar: () => void;
  onRecargar: () => void | Promise<void>;
}

export function DialogoConflicto({ abierto, onCerrar, onRecargar }: DialogoConflictoProps) {
  const t = useTextosPaginas();
  return (
    <ConfirmDialog
      abierto={abierto}
      onAbiertoChange={(v) => !v && onCerrar()}
      titulo={t('conflicto.titulo')}
      descripcion={t('conflicto.descripcion')}
      textoConfirmar={t('conflicto.recargar')}
      tono="advertencia"
      icono={RefreshCw}
      onConfirmar={onRecargar}
    />
  );
}
