'use client';

/**
 * Tabla de motivos de devolución (Figma `874:579636`) con el kit: `DataTable`,
 * menú de fila y `ConfirmDialog` para borrar. Columnas del Figma: orden,
 * código, nombre, afecta inventario, requiere foto, usos (devoluciones con ese
 * `reason_id`, `pos_motivos_devolucion_usos`) y estado. Un motivo con usos no
 * se borra: se desactiva (spec §6.2).
 */
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Copy, Edit, Power, PowerOff, Tag, Trash2 } from 'lucide-react';
import { DataTable, ListCard, StatusBadge, type AccionFila, type ColumnaTabla } from '@/components/kit';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ReturnReason } from '../types';
import { ReturnReasonsService, claveErrorMotivo } from './returnReasonsService';
import { toast } from 'sonner';

interface ReturnReasonsListProps {
  reasons: ReturnReason[];
  loading: boolean;
  /** Devoluciones por motivo (id → n). `null` mientras se cuentan. */
  usos: Record<number, number> | null;
  /** `vacio` sin filtros; `sinResultados` con búsqueda o estado. */
  hayFiltros?: boolean;
  onEdit: (reason: ReturnReason) => void;
  onRefresh: () => void;
}

export function ReturnReasonsList({ reasons, loading, usos, hayFiltros, onEdit, onRefresh }: ReturnReasonsListProps) {
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const t = useTranslations('posDevoluciones.motivos.lista');
  const tEncabezado = useTranslations('posDevoluciones.motivos.encabezado');
  const tErrores = useTranslations('posDevoluciones.motivos.errores');
  const tComun = useTranslations('posDevoluciones.comun');
  const tTabla = useTranslations('posDevoluciones.motivos.tabla');
  const usosDe = (r: ReturnReason) => usos?.[r.id] ?? 0;

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

  const acciones = (reason: ReturnReason): AccionFila[] => {
    const enUso = usosDe(reason) > 0;
    return [
      { id: 'editar', etiqueta: t('editar'), icono: Edit, onSelect: () => onEdit(reason) },
      { id: 'duplicar', etiqueta: t('duplicar'), icono: Copy, onSelect: () => void handleDuplicate(reason) },
      {
        id: 'estado',
        etiqueta: reason.is_active ? tTabla('desactivar') : tTabla('activar'),
        icono: reason.is_active ? PowerOff : Power,
        deshabilitada: togglingId === reason.id,
        onSelect: () => void handleToggleActive(reason),
      },
      {
        id: 'eliminar',
        etiqueta: t('eliminar'),
        icono: Trash2,
        destructiva: true,
        separadorAntes: true,
        deshabilitada: enUso || usos === null,
        motivo: tTabla('enUsoNoBorrar'),
        onSelect: () => setDeleteId(reason.id),
      },
    ];
  };

  const siNo = (valor: boolean, tono: 'informacion' | 'exito') =>
    valor ? (
      <Badge tono={tono} apariencia="suave" tamano="sm">
        {t('si')}
      </Badge>
    ) : (
      <Badge tono="neutro" apariencia="suave" tamano="sm">
        {t('no')}
      </Badge>
    );

  const estado = (r: ReturnReason) => <StatusBadge estado={r.is_active ? 'activo' : 'inactivo'} etiqueta={r.is_active ? tTabla('activo') : tTabla('inactivo')} />;

  const columnas: ColumnaTabla<ReturnReason>[] = [
    { id: 'orden', encabezado: tTabla('orden'), className: 'w-16 tabular-nums', celda: (r) => r.display_order },
    { id: 'codigo', encabezado: t('codigo'), celda: (r) => <span className="font-mono text-fg">{r.code}</span> },
    {
      id: 'nombre',
      encabezado: t('nombre'),
      celda: (r) => (
        <div className="flex min-w-0 flex-col">
          <span className={r.is_active ? 'text-fg' : 'text-fg-muted'}>{r.name}</span>
          {r.description && <span className="max-w-[22rem] truncate text-xs text-fg-secondary">{r.description}</span>}
        </div>
      ),
    },
    { id: 'inventario', encabezado: tTabla('afectaInventario'), ocultarDebajo: 'md', celda: (r) => siNo(r.affects_inventory, 'exito') },
    { id: 'foto', encabezado: tTabla('requiereFoto'), ocultarDebajo: 'md', celda: (r) => siNo(r.requires_photo, 'informacion') },
    { id: 'usos', encabezado: tTabla('usos'), alinear: 'derecha', celda: (r) => (usos === null ? '—' : usosDe(r)) },
    { id: 'estado', encabezado: t('estado'), className: 'whitespace-nowrap', celda: estado },
  ];

  return (
    <>
      <DataTable
        etiqueta={tEncabezado('titulo')}
        columnas={columnas}
        filas={reasons}
        obtenerId={(r) => String(r.id)}
        estado={loading ? 'cargando' : reasons.length === 0 ? (hayFiltros ? 'sinResultados' : 'vacio') : 'listo'}
        etiquetaFila={(r) => r.name}
        acciones={acciones}
        vacio={{ titulo: t('sinRegistros'), descripcion: t('sinRegistrosDescripcion'), icono: Tag }}
        tarjetaMovil={(r) => (
          <ListCard
            icono={Tag}
            titulo={r.name}
            subtitulo={r.description || undefined}
            meta={[r.code, usos ? tTabla('usosN', { n: usosDe(r) }) : null].filter(Boolean).join(' · ')}
            estado={estado(r)}
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
