import { supabase } from '@/lib/supabase/config';
import type {
  NotificationTemplate,
  TemplateFilters,
  TemplateFormData,
  TemplateChannel,
} from './types';

const PAGE_SIZE = 20;

export const PlantillasService = {
  // ── Listar plantillas con filtros ────────────────────
  async getTemplates(
    orgId: number,
    filters: TemplateFilters,
    page: number = 1,
  ): Promise<{ data: NotificationTemplate[]; total: number }> {
    let query = supabase
      .from('notification_templates')
      .select('*', { count: 'exact' })
      .eq('organization_id', orgId)
      .order('updated_at', { ascending: false });

    if (filters.channel !== 'all') query = query.eq('channel', filters.channel);
    if (filters.search) {
      query = query.or(`name.ilike.%${filters.search}%,subject.ilike.%${filters.search}%`);
    }

    const from = (page - 1) * PAGE_SIZE;
    query = query.range(from, from + PAGE_SIZE - 1);

    const { data, count, error } = await query;
    if (error) {
      console.error('Error fetching templates:', error);
      return { data: [], total: 0 };
    }
    return { data: (data as NotificationTemplate[]) || [], total: count ?? 0 };
  },

  // ── Stats rápidas por canal ──────────────────────────
  async getChannelCounts(orgId: number): Promise<Record<string, number>> {
    const { data, error } = await supabase
      .from('notification_templates')
      .select('channel')
      .eq('organization_id', orgId);

    if (error || !data) return {};
    const counts: Record<string, number> = {};
    data.forEach((r: any) => {
      counts[r.channel] = (counts[r.channel] || 0) + 1;
    });
    return counts;
  },

  // ── Obtener una plantilla ────────────────────────────
  async getTemplate(id: string): Promise<NotificationTemplate | null> {
    const { data, error } = await supabase
      .from('notification_templates')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) return null;
    return data as NotificationTemplate | null;
  },

  // ── Crear plantilla ─────────────────────────────────
  async createTemplate(orgId: number, form: TemplateFormData): Promise<boolean> {
    const { error } = await supabase.from('notification_templates').insert({
      organization_id: orgId,
      channel: form.channel,
      name: form.name,
      subject: form.subject || null,
      body_html: form.body_html || null,
      body_text: form.body_text,
      variables: form.variables,
      version: 1,
    });
    if (error) {
      console.error('Error creating template:', error);
      return false;
    }
    return true;
  },

  // ── Actualizar plantilla (incrementa versión) ───────
  async updateTemplate(id: string, form: TemplateFormData): Promise<boolean> {
    const current = await this.getTemplate(id);
    const nextVersion = current ? current.version + 1 : 1;

    const { error } = await supabase
      .from('notification_templates')
      .update({
        channel: form.channel,
        name: form.name,
        subject: form.subject || null,
        body_html: form.body_html || null,
        body_text: form.body_text,
        variables: form.variables,
        version: nextVersion,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (error) {
      console.error('Error updating template:', error);
      return false;
    }
    return true;
  },

  // ── Duplicar plantilla ──────────────────────────────
  async duplicateTemplate(template: NotificationTemplate): Promise<boolean> {
    const { error } = await supabase.from('notification_templates').insert({
      organization_id: template.organization_id,
      channel: template.channel,
      name: `${template.name} (copia)`,
      subject: template.subject,
      body_html: template.body_html,
      body_text: template.body_text,
      variables: template.variables,
      version: 1,
    });
    if (error) {
      console.error('Error duplicating template:', error);
      return false;
    }
    return true;
  },

  // ── Eliminar plantilla ──────────────────────────────
  async deleteTemplate(id: string): Promise<boolean> {
    const { error } = await supabase
      .from('notification_templates')
      .delete()
      .eq('id', id);
    if (error) {
      console.error('Error deleting template:', error);
      return false;
    }
    return true;
  },

  // ── Envío de prueba (sandbox) ────────────────────────
  async sendTestNotification(
    orgId: number,
    template: NotificationTemplate,
    testVariables: Record<string, string>,
  ): Promise<boolean> {
    let body = template.body_text;
    Object.entries(testVariables).forEach(([key, val]) => {
      body = body.replace(new RegExp(`{{${key}}}`, 'g'), val);
    });

    const { error } = await supabase.from('notifications').insert({
      organization_id: orgId,
      channel: template.channel,
      payload: {
        type: 'template_test',
        title: template.subject || template.name,
        content: body,
        template_id: template.id,
        is_test: true,
      },
      status: 'pending',
    });

    if (error) {
      console.error('Error sending test notification:', error);
      return false;
    }
    return true;
  },

  // ── Importar plantillas desde JSON ───────────────────
  async importTemplates(
    orgId: number,
    templates: TemplateFormData[],
  ): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;

    for (const t of templates) {
      const ok = await this.createTemplate(orgId, t);
      if (ok) success++;
      else failed++;
    }

    return { success, failed };
  },

  // ── Exportar plantillas a JSON ───────────────────────
  async exportTemplates(orgId: number): Promise<NotificationTemplate[]> {
    const { data, error } = await supabase
      .from('notification_templates')
      .select('*')
      .eq('organization_id', orgId)
      .order('channel', { ascending: true });

    if (error) return [];
    return (data as NotificationTemplate[]) || [];
  },

  PAGE_SIZE,
};
