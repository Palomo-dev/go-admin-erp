'use client';

/**
 * Motivos de devolución (Figma `874:579636`; diálogo nuevo/editar `874:580752`).
 * Catálogo de `return_reasons` con la columna «Usos» (`pos_motivos_devolucion_usos`):
 * un motivo con devoluciones se desactiva en lugar de borrarse. Importar CSV
 * respeta comillas y «;» (`filasCsvMotivos`, D16 de la spec).
 */
import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { ClipboardList } from 'lucide-react';
import { PageHeader } from '@/components/kit';
import { Skeleton } from '@/components/ui/skeleton';
import { ReturnReasonsList, ReturnReasonForm, ReturnReasonsHeader, ReturnReasonsService } from '@/components/pos/devoluciones/motivos';
import { claveErrorMotivo } from '@/components/pos/devoluciones/motivos/returnReasonsService';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { guardarArchivo } from '@/lib/documents/cliente';
import { filasACsv } from '@/lib/utils/csv';
import { filasCsvMotivos } from '@/lib/pos/devoluciones/motivosCsv';
import { ReturnReason, ReturnReasonFilters, CreateReturnReasonData } from '@/components/pos/devoluciones/types';
import { toast } from 'sonner';

export default function MotivosDevolucionPage() {
  const { organization, isLoading: orgLoading } = useOrganization();
  const [reasons, setReasons] = useState<ReturnReason[]>([]);
  const [usos, setUsos] = useState<Record<number, number> | null>(null);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<ReturnReasonFilters>({});
  const [showForm, setShowForm] = useState(false);
  const [editingReason, setEditingReason] = useState<ReturnReason | null>(null);
  const t = useTranslations('posDevoluciones.motivos.pagina');
  const tErrores = useTranslations('posDevoluciones.motivos.errores');
  const tEncabezado = useTranslations('posDevoluciones.motivos.encabezado');
  const { getToday } = useFormatDate();

  const loadReasons = useCallback(async () => {
    if (!organization?.id) return;

    setLoading(true);
    try {
      const [data, conteo] = await Promise.all([ReturnReasonsService.getAll(filters), ReturnReasonsService.getUsos().catch(() => null)]);
      setReasons(data);
      setUsos(conteo);
    } catch (error) {
      console.error('Error loading reasons:', error);
      toast.error(t('errorCarga'));
    } finally {
      setLoading(false);
    }
  }, [organization?.id, filters, t]);

  useEffect(() => {
    loadReasons();
  }, [loadReasons]);

  const handleNewClick = () => {
    setEditingReason(null);
    setShowForm(true);
  };

  const handleEdit = (reason: ReturnReason) => {
    setEditingReason(reason);
    setShowForm(true);
  };

  const handleExport = () => {
    try {
      if (reasons.length === 0) {
        toast.error(t('sinDatosExportar'));
        return;
      }
      // El importador lee por posición e ignora la fila de encabezados, así que
      // estos se traducen. Los valores «Sí»/«No» NO: el importador los interpreta.
      const csv = filasACsv(
        [t('csv.codigo'), t('csv.nombre'), t('csv.descripcion'), t('csv.requiereFoto'), t('csv.afectaInventario'), t('csv.activo'), t('csv.orden')],
        reasons.map((r) => [
          r.code,
          r.name,
          r.description || '',
          r.requires_photo ? 'Sí' : 'No',
          r.affects_inventory ? 'Sí' : 'No',
          r.is_active ? 'Sí' : 'No',
          r.display_order,
        ]),
      );
      guardarArchivo(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `motivos-devolucion-${getToday()}.csv`);
      toast.success(t('exportado'));
    } catch {
      toast.error(t('errorExportar'));
    }
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const data: CreateReturnReasonData[] = file.name.endsWith('.json') ? JSON.parse(text) : filasCsvMotivos(text);

        if (!Array.isArray(data) || data.length === 0) {
          toast.error(t('sinDatosArchivo'));
          return;
        }

        const result = await ReturnReasonsService.importFromData(data);

        if (result.success > 0) {
          toast.success(t('importados', { n: result.success }));
          loadReasons();
        }

        if (result.errors.length > 0) {
          toast.warning(t('noImportados', { n: result.errors.length }), {
            description: result.errors
              .slice(0, 3)
              .map(({ code, error }) => {
                const { clave, valores } = claveErrorMotivo(error, 'importar');
                return `${code}: ${tErrores(clave, valores)}`;
              })
              .join(', '),
          });
        }
      } catch (error) {
        console.error('Import error:', error);
        toast.error(t('errorArchivo'));
      }
    };
    input.click();
  };

  const activeReasons = reasons.filter((r) => r.is_active).length;
  const hayFiltros = !!filters.search || filters.is_active !== undefined;

  if (orgLoading) {
    return (
      <div className="flex flex-col gap-4 p-4 sm:p-6" aria-busy="true">
        <PageHeader titulo={tEncabezado('titulo')} icono={ClipboardList} cargando />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 lg:gap-5">
      <ReturnReasonsHeader
        filters={filters}
        onFiltersChange={setFilters}
        onNewClick={handleNewClick}
        onImportClick={handleImport}
        onExportClick={handleExport}
        onRefresh={loadReasons}
        totalReasons={reasons.length}
        activeReasons={activeReasons}
        loading={loading}
      />

      <ReturnReasonsList reasons={reasons} loading={loading} usos={usos} hayFiltros={hayFiltros} onEdit={handleEdit} onRefresh={loadReasons} />

      <ReturnReasonForm open={showForm} onOpenChange={setShowForm} reason={editingReason} onSuccess={loadReasons} />
    </div>
  );
}
