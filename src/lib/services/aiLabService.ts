import { supabase } from '@/lib/supabase/config';

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

export interface LabMetrics {
  totalFragments: number;
  retrievedFragments: number;
  processingTimeMs: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost: number;
  confidenceScore: number;
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

  async runTest(
    query: string,
    settings: LabSettings,
    fragments: RetrievedFragment[]
  ): Promise<LabTestResult> {
    const startTime = Date.now();

    const fragmentsContext = fragments
      .map(f => `[${f.title}]\n${f.content}`)
      .join('\n\n---\n\n');

    const response = await fetch('/api/chat/ai/lab-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        organizationId: this.organizationId,
        query,
        settings,
        fragmentsContext
      })
    });

    const result = await response.json();
    const processingTimeMs = Date.now() - startTime;

    const metrics: LabMetrics = {
      totalFragments: fragments.length,
      retrievedFragments: fragments.length,
      processingTimeMs,
      promptTokens: result.usage?.promptTokens || 0,
      completionTokens: result.usage?.completionTokens || 0,
      totalTokens: result.usage?.totalTokens || 0,
      estimatedCost: this.calculateCost(result.usage, settings.model),
      confidenceScore: result.confidenceScore || 0.8
    };

    return {
      query,
      fragments,
      response: result.response || result.error || 'Sin respuesta',
      metrics,
      timestamp: new Date().toISOString(),
      settings
    };
  }

  async runLocalTest(
    query: string,
    settings: LabSettings,
    fragments: RetrievedFragment[]
  ): Promise<LabTestResult> {
    const startTime = Date.now();

    const fragmentsContext = fragments
      .map(f => `[${f.title}]\n${f.content}`)
      .join('\n\n---\n\n');

    const simulatedResponse = this.generateSimulatedResponse(query, fragments, settings);
    const processingTimeMs = Date.now() - startTime;

    const estimatedTokens = Math.ceil((query.length + fragmentsContext.length) / 4);
    const completionTokens = Math.ceil(simulatedResponse.length / 4);

    const metrics: LabMetrics = {
      totalFragments: fragments.length,
      retrievedFragments: fragments.length,
      processingTimeMs: processingTimeMs + 500,
      promptTokens: estimatedTokens,
      completionTokens,
      totalTokens: estimatedTokens + completionTokens,
      estimatedCost: this.calculateCost(
        { promptTokens: estimatedTokens, completionTokens },
        settings.model
      ),
      confidenceScore: fragments.length > 0 ? 0.85 : 0.4
    };

    return {
      query,
      fragments,
      response: simulatedResponse,
      metrics,
      timestamp: new Date().toISOString(),
      settings
    };
  }

  private generateSimulatedResponse(
    query: string,
    fragments: RetrievedFragment[],
    settings: LabSettings
  ): string {
    if (fragments.length === 0) {
      return settings.language === 'es'
        ? 'Lo siento, no encontré información relevante en la base de conocimiento para responder tu consulta. ¿Podrías reformular tu pregunta o proporcionar más detalles?'
        : 'Sorry, I couldn\'t find relevant information in the knowledge base to answer your query. Could you rephrase your question or provide more details?';
    }

    const tonePrefix = {
      professional: 'Gracias por tu consulta. ',
      friendly: '¡Hola! ',
      formal: 'Estimado usuario, ',
      casual: 'Hey! ',
      empathetic: 'Entiendo tu consulta. '
    }[settings.tone] || '';

    const mainFragment = fragments[0];
    const summary = mainFragment.content.substring(0, 300);

    return `${tonePrefix}Basándome en la información disponible sobre "${mainFragment.title}", te puedo comentar lo siguiente:

${summary}${mainFragment.content.length > 300 ? '...' : ''}

${fragments.length > 1 ? `También encontré ${fragments.length - 1} fragmento(s) adicional(es) relacionado(s) con tu consulta.` : ''}

¿Hay algo más en lo que pueda ayudarte?`;
  }

  private calculateCost(
    usage: { promptTokens: number; completionTokens: number } | undefined,
    model: string
  ): number {
    if (!usage) return 0;

    const pricing: Record<string, { input: number; output: number }> = {
      'gpt-4o': { input: 0.0025, output: 0.01 },
      'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
      'gpt-4-turbo': { input: 0.01, output: 0.03 },
      'gpt-4': { input: 0.03, output: 0.06 },
      'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
    };

    const modelPricing = pricing[model] || pricing['gpt-4o-mini'];
    const inputCost = (usage.promptTokens / 1000) * modelPricing.input;
    const outputCost = (usage.completionTokens / 1000) * modelPricing.output;

    return Math.round((inputCost + outputCost) * 100000) / 100000;
  }

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
