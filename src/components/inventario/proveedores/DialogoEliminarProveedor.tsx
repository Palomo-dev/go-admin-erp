'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/components/ui/use-toast';
import { useFormatoEntero } from '@/components/kit/useIdiomaKit';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { supplierService, type ProveedorResumen } from '@/lib/services/supplierService';

export interface ProveedorAEliminar {
  id: number;
  uuid: string;
  name: string;
  is_active: boolean;
}

interface Props {
  proveedor: ProveedorAEliminar | null;
  onCerrar: () => void;
  /** Tras borrar. */
  onEliminado: (p: ProveedorAEliminar) => void;
  /** Tras desactivar en lugar de borrar. */
  onDesactivado: (p: ProveedorAEliminar) => void;
}

/**
 * Confirmación de borrado con contexto (auditoría §A.4 y §G.3.19): nombra al
 * proveedor y dice qué se lleva por delante. `purchase_orders` e
 * `invoice_purchase` borran en cascada; `accounts_payable` impide el borrado.
 * Si tiene documentos, la acción recomendada es desactivarlo.
 */
export function DialogoEliminarProveedor({ proveedor, onCerrar, onEliminado, onDesactivado }: Props) {
  const { toast } = useToast();
  const t = useTranslations('proveedores.eliminar');
  const entero = useFormatoEntero();
  const [resumen, setResumen] = useState<ProveedorResumen | null>(null);
  const [cargando, setCargando] = useState(false);
  const [trabajando, setTrabajando] = useState<'eliminar' | 'desactivar' | null>(null);

  useEffect(() => {
    if (!proveedor) return;
    let cancelado = false;
    setResumen(null);
    setCargando(true);
    supplierService
      .obtenerResumenProveedor(getOrganizationId(), proveedor.id)
      .then((r) => {
        if (!cancelado) setResumen(r);
      })
      .catch(() => {
        if (!cancelado) setResumen(null);
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [proveedor]);

  const conCartera = (resumen?.cuentas_por_pagar ?? 0) > 0;
  const conDocumentos = conCartera || (resumen?.ordenes ?? 0) > 0 || (resumen?.facturas ?? 0) > 0;

  const eliminar = async () => {
    if (!proveedor) return;
    setTrabajando('eliminar');
    const { error } = await supplierService.deleteSupplier(proveedor.uuid, getOrganizationId());
    setTrabajando(null);
    if (error) {
      toast({
        variant: 'destructive',
        title: t('toast.errorEliminar'),
        description: conCartera ? t('toast.errorEliminarCartera') : t('toast.errorEliminarReintentar'),
      });
      return;
    }
    toast({ title: t('toast.eliminado'), description: proveedor.name });
    onEliminado(proveedor);
  };

  const desactivar = async () => {
    if (!proveedor) return;
    setTrabajando('desactivar');
    const { error } = await supplierService.setSuppliersActive(getOrganizationId(), [proveedor.id], false);
    setTrabajando(null);
    if (error) {
      toast({ variant: 'destructive', title: t('toast.errorDesactivar') });
      return;
    }
    toast({ title: t('toast.desactivado'), description: t('toast.desactivadoDescripcion') });
    onDesactivado(proveedor);
  };

  // «2 órdenes de compra y 1 factura de compra»: cada pieza es un mensaje ICU.
  const ordenes = resumen && resumen.ordenes > 0 ? t('documentos.ordenes', { count: resumen.ordenes, n: entero(resumen.ordenes) }) : null;
  const facturas =
    resumen && resumen.facturas > 0 ? t('documentos.facturas', { count: resumen.facturas, n: entero(resumen.facturas) }) : null;
  const documentos = ordenes && facturas ? t('documentos.ambos', { ordenes, facturas }) : (ordenes ?? facturas);
  const cuentasPorPagar = resumen?.cuentas_por_pagar ?? 0;

  return (
    <AlertDialog open={!!proveedor} onOpenChange={(v) => !v && !trabajando && onCerrar()}>
      <AlertDialogContent className="border-line bg-surface">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-fg">{t('titulo', { nombre: proveedor?.name ?? '' })}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="flex flex-col gap-2 text-sm text-fg-secondary">
              {cargando ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 aria-hidden="true" className="size-4 animate-spin" /> {t('revisando')}
                </span>
              ) : conCartera ? (
                <p>{t('conCartera', { count: cuentasPorPagar, n: entero(cuentasPorPagar) })}</p>
              ) : documentos ? (
                <p>{t('conDocumentos', { documentos })}</p>
              ) : (
                <p>{t('irreversible')}</p>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel disabled={!!trabajando} className="border-line-strong bg-surface text-fg hover:bg-hover">
            {t('cancelar')}
          </AlertDialogCancel>
          {conDocumentos && proveedor?.is_active && (
            <button
              type="button"
              onClick={desactivar}
              disabled={!!trabajando}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-line-strong bg-surface px-4 text-sm font-medium text-fg hover:bg-hover disabled:opacity-50"
            >
              {trabajando === 'desactivar' && <Loader2 aria-hidden="true" className="size-4 animate-spin" />}
              {t('desactivar')}
            </button>
          )}
          {!conCartera && (
            <button
              type="button"
              onClick={eliminar}
              disabled={!!trabajando || cargando}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-danger px-4 text-sm font-medium text-fg-on-brand hover:bg-danger-hover disabled:opacity-50"
            >
              {trabajando === 'eliminar' && <Loader2 aria-hidden="true" className="size-4 animate-spin" />}
              {t('eliminar')}
            </button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
