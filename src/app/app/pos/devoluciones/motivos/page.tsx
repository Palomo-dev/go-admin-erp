'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { PageHeaderSkeleton, CardListSkeleton } from '@/components/common/PageSkeletons';
import { 
  ReturnReasonsList, 
  ReturnReasonForm, 
  ReturnReasonsHeader,
  ReturnReasonsService 
} from '@/components/pos/devoluciones/motivos';
import { claveErrorMotivo } from '@/components/pos/devoluciones/motivos/returnReasonsService';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { ReturnReason, ReturnReasonFilters, CreateReturnReasonData } from '@/components/pos/devoluciones/types';
import { toast } from 'sonner';

export default function MotivosDevolucionPage() {
  const { organization, isLoading: orgLoading } = useOrganization();
  const [reasons, setReasons] = useState<ReturnReason[]>([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<ReturnReasonFilters>({});
  const [showForm, setShowForm] = useState(false);
  const [editingReason, setEditingReason] = useState<ReturnReason | null>(null);
  const t = useTranslations('posDevoluciones.motivos.pagina');
  const tErrores = useTranslations('posDevoluciones.motivos.errores');
  const { getToday } = useFormatDate();

  const loadReasons = useCallback(async () => {
    if (!organization?.id) return;
    
    setLoading(true);
    try {
      const data = await ReturnReasonsService.getAll(filters);
      setReasons(data);
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

  const handleFiltersChange = (newFilters: ReturnReasonFilters) => {
    setFilters(newFilters);
  };

  const handleNewClick = () => {
    setEditingReason(null);
    setShowForm(true);
  };

  const handleEdit = (reason: ReturnReason) => {
    setEditingReason(reason);
    setShowForm(true);
  };

  const handleFormSuccess = () => {
    loadReasons();
  };

  const handleExport = () => {
    try {
      if (reasons.length === 0) {
        toast.error(t('sinDatosExportar'));
        return;
      }

      // El importador lee por posición e ignora la fila de encabezados, así que
      // estos se traducen. Los valores «Sí»/«No» NO: el importador los interpreta.
      const csvData = reasons.map(reason => ({
        [t('csv.codigo')]: reason.code,
        [t('csv.nombre')]: reason.name,
        [t('csv.descripcion')]: reason.description || '',
        [t('csv.requiereFoto')]: reason.requires_photo ? 'Sí' : 'No',
        [t('csv.afectaInventario')]: reason.affects_inventory ? 'Sí' : 'No',
        [t('csv.activo')]: reason.is_active ? 'Sí' : 'No',
        [t('csv.orden')]: reason.display_order
      }));

      const csvContent = [
        Object.keys(csvData[0]).join(','),
        ...csvData.map(row => Object.values(row).map(v => `"${v}"`).join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.setAttribute('href', url);
      a.setAttribute('download', `motivos-devolucion-${getToday()}.csv`);
      a.click();
      window.URL.revokeObjectURL(url);
      
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
        let data: CreateReturnReasonData[] = [];

        if (file.name.endsWith('.json')) {
          data = JSON.parse(text);
        } else if (file.name.endsWith('.csv')) {
          const lines = text.split('\n');
          // La fila 0 son los encabezados: se lee por posición desde la fila 1.
          for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
            if (values.length >= 2) {
              data.push({
                code: values[0] || `CODE_${i}`,
                name: values[1] || `Motivo ${i}`,
                description: values[2] || undefined,
                requires_photo: values[3]?.toLowerCase() === 'sí' || values[3]?.toLowerCase() === 'si',
                affects_inventory: values[4]?.toLowerCase() !== 'no',
                is_active: values[5]?.toLowerCase() !== 'no',
                display_order: parseInt(values[6]) || 0
              });
            }
          }
        }

        if (data.length === 0) {
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
              .join(', ')
          });
        }
      } catch (error) {
        console.error('Import error:', error);
        toast.error(t('errorArchivo'));
      }
    };
    input.click();
  };

  const activeReasons = reasons.filter(r => r.is_active).length;

  if (orgLoading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
        <PageHeaderSkeleton />
        <CardListSkeleton cards={5} columns="1" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <ReturnReasonsHeader
          filters={filters}
          onFiltersChange={handleFiltersChange}
          onNewClick={handleNewClick}
          onImportClick={handleImport}
          onExportClick={handleExport}
          onRefresh={loadReasons}
          totalReasons={reasons.length}
          activeReasons={activeReasons}
          loading={loading}
        />

        <ReturnReasonsList
          reasons={reasons}
          loading={loading}
          onEdit={handleEdit}
          onRefresh={loadReasons}
        />

        <ReturnReasonForm
          open={showForm}
          onOpenChange={setShowForm}
          reason={editingReason}
          onSuccess={handleFormSuccess}
        />
      </div>
    </div>
  );
}
