import { supabase } from '@/lib/supabase/config';
import type { AlertRule, RuleFormData, RuleFilters, RuleStats, RuleAlert } from './types';

export const ReglasService = {
  // ── Stats rápidas ─────────────────────────────────────
  async getStats(orgId: number): Promise<RuleStats> {
    const { data, error } = await supabase
      .from('alert_rules')
      .select('id, active, severity')
      .eq('organization_id', orgId);

    if (error || !data) return { total: 0, active: 0, inactive: 0, critical: 0 };

    return {
      total: data.length,
      active: data.filter((r) => r.active).length,
      inactive: data.filter((r) => !r.active).length,
      critical: data.filter((r) => r.severity === 'critical').length,
    };
  },

  // ── Seed reglas default si la org no tiene ────────────
  async ensureDefaultRules(orgId: number): Promise<void> {
    const { count } = await supabase
      .from('alert_rules')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId);

    if (count === 0) {
      const { error } = await supabase.rpc('fn_seed_default_rules', { p_org_id: orgId });
      if (error) {
        console.error('Error seeding default rules:', error);
      }
    }
  },

  // ── Listar reglas con filtros ─────────────────────────
  async getRules(orgId: number, filters: RuleFilters): Promise<AlertRule[]> {
    let query = supabase
      .from('alert_rules')
      .select('*')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false });

    if (filters.severity !== 'all') query = query.eq('severity', filters.severity);
    if (filters.status === 'active') query = query.eq('active', true);
    if (filters.status === 'inactive') query = query.eq('active', false);
    if (filters.source_module !== 'all') query = query.eq('source_module', filters.source_module);
    if (filters.search) {
      query = query.or(`name.ilike.%${filters.search}%,sql_condition.ilike.%${filters.search}%`);
    }

    const { data, error } = await query;
    if (error) {
      console.error('Error fetching rules:', error);
      return [];
    }

    const rules = (data as AlertRule[]) || [];

    // Obtener conteo de disparos por regla
    const ruleIds = rules.map((r) => r.id);
    if (ruleIds.length > 0) {
      const { data: alertsData } = await supabase
        .from('system_alerts')
        .select('rule_id, created_at')
        .eq('organization_id', orgId)
        .in('rule_id', ruleIds)
        .order('created_at', { ascending: false });

      if (alertsData) {
        const countMap: Record<string, number> = {};
        const lastMap: Record<string, string> = {};
        alertsData.forEach((a: any) => {
          if (a.rule_id) {
            countMap[a.rule_id] = (countMap[a.rule_id] || 0) + 1;
            if (!lastMap[a.rule_id]) lastMap[a.rule_id] = a.created_at;
          }
        });
        rules.forEach((r) => {
          r.fire_count = countMap[r.id] || 0;
          r.last_fired_at = lastMap[r.id] || null;
        });
      }
    }

    return rules;
  },

  // ── Crear regla ───────────────────────────────────────
  async createRule(orgId: number, data: RuleFormData): Promise<boolean> {
    const { error } = await supabase.from('alert_rules').insert({
      organization_id: orgId,
      name: data.name,
      source_module: data.source_module,
      sql_condition: data.sql_condition,
      channels: data.channels,
      severity: data.severity,
      active: data.active,
    });
    if (error) {
      console.error('Error creating rule:', error);
      return false;
    }
    return true;
  },

  // ── Actualizar regla ─────────────────────────────────
  async updateRule(id: string, data: RuleFormData): Promise<boolean> {
    const { error } = await supabase
      .from('alert_rules')
      .update({
        name: data.name,
        source_module: data.source_module,
        sql_condition: data.sql_condition,
        channels: data.channels,
        severity: data.severity,
        active: data.active,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (error) {
      console.error('Error updating rule:', error);
      return false;
    }
    return true;
  },

  // ── Toggle activo ─────────────────────────────────────
  async toggleActive(id: string, active: boolean): Promise<boolean> {
    const { error } = await supabase
      .from('alert_rules')
      .update({ active, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) {
      console.error('Error toggling rule:', error);
      return false;
    }
    return true;
  },

  // ── Eliminar regla ────────────────────────────────────
  async deleteRule(id: string): Promise<boolean> {
    const { error } = await supabase
      .from('alert_rules')
      .delete()
      .eq('id', id);
    if (error) {
      console.error('Error deleting rule:', error);
      return false;
    }
    return true;
  },

  // ── Duplicar regla ────────────────────────────────────
  async duplicateRule(rule: AlertRule): Promise<boolean> {
    const { error } = await supabase.from('alert_rules').insert({
      organization_id: rule.organization_id,
      name: `${rule.name} (copia)`,
      source_module: rule.source_module,
      sql_condition: rule.sql_condition,
      channels: rule.channels,
      severity: rule.severity,
      active: false,
    });
    if (error) {
      console.error('Error duplicating rule:', error);
      return false;
    }
    return true;
  },

  // ── Importar reglas por industria ─────────────────────
  async importPreset(orgId: number, presets: RuleFormData[]): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;

    for (const preset of presets) {
      const { error } = await supabase.from('alert_rules').insert({
        organization_id: orgId,
        ...preset,
      });
      if (error) {
        console.error('Error importing preset:', error);
        failed++;
      } else {
        success++;
      }
    }

    return { success, failed };
  },

  // ── Ejecutar prueba (simular) ─────────────────────────
  async testRule(orgId: number, rule: AlertRule): Promise<boolean> {
    const { error } = await supabase.from('system_alerts').insert({
      organization_id: orgId,
      rule_id: rule.id,
      title: `[TEST] ${rule.name}`,
      message: `Prueba de regla "${rule.name}" ejecutada manualmente. Condición: ${rule.sql_condition.substring(0, 100)}...`,
      severity: rule.severity,
      source_module: rule.source_module,
      status: 'pending',
      metadata: { is_test: true, tested_at: new Date().toISOString() },
    });
    if (error) {
      console.error('Error testing rule:', error);
      return false;
    }
    return true;
  },

  // ── Historial de alertas generadas por una regla ──────
  async getRuleAlerts(orgId: number, ruleId: string, limit: number = 20): Promise<RuleAlert[]> {
    const { data, error } = await supabase
      .from('system_alerts')
      .select('id, title, message, severity, status, source_module, created_at')
      .eq('organization_id', orgId)
      .eq('rule_id', ruleId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching rule alerts:', error);
      return [];
    }
    return (data as RuleAlert[]) || [];
  },

  // ── Módulos distintos usados en reglas ────────────────
  async getDistinctModules(orgId: number): Promise<string[]> {
    const { data, error } = await supabase
      .from('alert_rules')
      .select('source_module')
      .eq('organization_id', orgId);

    if (error || !data) return [];
    const mods = new Set<string>();
    data.forEach((r: any) => { if (r.source_module) mods.add(r.source_module); });
    return Array.from(mods).sort();
  },

  // ── Canales activos (para selector en editor) ─────────
  async getActiveChannels(orgId: number): Promise<{ code: string; provider_name: string }[]> {
    const { data, error } = await supabase
      .from('notification_channels')
      .select('code, provider_name')
      .eq('organization_id', orgId)
      .eq('is_active', true);

    if (error) return [];
    return data || [];
  },

  // ── Exportar reglas a JSON ────────────────────────────
  exportRules(rules: AlertRule[]): string {
    const exportData = rules.map((r) => ({
      name: r.name,
      source_module: r.source_module,
      sql_condition: r.sql_condition,
      channels: r.channels,
      severity: r.severity,
      active: r.active,
    }));
    return JSON.stringify(exportData, null, 2);
  },
};
