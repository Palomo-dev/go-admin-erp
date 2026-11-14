import { supabase } from '@/lib/supabase/config';
// El saldo y el cobro de créditos viven en /api/chat/ai/lab-test (servidor):
// este archivo corre en el navegador.

export interface KnowledgeFragment {
  id: string;
  organization_id: number;
  source_id: string | null;
  title: string;
  content: string;
  tags: string[];
  is_active: boolean;
  version: number;
  priority: number;
  usage_count: number;
  positive_feedback: number;
  negative_feedback: number;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface LabTestResult {
  query: string;
  fragments: RetrievedFragment[];
  response: string;
  metrics: LabMetrics;
  timestamp: string;
  settings: LabSettings;
}

export interface RetrievedFragment {
  id: string;
  title: string;
  content: string;
  similarity: number;
  tags: string[];
  priority: number;
}

/**
 * Cifras reales de la prueba. No hay «confianza»: la IA de atención no calcula
 * ninguna, y mostrar una inventada sería peor que no mostrarla.
 */
export interface LabMetrics {
  retrievedFragments: number;
  processingTimeMs: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export type CodigoFalloPrueba = 'sin_creditos' | 'proveedor' | 'sin_permiso' | 'error';

export type ResultadoPrueba =
  | { ok: true; resultado: LabTestResult; saldoRestante: number | null }
  | { ok: false; codigo: CodigoFalloPrueba };

/** Respuesta de `POST /api/chat/ai/lab-test` (`ResultadoLaboratorio`). */
interface RespuestaServidorLab {
  respuesta: string;
  tiempoMs: number;
  tokens: { entrada: number; salida: number; total: number };
  fragmentos: number;
  saldoRestante: number | null;
}

export interface LabSettings {
  model: string;
  temperature: number;
  maxTokens: number;
  maxFragments: number;
  systemRules: string;
  tone: string;
  language: string;
  simulatedChannel: string;
}

export interface Channel {
  id: string;
  name: string;
  type: string;
  ai_mode: string;
}

class AILabService {
  private organizationId: number;

  constructor(organizationId: number) {
    this.organizationId = organizationId;
  }

  private async setOrgContext(): Promise<void> {
    await supabase.rpc('set_org_context', { org_id: this.organizationId });
  }

  async getFragments(filters?: {
    search?: string;
    tags?: string[];
    isActive?: boolean;
    limit?: number;
  }): Promise<KnowledgeFragment[]> {
    await this.setOrgContext();

    let query = supabase
      .from('knowledge_fragments')
      .select('*')
      .eq('organization_id', this.organizationId)
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false });

    if (filters?.isActive !== undefined) {
      query = query.eq('is_active', filters.isActive);
    }

    if (filters?.search) {
      query = query.or(`title.ilike.%${filters.search}%,content.ilike.%${filters.search}%`);
    }

    if (filters?.tags && filters.tags.length > 0) {
      query = query.contains('tags', filters.tags);
    }

    if (filters?.limit) {
      query = query.limit(filters.limit);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error obteniendo fragmentos:', error);
      return [];
    }

    return data || [];
  }

  async getFragmentStats(): Promise<{
    total: number;
    active: number;
    inactive: number;
    withEmbeddings: number;
    avgPriority: number;
  }> {
    await this.setOrgContext();

    const { data: fragments, error } = await supabase
      .from('knowledge_fragments')
      .select('id, is_active, priority')
      .eq('organization_id', this.organizationId);

    if (error || !fragments) {
      return { total: 0, active: 0, inactive: 0, withEmbeddings: 0, avgPriority: 0 };
    }

    const { count: embeddingsCount } = await supabase
      .from('knowledge_embeddings')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', this.organizationId);

    const total = fragments.length;
    const active = fragments.filter(f => f.is_active).length;
    const inactive = total - active;
    const avgPriority = total > 0 
      ? fragments.reduce((sum, f) => sum + (f.priority || 0), 0) / total 
      : 0;

    return {
      total,
      active,
      inactive,
      withEmbeddings: embeddingsCount || 0,
      avgPriority: Math.round(avgPriority * 10) / 10
    };
  }

