'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { 
  ReturnReasonsList, 
  ReturnReasonForm, 
  ReturnReasonsHeader,
  ReturnReasonsService 
} from '@/components/pos/devoluciones/motivos';
import { ReturnReason, ReturnReasonFilters, CreateReturnReasonData } from '@/components/pos/devoluciones/types';
import { toast } from 'sonner';

export default function MotivosDevolucionPage() {
  const { organization, isLoading: orgLoading } = useOrganization();
  const [reasons, setReasons] = useState<ReturnReason[]>([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<ReturnReasonFilters>({});
  const [showForm, setShowForm] = useState(false);
  const [editingReason, setEditingReason] = useState<ReturnReason | null>(null);

  const loadReasons = useCallback(async () => {
    if (!organization?.id) return;
    
    setLoading(true);
    try {
      const data = await ReturnReasonsService.getAll(filters);
      setReasons(data);
    } catch (error: any) {
      console.error('Error loading reasons:', error);
      toast.error('Error al cargar motivos de devolución');
    } finally {
      setLoading(false);
    }
  }, [organization?.id, filters]);

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
        toast.error('No hay motivos para exportar');
        return;
      }

      const csvData = reasons.map(reason => ({
        'Código': reason.code,
        'Nombre': reason.name,
        'Descripción': reason.description || '',
        'Requiere Foto': reason.requires_photo ? 'Sí' : 'No',
        'Afecta Inventario': reason.affects_inventory ? 'Sí' : 'No',
        'Activo': reason.is_active ? 'Sí' : 'No',
        'Orden': reason.display_order
      }));

      const csvContent = [
        Object.keys(csvData[0]).join(','),
        ...csvData.map(row => Object.values(row).map(v => `"${v}"`).join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.setAttribute('href', url);
      a.setAttribute('download', `motivos-devolucion-${new Date().toISOString().split('T')[0]}.csv`);
      a.click();
      window.URL.revokeObjectURL(url);
      
      toast.success('Exportación completada');
    } catch (error) {
      toast.error('Error al exportar datos');
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
          const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
          
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
          toast.error('No se encontraron datos válidos en el archivo');
          return;
        }

        const result = await ReturnReasonsService.importFromData(data);
        
        if (result.success > 0) {
          toast.success(`Se importaron ${result.success} motivos correctamente`);
          loadReasons();
        }
        
        if (result.errors.length > 0) {
          toast.warning(`${result.errors.length} registros no se pudieron importar`, {
            description: result.errors.slice(0, 3).join(', ')
          });
        }
      } catch (error: any) {
        console.error('Import error:', error);
        toast.error('Error al procesar el archivo');
      }
    };
    input.click();
  };

  const activeReasons = reasons.filter(r => r.is_active).length;

  if (orgLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 lg:p-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center py-12">
            <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-600" />
            <p className="text-gray-600 dark:text-gray-400">Cargando...</p>
          </div>
        </div>
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
