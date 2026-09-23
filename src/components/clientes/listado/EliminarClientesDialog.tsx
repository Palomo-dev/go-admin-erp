'use client';

import { useEffect, useState } from 'react';
import { Loader2, Power, Trash2, TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useFormatoEntero, useKitT } from '@/components/kit/useIdiomaKit';
import { useMensajeErrorClientes } from '@/components/clientes/listado/useOperacionesClientes';
import {
  cambiarEstadoClientes,
  eliminarClientes,
  type ClasificacionEliminar,
} from '@/lib/services/clientesListadoService';

/**
 * «Eliminar» de clientes (decisión 5 del dueño, CLIENTE-PAGO-ESTADO-CUENTA-UNIFICAR.md):
 * solo se borra un cliente SIN ninguna relación (prospecto creado por error).
 * Al abrir, el servidor clasifica la selección; el resto se ofrece marcarlo
 * inactivo, que conserva su historia y su cartera. Nada se borra en cascada.
 */
export interface EliminarClientesDialogProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  organizationId: number | null;
  ids: readonly string[];
  /** Nombre, cuando es uno solo (título «¿Eliminar a …?»). */
  nombre?: string;
  /** Tras eliminar o inactivar: recargar y limpiar la selección. */
  onHecho: (resultado: { eliminados: number; inactivados: number }) => void;
}

export function EliminarClientesDialog({
  abierto,
  onAbiertoChange,
  organizationId,
  ids,
  nombre,
  onHecho,
}: EliminarClientesDialogProps) {
  const t = useTranslations('clientes.listado');
  const tk = useKitT();
  const entero = useFormatoEntero();
  const mensajeError = useMensajeErrorClientes();
  const [clasificacion, setClasificacion] = useState<ClasificacionEliminar | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState<'clasificando' | 'eliminando' | 'inactivando' | null>(null);

  useEffect(() => {
    if (!abierto || !organizationId || ids.length === 0) return;
    let cancelado = false;
    setClasificacion(null);
    setError(null);
    setTrabajando('clasificando');
    eliminarClientes(organizationId, [...ids], false)
      .then((r) => {
        if (!cancelado) setClasificacion(r);
      })
      .catch((err) => {
        if (!cancelado) setError(mensajeError(err, t('eliminar.errorRevisar')));
      })
      .finally(() => {
        if (!cancelado) setTrabajando(null);
      });
    return () => {
      cancelado = true;
    };
  }, [abierto, organizationId, ids, t, mensajeError]);

  const eliminables = clasificacion?.eliminables.length ?? 0;
  const bloqueados = clasificacion?.bloqueados ?? [];
  const uno = ids.length === 1;

  const eliminar = async () => {
    if (!organizationId || eliminables === 0) return;
    setTrabajando('eliminando');
    try {
      const r = await eliminarClientes(organizationId, clasificacion?.eliminables ?? [], true);
      toast.success(t('eliminar.eliminados', { count: r.eliminados, n: entero(r.eliminados) }));
      onHecho({ eliminados: r.eliminados, inactivados: 0 });
      onAbiertoChange(false);
    } catch (err) {
      setError(mensajeError(err, t('eliminar.errorEliminar')));
    } finally {
      setTrabajando(null);
    }
  };

  const inactivarBloqueados = async () => {
    if (!organizationId || bloqueados.length === 0) return;
    setTrabajando('inactivando');
    try {
      const n = await cambiarEstadoClientes(
        organizationId,
        bloqueados.map((b) => b.id),
        'inactive',
      );
      toast.success(t('eliminar.inactivados', { count: n, n: entero(n) }));
      onHecho({ eliminados: 0, inactivados: n });
      onAbiertoChange(false);
    } catch (err) {
      setError(mensajeError(err, t('eliminar.errorInactivar')));
    } finally {
      setTrabajando(null);
    }
  };

  const titulo = uno
    ? t('eliminar.tituloUno', { nombre: nombre ?? t('eliminar.esteCliente') })
    : t('eliminar.tituloVarios', { count: ids.length, n: entero(ids.length) });

  /** Tablas que impiden borrar, en palabras del usuario y sin repetir. */
  const relaciones = (tablas: readonly string[]) =>
    Array.from(
      new Set(tablas.map((tabla) => (t.has(`eliminar.relaciones.${tabla}`) ? t(`eliminar.relaciones.${tabla}`) : tabla))),
    ).join(', ');

  return (
    <Dialog open={abierto} onOpenChange={(v) => !trabajando && onAbiertoChange(v)}>
      <DialogContent className="max-w-[520px] border-line bg-surface text-fg">
        <DialogHeader>
          <DialogTitle className="text-fg">{titulo}</DialogTitle>
          <DialogDescription className="text-fg-secondary">
            {t('eliminar.descripcion')}
          </DialogDescription>
        </DialogHeader>

        {trabajando === 'clasificando' && (
          <p className="flex items-center gap-2 text-sm text-fg-secondary" role="status">
            <Loader2 aria-hidden="true" className="size-4 animate-spin" /> {t('eliminar.revisando')}
          </p>
        )}

        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-lg bg-danger-subtle p-3 text-sm text-danger-text">
            <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" /> {error}
          </p>
        )}

        {clasificacion && (
          <div className="flex flex-col gap-3 text-sm">
            {eliminables > 0 && (
              <p className="text-fg">
                {uno
                  ? t('eliminar.seEliminaraUno')
                  : t('eliminar.seEliminaranVarios', { eliminables: entero(eliminables), total: entero(ids.length) })}{' '}
                {t('eliminar.noDeshacer')}
              </p>
            )}
            {bloqueados.length > 0 && (
              <div className="rounded-lg border border-line-warning bg-warning-subtle p-3 text-warning-text">
                <p className="font-medium">
                  {uno
                    ? t('eliminar.bloqueadoUno')
                    : t('eliminar.bloqueadosVarios', { count: bloqueados.length, n: entero(bloqueados.length) })}
                </p>
                <ul className="mt-2 flex max-h-40 flex-col gap-1 overflow-y-auto text-xs">
                  {bloqueados.slice(0, 50).map((b) => (
                    <li key={b.id}>
                      <span className="font-medium">{b.nombre || t('eliminar.sinNombre')}</span>: {relaciones(b.relaciones)}
                    </li>
                  ))}
                  {bloqueados.length > 50 && <li>{t('eliminar.yMas', { n: entero(bloqueados.length - 50) })}</li>}
                </ul>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button variant="outline" onClick={() => onAbiertoChange(false)} disabled={!!trabajando}>
            {tk('comun.cancelar')}
          </Button>
          {bloqueados.length > 0 && (
            <Button variant="outline" onClick={inactivarBloqueados} disabled={!!trabajando}>
              {trabajando === 'inactivando' ? (
                <Loader2 aria-hidden="true" className="mr-2 size-4 animate-spin" />
              ) : (
                <Power aria-hidden="true" className="mr-2 size-4" />
              )}
              {uno ? t('eliminar.marcarInactivo') : t('eliminar.marcarInactivos', { n: entero(bloqueados.length) })}
            </Button>
          )}
          {eliminables > 0 && (
            <Button variant="destructive" onClick={eliminar} disabled={!!trabajando}>
              {trabajando === 'eliminando' ? (
                <Loader2 aria-hidden="true" className="mr-2 size-4 animate-spin" />
              ) : (
                <Trash2 aria-hidden="true" className="mr-2 size-4" />
              )}
              {uno ? t('eliminar.eliminar') : t('eliminar.eliminarN', { n: entero(eliminables) })}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