  async searchFragmentsByText(
    query: string,
    maxFragments: number = 5
  ): Promise<RetrievedFragment[]> {
    await this.setOrgContext();

    const startTime = Date.now();

    const { data, error } = await supabase
      .from('knowledge_fragments')
      .select('id, title, content, tags, priority')
      .eq('organization_id', this.organizationId)
      .eq('is_active', true)
      .or(`title.ilike.%${query}%,content.ilike.%${query}%`)
      .order('priority', { ascending: false })
      .limit(maxFragments);

    if (error) {
      console.error('Error buscando fragmentos:', error);
      return [];
    }

    return (data || []).map((f, index) => ({
      id: f.id,
      title: f.title,
      content: f.content,
      similarity: 1 - (index * 0.1),
      tags: f.tags || [],
      priority: f.priority || 5
    }));
  }

  async getChannels(): Promise<Channel[]> {
    await this.setOrgContext();

    const { data, error } = await supabase
      .from('channels')
      .select('id, name, type, ai_mode')
      .eq('organization_id', this.organizationId)
      .order('name');

    if (error) {
      console.error('Error obteniendo canales:', error);
      return [];
    }

    return data || [];
  }

  async getAISettings(): Promise<LabSettings | null> {
    await this.setOrgContext();

    const { data, error } = await supabase
      .from('ai_settings')
      .select('*')
      .eq('organization_id', this.organizationId)
      .single();

    if (error || !data) {
      return null;
    }

    return {
      model: data.model || 'gpt-4o-mini',
      temperature: data.temperature || 0.7,
      maxTokens: data.max_tokens || 500,
      maxFragments: data.max_fragments_context || 5,
      systemRules: data.system_rules || '',
      tone: data.tone || 'professional',
      language: data.language || 'es',
      simulatedChannel: 'whatsapp'
    };
  }

  /**
   * «Probar» del laboratorio: respuesta REAL de la IA, generada en el servidor
   * (`POST /api/chat/ai/lab-test`) con el mismo prompt y el mismo modelo que
   * responden a los clientes. Cobra créditos allí (saldo antes, cobro después);
   * si la prueba falla no se cobra. No envía nada a ningún cliente.
   */
  async runTest(
    query: string,
    settings: LabSettings,
    fragments: RetrievedFragment[]
  ): Promise<ResultadoPrueba> {
    let respuesta: Response;
    try {
      respuesta = await fetch('/api/chat/ai/lab-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          canal: settings.simulatedChannel,
          temperatura: settings.temperature,
          maxTokens: settings.maxTokens,
          // El servidor acepta hasta 20 (los que muestra la lista).
          fragmentIds: fragments.slice(0, 20).map((f) => f.id),
        }),
      });
    } catch {
      return { ok: false, codigo: 'error' };
    }

    const cuerpo = (await respuesta.json().catch(() => null)) as
      | { success?: boolean; code?: string; data?: RespuestaServidorLab }
      | null;
    if (!respuesta.ok || !cuerpo?.success || !cuerpo.data) {
      const codigo: CodigoFalloPrueba =
        cuerpo?.code === 'sin_creditos' || respuesta.status === 402
          ? 'sin_creditos'
          : cuerpo?.code === 'proveedor'
            ? 'proveedor'
            : respuesta.status === 403
              ? 'sin_permiso'
              : 'error';
      return { ok: false, codigo };
    }

    const d = cuerpo.data;
    return {
      ok: true,
      saldoRestante: d.saldoRestante,
      resultado: {
        query,
        fragments,
        response: d.respuesta,
        metrics: {
          retrievedFragments: d.fragmentos,
          processingTimeMs: d.tiempoMs,
          promptTokens: d.tokens.entrada,
          completionTokens: d.tokens.salida,
          totalTokens: d.tokens.total,
        },
        timestamp: new Date().toISOString(),
        settings,
      },
    };
  }

  // runLocalTest() y generateSimulatedResponse() se eliminaron (2026-11-13):
  // armaban una respuesta simulada con el primer fragmento. El laboratorio ya
  // prueba con la IA real.

  async logLabTest(result: LabTestResult, memberId?: number): Promise<void> {
    try {
      await supabase.from('chat_audit_logs').insert({
        organization_id: this.organizationId,
        actor_type: 'member',
        actor_id: null,
        action: 'lab_test',
        entity_type: 'ai_lab',
        entity_id: null,
        changes: {
          query: result.query,
          fragmentsCount: result.fragments.length,
          responseLength: result.response.length,
          metrics: result.metrics,
          settings: result.settings
        },
        metadata: {},
        ip_address: null,
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null
      });
    } catch (error) {
      console.error('Error logging lab test:', error);
    }
  }
}

export default AILabService;
