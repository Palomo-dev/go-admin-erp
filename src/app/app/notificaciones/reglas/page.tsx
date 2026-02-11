'use client';

import { useState, useEffect, useCallback } from 'react';
import { useOrganization, getCurrentUserId } from '@/lib/hooks/useOrganization';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, ShieldAlert } from 'lucide-react';
import {
  ReglasHeader,
  ReglaCard,
  ReglaFilters,
  ReglaEditorDialog,
  ImportPresetDialog,
  HistorialAlertasSheet,
  ReglasService,
} from '@/components/notificaciones/reglas';
import type {
  AlertRule,
  RuleFormData,
  RuleFilters as RuleFiltersType,
  RuleStats,
} from '@/components/notificaciones/reglas';
import { DEFAULT_RULE_FILTERS } from '@/components/notificaciones/reglas/types';

export default function ReglasPage() {
  const { organization } = useOrganization();
  const organizationId = organization?.id;
  const { toast } = useToast();

  const [userId, setUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [rules, setRules] = useState<AlertRule[]>([]);
  const [stats, setStats] = useState<RuleStats | null>(null);
  const [filters, setFilters] = useState<RuleFiltersType>(DEFAULT_RULE_FILTERS);
  const [availableModules, setAvailableModules] = useState<string[]>([]);
  const [activeChannels, setActiveChannels] = useState<{ code: string; provider_name: string }[]>([]);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AlertRule | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [historialOpen, setHistorialOpen] = useState(false);
  const [historialRule, setHistorialRule] = useState<AlertRule | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

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
      // Seed reglas default si la org no tiene
      await ReglasService.ensureDefaultRules(organizationId);

      const [rulesData, statsData, modulesData, channelsData] = await Promise.all([
        ReglasService.getRules(organizationId, filters),
        ReglasService.getStats(organizationId),
        ReglasService.getDistinctModules(organizationId),
        ReglasService.getActiveChannels(organizationId),
      ]);

      setRules(rulesData);
      setStats(statsData);
      setAvailableModules(modulesData);
      setActiveChannels(channelsData);
    } catch (error) {
      console.error('Error cargando reglas:', error);
      toast({ title: 'Error', description: 'No se pudieron cargar las reglas.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [organizationId, filters, toast]);

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

  const handleSave = async (data: RuleFormData, id?: string): Promise<boolean> => {
    if (!organizationId) return false;

    const ok = id
      ? await ReglasService.updateRule(id, data)
      : await ReglasService.createRule(organizationId, data);

    if (ok) {
      toast({ title: id ? 'Actualizada' : 'Creada', description: `Regla "${data.name}" guardada.` });
      loadData();
      return true;
    }
    toast({ title: 'Error', description: 'No se pudo guardar la regla.', variant: 'destructive' });
    return false;
  };

  const handleToggle = async (rule: AlertRule) => {
    setTogglingId(rule.id);
    const ok = await ReglasService.toggleActive(rule.id, !rule.active);
    if (ok) {
      toast({
        title: rule.active ? 'Desactivada' : 'Activada',
        description: `${rule.name} ${rule.active ? 'desactivada' : 'activada'}.`,
      });
      loadData();
    }
    setTogglingId(null);
  };

  const handleDuplicate = async (rule: AlertRule) => {
    const ok = await ReglasService.duplicateRule(rule);
    if (ok) {
      toast({ title: 'Duplicada', description: `Se creó "${rule.name} (copia)".` });
      loadData();
    } else {
      toast({ title: 'Error', description: 'No se pudo duplicar.', variant: 'destructive' });
    }
  };

  const handleDelete = async (rule: AlertRule) => {
    if (!confirm(`¿Eliminar regla "${rule.name}"?`)) return;
    const ok = await ReglasService.deleteRule(rule.id);
    if (ok) {
      toast({ title: 'Eliminada', description: 'Regla eliminada.' });
      loadData();
    } else {
      toast({ title: 'Error', description: 'No se pudo eliminar.', variant: 'destructive' });
    }
  };

  const handleTest = async (rule: AlertRule) => {
    if (!organizationId) return;
    const ok = await ReglasService.testRule(organizationId, rule);
    if (ok) {
      toast({ title: 'Prueba ejecutada', description: `Alerta de prueba creada para "${rule.name}".` });
      setTimeout(() => loadData(), 1500);
    } else {
      toast({ title: 'Error', description: 'No se pudo ejecutar la prueba.', variant: 'destructive' });
    }
  };

  const handleImport = async (presets: RuleFormData[]): Promise<{ success: number; failed: number }> => {
    if (!organizationId) return { success: 0, failed: presets.length };
    const res = await ReglasService.importPreset(organizationId, presets);
    if (res.success > 0) {
      toast({ title: 'Importadas', description: `${res.success} reglas importadas.` });
      loadData();
    }
    return res;
  };

  const handleExport = () => {
    const json = ReglasService.exportRules(rules);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reglas-alerta-${organization?.slug || organizationId}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: 'Exportado', description: `${rules.length} reglas exportadas.` });
  };

  if (!organizationId || !userId) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Cargando reglas...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
      <ReglasHeader
        stats={stats}
        isLoading={isLoading}
        isRefreshing={isRefreshing}
        isAdmin={isAdmin}
        onRefresh={handleRefresh}
        onCreateNew={() => { setEditingRule(null); setEditorOpen(true); }}
        onExport={handleExport}
        onImport={() => setImportOpen(true)}
      />

      <ReglaFilters
        filters={filters}
        onFiltersChange={setFilters}
        availableModules={availableModules}
      />

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-52 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : rules.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-gray-500">
            <ShieldAlert className="h-12 w-12 mb-3" />
            <p className="text-base font-medium">No hay reglas configuradas</p>
            <p className="text-sm">Crea tu primera regla o importa un preset por industria</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {rules.map((rule) => (
              <ReglaCard
                key={rule.id}
                rule={rule}
                isAdmin={isAdmin}
                onEdit={() => { setEditingRule(rule); setEditorOpen(true); }}
                onDuplicate={() => handleDuplicate(rule)}
                onDelete={() => handleDelete(rule)}
                onTest={() => handleTest(rule)}
                onToggle={() => handleToggle(rule)}
                onViewAlerts={() => { setHistorialRule(rule); setHistorialOpen(true); }}
                isToggling={togglingId === rule.id}
              />
            ))}
          </div>
        )}
      </div>

      <ReglaEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        rule={editingRule}
        activeChannels={activeChannels}
        onSave={handleSave}
      />

      <ImportPresetDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImport={handleImport}
      />

      <HistorialAlertasSheet
        open={historialOpen}
        onOpenChange={setHistorialOpen}
        rule={historialRule}
        organizationId={organizationId}
      />
    </div>
  );
}
