'use client';

/**
 * Tabla de motivos de devolución (Figma `874:579636`) con el kit: `DataTable`,
 * menú de fila y `ConfirmDialog` para borrar. La regla de «desactivar en vez
 * de borrar si tiene usos» y la columna de usos quedan para cuando exista el
 * conteo por `reason_id` (hallazgo #51); mientras, el `Switch` de la fila se
 * conserva.
 */
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Camera, Copy, Edit, Package, Tag, Trash2 } from 'lucide-react';
import { DataTable, ListCard, type AccionFila, type ColumnaTabla } from '@/components/kit';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Switch } from '@/components/ui/switch';
import { ReturnReason } from '../types';
import { ReturnReasonsService, claveErrorMotivo } from './returnReasonsService';
import { toast } from 'sonner';

interface ReturnReasonsListProps {
  reasons: ReturnReason[];
  loading: boolean;
  onEdit: (reason: ReturnReason) => void;
  onRefresh: () => void;
}

export function ReturnReasonsList({ reasons, loading, onEdit, onRefresh }: ReturnReasonsListProps) {
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const t = useTranslations('posDevoluciones.motivos.lista');
  const tEncabezado = useTranslations('posDevoluciones.motivos.encabezado');
  const tErrores = useTranslations('posDevoluciones.motivos.errores');
  const tComun = useTranslations('posDevoluciones.comun');

  const handleDelete = async () => {
    if (!deleteId) return;

    try {
      await ReturnReasonsService.delete(deleteId);
      toast.success(t('eliminado'));
      onRefresh();
    } catch (error) {
      const { clave, valores } = claveErrorMotivo(error, 'eliminar');
      toast.error(tErrores(clave, valores));
    } finally {
      setDeleteId(null);
    }
  };

  const handleDuplicate = async (reason: ReturnReason) => {
    try {
      await ReturnReasonsService.duplicate(reason.id);
      toast.success(t('duplicado'));
      onRefresh();
    } catch (error) {
      const { clave, valores } = claveErrorMotivo(error, 'duplicar');
      toast.error(tErrores(clave, valores));
    }
  };

  const handleToggleActive = async (reason: ReturnReason) => {
    setTogglingId(reason.id);
    try {
      await ReturnReasonsService.toggleActive(reason.id);
      toast.success(reason.is_active ? t('desactivado') : t('activado'));
      onRefresh();
    } catch (error) {
      const { clave, valores } = claveErrorMotivo(error, 'cambiarEstado');
      toast.error(tErrores(clave, valores));
    } finally {
      setTogglingId(null);
    }
  };

  const acciones = (reason: ReturnReason): AccionFila[] => [
    { id: 'editar', etiqueta: t('editar'), icono: Edit, onSelect: () => onEdit(reason) },
    { id: 'duplicar', etiqueta: t('duplicar'), icono: Copy, onSelect: () => void handleDuplicate(reason) },
    { id: 'eliminar', etiqueta: t('eliminar'), icono: Trash2, destructiva: true, separadorAntes: true, onSelect: () => setDeleteId(reason.id) },
  ];

  const interruptor = (reason: ReturnReason) => (
    <Switch
      checked={reason.is_active}
      onCheckedChange={() => handleToggleActive(reason)}
      disabled={togglingId === reason.id}
      aria-label={`${t('estado')}: ${reason.name}`}
    />
  );

  const siNo = (valor: boolean, tono: 'informacion' | 'exito', icono: typeof Camera) =>
    valor ? (
      <Badge tono={tono} apariencia="suave" tamano="sm" icono={icono}>
        {t('si')}
      </Badge>
    ) : (
      <span className="text-fg-muted">{t('no')}</span>
    );

  const columnas: ColumnaTabla<ReturnReason>[] = [
    {
      id: 'codigo',
      encabezado: t('codigo'),
      celda: (r) => (
        <Badge tono="neutro" apariencia="contorno" tamano="sm" className="font-mono">
          {r.code}
        </Badge>
      ),
    },
    { id: 'nombre', encabezado: t('nombre'), celda: (r) => <span className={r.is_active ? 'font-medium text-fg' : 'font-medium text-fg-muted'}>{r.name}</span> },
    {
      id: 'descripcion',
      encabezado: t('descripcion'),
      ocultarDebajo: 'md',
      celda: (r) => <span className="whitespace-normal break-words text-fg-secondary">{r.description || '—'}</span>,
    },
    { id: 'foto', encabezado: t('foto'), alinear: 'centro', celda: (r) => siNo(r.requires_photo, 'informacion', Camera) },
    { id: 'inventario', encabezado: t('inventario'), alinear: 'centro', celda: (r) => siNo(r.affects_inventory, 'exito', Package) },
    { id: 'estado', encabezado: t('estado'), alinear: 'centro', celda: interruptor },
  ];

  return (
    <>
      <DataTable
        etiqueta={tEncabezado('titulo')}
        columnas={columnas}
        filas={reasons}
        obtenerId={(r) => String(r.id)}
        estado={loading ? 'cargando' : reasons.length === 0 ? 'vacio' : 'listo'}
        etiquetaFila={(r) => r.name}
        acciones={acciones}
        vacio={{ titulo: t('sinRegistros'), descripcion: t('sinRegistrosDescripcion'), icono: Tag }}
        tarjetaMovil={(r) => (
          <ListCard
            icono={Tag}
            titulo={r.name}
            subtitulo={r.description || undefined}
            meta={r.code}
            estado={interruptor(r)}
            acciones={acciones(r)}
          />
        )}
      />

      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(abierto) => !abierto && setDeleteId(null)}
        title={t('confirmarTitulo')}
        description={t('confirmarDescripcion')}
        confirmLabel={t('eliminar')}
        cancelLabel={tComun('cancelar')}
        variant="destructive"
        onConfirm={handleDelete}
      />
    </>
  );
}
