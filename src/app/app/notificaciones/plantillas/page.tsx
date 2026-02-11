'use client';

import { useState, useEffect, useCallback } from 'react';
import { useOrganization, getCurrentUserId } from '@/lib/hooks/useOrganization';
import { useToast } from '@/components/ui/use-toast';
import { Loader2 } from 'lucide-react';
import {
  PlantillasHeader,
  PlantillaFilters,
  PlantillaList,
  PlantillaEditorDialog,
  TestSendDialog,
  ImportDialog,
  PlantillasService,
} from '@/components/notificaciones/plantillas';
import type {
  TemplateFilters,
  NotificationTemplate,
  TemplateFormData,
} from '@/components/notificaciones/plantillas';
import { DEFAULT_TEMPLATE_FILTERS } from '@/components/notificaciones/plantillas/types';

export default function PlantillasPage() {
  const { organization } = useOrganization();
  const organizationId = organization?.id;
  const { toast } = useToast();

  const [userId, setUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
  const [total, setTotal] = useState(0);
  const [channelCounts, setChannelCounts] = useState<Record<string, number>>({});
  const [filters, setFilters] = useState<TemplateFilters>(DEFAULT_TEMPLATE_FILTERS);
  const [page, setPage] = useState(1);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<NotificationTemplate | null>(null);
  const [testOpen, setTestOpen] = useState(false);
  const [testingTemplate, setTestingTemplate] = useState<NotificationTemplate | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => {
    getCurrentUserId().then((id) => setUserId(id));
  }, []);

  useEffect(() => {
    if (!organizationId || !userId) return;

    const checkAdmin = async () => {
      const { supabase } = await import('@/lib/supabase/config');
      const { data } = await supabase
        .from('organization_members')
        .select('is_super_admin, role_id, roles(name)')
        .eq('organization_id', organizationId)
        .eq('user_id', userId)
        .single();

      if (data) {
        setIsAdmin(data.is_super_admin || [1, 2, 5].includes(data.role_id));
      }
    };

    checkAdmin();
  }, [organizationId, userId]);

  const loadData = useCallback(async () => {
    if (!organizationId) return;

    try {
      const [listRes, counts] = await Promise.all([
        PlantillasService.getTemplates(organizationId, filters, page),
        PlantillasService.getChannelCounts(organizationId),
      ]);
      setTemplates(listRes.data);
      setTotal(listRes.total);
      setChannelCounts(counts);
    } catch (error) {
      console.error('Error cargando plantillas:', error);
      toast({ title: 'Error', description: 'No se pudieron cargar las plantillas.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [organizationId, filters, page, toast]);

  useEffect(() => {
    if (organizationId) {
      setIsLoading(true);
      loadData();
    }
  }, [organizationId, loadData]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadData();
    setIsRefreshing(false);
  };

  const handleFiltersChange = (f: TemplateFilters) => {
    setFilters(f);
    setPage(1);
  };

  const handleSave = async (data: TemplateFormData, id?: string): Promise<boolean> => {
    if (!organizationId) return false;

    const ok = id
      ? await PlantillasService.updateTemplate(id, data)
      : await PlantillasService.createTemplate(organizationId, data);

    if (ok) {
      toast({ title: id ? 'Actualizada' : 'Creada', description: `Plantilla "${data.name}" guardada.` });
      loadData();
      return true;
    }
    toast({ title: 'Error', description: 'No se pudo guardar la plantilla.', variant: 'destructive' });
    return false;
  };

  const handleDuplicate = async (t: NotificationTemplate) => {
    const ok = await PlantillasService.duplicateTemplate(t);
    if (ok) {
      toast({ title: 'Duplicada', description: `Se creó "${t.name} (copia)".` });
      loadData();
    } else {
      toast({ title: 'Error', description: 'No se pudo duplicar.', variant: 'destructive' });
    }
  };

  const handleDelete = async (t: NotificationTemplate) => {
    if (!confirm(`¿Eliminar "${t.name}"?`)) return;
    const ok = await PlantillasService.deleteTemplate(t.id);
    if (ok) {
      toast({ title: 'Eliminada', description: 'Plantilla eliminada.' });
      loadData();
    } else {
      toast({ title: 'Error', description: 'No se pudo eliminar.', variant: 'destructive' });
    }
  };

  const handleTest = async (t: NotificationTemplate, variables: Record<string, string>): Promise<boolean> => {
    if (!organizationId) return false;
    const ok = await PlantillasService.sendTestNotification(organizationId, t, variables);
    if (ok) {
      toast({ title: 'Enviada', description: 'Notificación de prueba creada.' });
      return true;
    }
    toast({ title: 'Error', description: 'No se pudo enviar la prueba.', variant: 'destructive' });
    return false;
  };

  const handleExport = async () => {
    if (!organizationId) return;
    const data = await PlantillasService.exportTemplates(organizationId);
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `plantillas-${organization?.slug || organizationId}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: 'Exportado', description: `${data.length} plantillas exportadas.` });
  };

  const handleImport = async (tpls: TemplateFormData[]): Promise<{ success: number; failed: number }> => {
    if (!organizationId) return { success: 0, failed: tpls.length };
    const res = await PlantillasService.importTemplates(organizationId, tpls);
    if (res.success > 0) {
      toast({ title: 'Importadas', description: `${res.success} plantillas importadas.` });
      loadData();
    }
    return res;
  };

  if (!organizationId || !userId) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Cargando plantillas...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
      <PlantillasHeader
        totalTemplates={total}
        channelCounts={channelCounts}
        isLoading={isLoading}
        isRefreshing={isRefreshing}
        isAdmin={isAdmin}
        onRefresh={handleRefresh}
        onCreateNew={() => { setEditingTemplate(null); setEditorOpen(true); }}
        onExport={handleExport}
        onImport={() => setImportOpen(true)}
      />

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
        <PlantillaFilters
          filters={filters}
          onChange={handleFiltersChange}
        />

        <PlantillaList
          templates={templates}
          total={total}
          page={page}
          pageSize={PlantillasService.PAGE_SIZE}
          isLoading={isLoading}
          isAdmin={isAdmin}
          onPageChange={setPage}
          onEdit={(t) => { setEditingTemplate(t); setEditorOpen(true); }}
          onDuplicate={handleDuplicate}
          onDelete={handleDelete}
          onTest={(t) => { setTestingTemplate(t); setTestOpen(true); }}
        />
      </div>

      <PlantillaEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        template={editingTemplate}
        onSave={handleSave}
      />

      <TestSendDialog
        open={testOpen}
        onOpenChange={setTestOpen}
        template={testingTemplate}
        onSend={handleTest}
      />

      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImport={handleImport}
      />
    </div>
  );
}
