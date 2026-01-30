import { supabase } from '@/lib/supabase/config';

export interface KnowledgeSource {
  id: string;
  organization_id: number;
  name: string;
  description: string | null;
  icon: string | null;
  is_active: boolean;
  fragment_count: number;
  created_at: string;
  updated_at: string;
  created_by: number | null;
  has_embeddings?: boolean;
}

export interface KnowledgeFragment {
  id: string;
  organization_id: number;
  source_id: string | null;
  title: string;
  content: string;
  tags: string[];
  is_active: boolean;
  version: number;
  content_hash: string | null;
  priority: number;
  usage_count: number;
  positive_feedback: number;
  negative_feedback: number;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
  created_by: number | null;
  source?: KnowledgeSource;
  has_embedding?: boolean;
}

export interface KnowledgeStats {
  totalSources: number;
  activeSources: number;
  totalFragments: number;
  indexedFragments: number;
}

export interface CreateSourceData {
  name: string;
  description?: string;
  icon?: string;
}

export interface CreateFragmentData {
  source_id?: string;
  title: string;
  content: string;
  tags?: string[];
  priority?: number;
}

export interface FragmentFilters {
  sourceId?: string;
  search?: string;
  tags?: string[];
  isActive?: boolean;
}

export interface ImportFragmentData {
  title: string;
  content: string;
  tags?: string[];
  priority?: number;
}

export interface ImportResult {
  success: boolean;
  totalProcessed: number;
  successCount: number;
  errorCount: number;
  errors: { row: number; message: string }[];
  fragmentIds: string[];
  jobId?: string;
}

export interface EmbeddingInfo {
  id: string;
  model: string;
  created_at: string;
  updated_at: string;
}

export default class KnowledgeService {
  private organizationId: number;

  constructor(organizationId: number) {
    this.organizationId = organizationId;
  }

  private async setOrgContext() {
    await supabase.rpc('set_org_context', { org_id: this.organizationId });
  }

  async getSources(): Promise<KnowledgeSource[]> {
    await this.setOrgContext();

    const { data, error } = await supabase
      .from('knowledge_sources')
      .select('*')
      .eq('organization_id', this.organizationId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error obteniendo fuentes:', error);
      return [];
    }

    const sourcesWithEmbeddings = await Promise.all(
      (data || []).map(async (source) => {
        const { count } = await supabase
          .from('knowledge_embeddings')
          .select('*', { count: 'exact', head: true })
          .eq('organization_id', this.organizationId)
          .in('fragment_id', 
            await this.getFragmentIdsForSource(source.id)
          );

        return {
          ...source,
          has_embeddings: (count || 0) > 0
        };
      })
    );

    return sourcesWithEmbeddings;
  }

  private async getFragmentIdsForSource(sourceId: string): Promise<string[]> {
    const { data } = await supabase
      .from('knowledge_fragments')
      .select('id')
      .eq('source_id', sourceId)
      .eq('organization_id', this.organizationId);

    return (data || []).map(f => f.id);
  }

  async getSource(sourceId: string): Promise<KnowledgeSource | null> {
    await this.setOrgContext();

    const { data, error } = await supabase
      .from('knowledge_sources')
      .select('*')
      .eq('id', sourceId)
      .eq('organization_id', this.organizationId)
      .single();

    if (error) {
      console.error('Error obteniendo fuente:', error);
      return null;
    }

    return data;
  }

  async createSource(sourceData: CreateSourceData, memberId: number): Promise<KnowledgeSource> {
    await this.setOrgContext();

    const { data, error } = await supabase
      .from('knowledge_sources')
      .insert({
        organization_id: this.organizationId,
        name: sourceData.name,
        description: sourceData.description || null,
        icon: sourceData.icon || null,
        created_by: memberId
      })
      .select()
      .single();

    if (error) {
      console.error('Error creando fuente:', error);
      throw new Error('No se pudo crear la fuente de conocimiento');
    }

    await this.logAudit('create_knowledge_source', { source_id: data.id, name: data.name }, memberId);

    return data;
  }

  async updateSource(sourceId: string, updates: Partial<CreateSourceData>, memberId: number): Promise<KnowledgeSource> {
    await this.setOrgContext();

    const { data, error } = await supabase
      .from('knowledge_sources')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', sourceId)
      .eq('organization_id', this.organizationId)
      .select()
      .single();

    if (error) {
      console.error('Error actualizando fuente:', error);
      throw new Error('No se pudo actualizar la fuente');
    }

    await this.logAudit('update_knowledge_source', { source_id: sourceId, updates }, memberId);

    return data;
  }

  async deleteSource(sourceId: string, memberId: number): Promise<boolean> {
    await this.setOrgContext();

    const { error: fragmentsError } = await supabase
      .from('knowledge_fragments')
      .delete()
      .eq('source_id', sourceId)
      .eq('organization_id', this.organizationId);

    if (fragmentsError) {
      console.error('Error eliminando fragmentos:', fragmentsError);
    }

    const { error } = await supabase
      .from('knowledge_sources')
      .delete()
      .eq('id', sourceId)
      .eq('organization_id', this.organizationId);

    if (error) {
      console.error('Error eliminando fuente:', error);
      return false;
    }

    await this.logAudit('delete_knowledge_source', { source_id: sourceId }, memberId);

    return true;
  }

  async toggleSourceStatus(sourceId: string, memberId: number): Promise<KnowledgeSource> {
    await this.setOrgContext();

    const source = await this.getSource(sourceId);
    if (!source) throw new Error('Fuente no encontrada');

    const { data, error } = await supabase
      .from('knowledge_sources')
      .update({
        is_active: !source.is_active,
        updated_at: new Date().toISOString()
      })
      .eq('id', sourceId)
      .eq('organization_id', this.organizationId)
      .select()
      .single();

    if (error) {
      console.error('Error cambiando estado:', error);
      throw new Error('No se pudo cambiar el estado');
    }

    await this.logAudit('toggle_knowledge_source', { source_id: sourceId, is_active: data.is_active }, memberId);

    return data;
  }

  async getFragments(filters?: FragmentFilters): Promise<KnowledgeFragment[]> {
    await this.setOrgContext();

    let query = supabase
      .from('knowledge_fragments')
      .select(`
        *,
        source:knowledge_sources(id, name, icon)
      `)
      .eq('organization_id', this.organizationId);

    if (filters?.sourceId) {
      query = query.eq('source_id', filters.sourceId);
    }

    if (filters?.search) {
      query = query.or(`title.ilike.%${filters.search}%,content.ilike.%${filters.search}%`);
    }

    if (filters?.tags && filters.tags.length > 0) {
      query = query.contains('tags', filters.tags);
    }

    if (filters?.isActive !== undefined) {
      query = query.eq('is_active', filters.isActive);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
      console.error('Error obteniendo fragmentos:', error);
      return [];
    }

    const fragmentsWithEmbeddings = await Promise.all(
      (data || []).map(async (fragment) => {
        const { count } = await supabase
          .from('knowledge_embeddings')
          .select('*', { count: 'exact', head: true })
          .eq('fragment_id', fragment.id)
          .eq('organization_id', this.organizationId);

        return {
          ...fragment,
          has_embedding: (count || 0) > 0
        };
      })
    );

    return fragmentsWithEmbeddings;
  }

  async createFragment(fragmentData: CreateFragmentData, memberId: number): Promise<KnowledgeFragment> {
    await this.setOrgContext();

    const { data, error } = await supabase
      .from('knowledge_fragments')
      .insert({
        organization_id: this.organizationId,
        source_id: fragmentData.source_id || null,
        title: fragmentData.title,
        content: fragmentData.content,
        tags: fragmentData.tags || [],
        priority: fragmentData.priority || 5,
        created_by: memberId
      })
      .select()
      .single();

    if (error) {
      console.error('Error creando fragmento:', error);
      throw new Error('No se pudo crear el fragmento');
    }

    if (fragmentData.source_id) {
      await this.updateFragmentCount(fragmentData.source_id);
    }

    await this.logAudit('create_knowledge_fragment', { fragment_id: data.id, title: data.title }, memberId);

    return data;
  }

  async updateFragment(fragmentId: string, updates: Partial<CreateFragmentData>, memberId: number): Promise<KnowledgeFragment> {
    await this.setOrgContext();

    const { data, error } = await supabase
      .from('knowledge_fragments')
      .update({
        ...updates,
        version: supabase.rpc('increment_version'),
        updated_at: new Date().toISOString()
      })
      .eq('id', fragmentId)
      .eq('organization_id', this.organizationId)
      .select()
      .single();

    if (error) {
      console.error('Error actualizando fragmento:', error);
      throw new Error('No se pudo actualizar el fragmento');
    }

    await this.logAudit('update_knowledge_fragment', { fragment_id: fragmentId, updates }, memberId);

    return data;
  }

  async deleteFragment(fragmentId: string, memberId: number): Promise<boolean> {
    await this.setOrgContext();

    const fragment = await this.getFragment(fragmentId);

    const { error: embeddingsError } = await supabase
      .from('knowledge_embeddings')
      .delete()
      .eq('fragment_id', fragmentId)
      .eq('organization_id', this.organizationId);

    if (embeddingsError) {
      console.error('Error eliminando embeddings:', embeddingsError);
    }

    const { error } = await supabase
      .from('knowledge_fragments')
      .delete()
      .eq('id', fragmentId)
      .eq('organization_id', this.organizationId);

    if (error) {
      console.error('Error eliminando fragmento:', error);
      return false;
    }

    if (fragment?.source_id) {
      await this.updateFragmentCount(fragment.source_id);
    }

    await this.logAudit('delete_knowledge_fragment', { fragment_id: fragmentId }, memberId);

    return true;
  }

  async getFragment(fragmentId: string): Promise<KnowledgeFragment | null> {
    await this.setOrgContext();

    const { data, error } = await supabase
      .from('knowledge_fragments')
      .select(`
        *,
        source:knowledge_sources(id, name, icon)
      `)
      .eq('id', fragmentId)
      .eq('organization_id', this.organizationId)
      .single();

    if (error) {
      console.error('Error obteniendo fragmento:', error);
      return null;
    }

    return data;
  }

  private async updateFragmentCount(sourceId: string): Promise<void> {
    const { count } = await supabase
      .from('knowledge_fragments')
      .select('*', { count: 'exact', head: true })
      .eq('source_id', sourceId)
      .eq('organization_id', this.organizationId);

    await supabase
      .from('knowledge_sources')
      .update({ fragment_count: count || 0 })
      .eq('id', sourceId);
  }

  async getStats(): Promise<KnowledgeStats> {
    await this.setOrgContext();

    const { count: totalSources } = await supabase
      .from('knowledge_sources')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', this.organizationId);

    const { count: activeSources } = await supabase
      .from('knowledge_sources')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', this.organizationId)
      .eq('is_active', true);

    const { count: totalFragments } = await supabase
      .from('knowledge_fragments')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', this.organizationId);

    const { count: indexedFragments } = await supabase
      .from('knowledge_embeddings')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', this.organizationId);

    return {
      totalSources: totalSources || 0,
      activeSources: activeSources || 0,
      totalFragments: totalFragments || 0,
      indexedFragments: indexedFragments || 0
    };
  }

  async getAllTags(): Promise<string[]> {
    await this.setOrgContext();

    const { data, error } = await supabase
      .from('knowledge_fragments')
      .select('tags')
      .eq('organization_id', this.organizationId);

    if (error) {
      console.error('Error obteniendo tags:', error);
      return [];
    }

    const allTags = new Set<string>();
    (data || []).forEach(fragment => {
      (fragment.tags || []).forEach((tag: string) => allTags.add(tag));
    });

    return Array.from(allTags).sort();
  }

  async toggleFragmentStatus(fragmentId: string, memberId: number): Promise<KnowledgeFragment> {
    await this.setOrgContext();

    const fragment = await this.getFragment(fragmentId);
    if (!fragment) throw new Error('Fragmento no encontrado');

    const { data, error } = await supabase
      .from('knowledge_fragments')
      .update({
        is_active: !fragment.is_active,
        updated_at: new Date().toISOString()
      })
      .eq('id', fragmentId)
      .eq('organization_id', this.organizationId)
      .select()
      .single();

    if (error) {
      console.error('Error cambiando estado del fragmento:', error);
      throw new Error('No se pudo cambiar el estado');
    }

    await this.logAudit('toggle_knowledge_fragment', { fragment_id: fragmentId, is_active: data.is_active }, memberId);

    return data;
  }

  async reindexFragments(sourceId: string, memberId: number): Promise<{ jobId: string }> {
    await this.setOrgContext();

    const fragments = await this.getFragments({ sourceId });
    
    for (const fragment of fragments) {
      await supabase
        .from('knowledge_embeddings')
        .delete()
        .eq('fragment_id', fragment.id)
        .eq('organization_id', this.organizationId);
    }

    const { data: job, error } = await supabase
      .from('ai_jobs')
      .insert({
        organization_id: this.organizationId,
        conversation_id: '00000000-0000-0000-0000-000000000000',
        job_type: 'reindex_knowledge',
        status: 'pending',
        metadata: {
          source_id: sourceId,
          fragment_ids: fragments.map(f => f.id),
          requested_by: memberId
        }
      })
      .select()
      .single();

    if (error) {
      console.error('Error creando job de reindexación:', error);
      throw new Error('No se pudo iniciar la reindexación');
    }

    await this.logAudit('reindex_knowledge_source', { source_id: sourceId, job_id: job.id }, memberId);

    return { jobId: job.id };
  }

  async getSourceWithStats(sourceId: string): Promise<KnowledgeSource & { indexedCount: number; totalCount: number } | null> {
    await this.setOrgContext();

    const source = await this.getSource(sourceId);
    if (!source) return null;

    const fragments = await this.getFragments({ sourceId });
    const indexedCount = fragments.filter(f => f.has_embedding).length;

    return {
      ...source,
      indexedCount,
      totalCount: fragments.length
    };
  }

  async getFragmentWithEmbedding(fragmentId: string): Promise<KnowledgeFragment & { embedding_info: EmbeddingInfo | null } | null> {
    await this.setOrgContext();

    const fragment = await this.getFragment(fragmentId);
    if (!fragment) return null;

    const { data: embedding } = await supabase
      .from('knowledge_embeddings')
      .select('id, model, created_at, updated_at')
      .eq('fragment_id', fragmentId)
      .eq('organization_id', this.organizationId)
      .single();

    return {
      ...fragment,
      has_embedding: !!embedding,
      embedding_info: embedding ? {
        id: embedding.id,
        model: embedding.model,
        created_at: embedding.created_at,
        updated_at: embedding.updated_at
      } : null
    };
  }

  async reindexSingleFragment(fragmentId: string, memberId: number): Promise<{ jobId: string }> {
    await this.setOrgContext();

    const fragment = await this.getFragment(fragmentId);
    if (!fragment) throw new Error('Fragmento no encontrado');

    await supabase
      .from('knowledge_embeddings')
      .delete()
      .eq('fragment_id', fragmentId)
      .eq('organization_id', this.organizationId);

    const { data: job, error } = await supabase
      .from('ai_jobs')
      .insert({
        organization_id: this.organizationId,
        conversation_id: '00000000-0000-0000-0000-000000000000',
        job_type: 'reindex_knowledge',
        status: 'pending',
        metadata: {
          fragment_id: fragmentId,
          fragment_ids: [fragmentId],
          requested_by: memberId
        }
      })
      .select()
      .single();

    if (error) {
      console.error('Error creando job de reindexación:', error);
      throw new Error('No se pudo iniciar la reindexación');
    }

    await this.logAudit('reindex_knowledge_fragment', { fragment_id: fragmentId, job_id: job.id }, memberId);

    return { jobId: job.id };
  }

  async updateFragmentWithVersion(fragmentId: string, updates: Partial<CreateFragmentData>, memberId: number): Promise<KnowledgeFragment> {
    await this.setOrgContext();

    const currentFragment = await this.getFragment(fragmentId);
    if (!currentFragment) throw new Error('Fragmento no encontrado');

    const newVersion = (currentFragment.version || 1) + 1;
    const contentHash = await this.generateContentHash(updates.content || currentFragment.content);

    const { data, error } = await supabase
      .from('knowledge_fragments')
      .update({
        ...updates,
        version: newVersion,
        content_hash: contentHash,
        updated_at: new Date().toISOString()
      })
      .eq('id', fragmentId)
      .eq('organization_id', this.organizationId)
      .select()
      .single();

    if (error) {
      console.error('Error actualizando fragmento:', error);
      throw new Error('No se pudo actualizar el fragmento');
    }

    await this.logAudit('update_knowledge_fragment_version', { 
      fragment_id: fragmentId, 
      old_version: currentFragment.version,
      new_version: newVersion,
      updates 
    }, memberId);

    return data;
  }

  private async generateContentHash(content: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async importFragments(
    fragments: ImportFragmentData[],
    sourceId: string | null,
    memberId: number,
    generateEmbeddings: boolean = true
  ): Promise<ImportResult> {
    await this.setOrgContext();

    const result: ImportResult = {
      success: false,
      totalProcessed: fragments.length,
      successCount: 0,
      errorCount: 0,
      errors: [],
      fragmentIds: []
    };

    const fragmentsToInsert = [];

    for (let i = 0; i < fragments.length; i++) {
      const fragment = fragments[i];
      
      if (!fragment.title?.trim()) {
        result.errors.push({ row: i + 1, message: 'El título es obligatorio' });
        result.errorCount++;
        continue;
      }

      if (!fragment.content?.trim()) {
        result.errors.push({ row: i + 1, message: 'El contenido es obligatorio' });
        result.errorCount++;
        continue;
      }

      const contentHash = await this.generateContentHash(fragment.content.trim());

      fragmentsToInsert.push({
        organization_id: this.organizationId,
        source_id: sourceId,
        title: fragment.title.trim(),
        content: fragment.content.trim(),
        tags: fragment.tags || [],
        priority: fragment.priority || 5,
        content_hash: contentHash,
        version: 1,
        created_by: memberId
      });
    }

    if (fragmentsToInsert.length === 0) {
      result.success = false;
      return result;
    }

    const { data: insertedFragments, error } = await supabase
      .from('knowledge_fragments')
      .insert(fragmentsToInsert)
      .select('id');

    if (error) {
      console.error('Error importando fragmentos:', error);
      result.errors.push({ row: 0, message: `Error de base de datos: ${error.message}` });
      return result;
    }

    result.fragmentIds = (insertedFragments || []).map(f => f.id);
    result.successCount = result.fragmentIds.length;
    result.success = result.successCount > 0;

    if (sourceId) {
      await this.updateFragmentCount(sourceId);
    }

    if (generateEmbeddings && result.fragmentIds.length > 0) {
      const { data: job, error: jobError } = await supabase
        .from('ai_jobs')
        .insert({
          organization_id: this.organizationId,
          conversation_id: '00000000-0000-0000-0000-000000000000',
          job_type: 'generate_embeddings',
          status: 'pending',
          metadata: {
            fragment_ids: result.fragmentIds,
            requested_by: memberId,
            import_batch: true
          }
        })
        .select()
        .single();

      if (!jobError && job) {
        result.jobId = job.id;
      }
    }

    await this.logAudit('import_knowledge_fragments', {
      source_id: sourceId,
      count: result.successCount,
      fragment_ids: result.fragmentIds,
      job_id: result.jobId
    }, memberId);

    return result;
  }

  parseCSV(csvContent: string): ImportFragmentData[] {
    const lines = csvContent.split('\n').filter(line => line.trim());
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const titleIndex = headers.findIndex(h => h === 'title' || h === 'titulo' || h === 'título');
    const contentIndex = headers.findIndex(h => h === 'content' || h === 'contenido');
    const tagsIndex = headers.findIndex(h => h === 'tags' || h === 'etiquetas');
    const priorityIndex = headers.findIndex(h => h === 'priority' || h === 'prioridad');

    if (titleIndex === -1 || contentIndex === -1) {
      throw new Error('El CSV debe tener columnas "title" y "content"');
    }

    const fragments: ImportFragmentData[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = this.parseCSVLine(lines[i]);
      if (values.length <= Math.max(titleIndex, contentIndex)) continue;

      const title = values[titleIndex]?.trim();
      const content = values[contentIndex]?.trim();

      if (!title || !content) continue;

      const fragment: ImportFragmentData = { title, content };

      if (tagsIndex !== -1 && values[tagsIndex]) {
        fragment.tags = values[tagsIndex].split(';').map(t => t.trim()).filter(Boolean);
      }

      if (priorityIndex !== -1 && values[priorityIndex]) {
        const priority = parseInt(values[priorityIndex]);
        if (!isNaN(priority) && priority >= 1 && priority <= 10) {
          fragment.priority = priority;
        }
      }

      fragments.push(fragment);
    }

    return fragments;
  }

  private parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    
    result.push(current);
    return result;
  }

  parseTextBlocks(textContent: string, separator: string = '---'): ImportFragmentData[] {
    const blocks = textContent.split(separator).filter(block => block.trim());
    
    return blocks.map(block => {
      const lines = block.trim().split('\n');
      const title = lines[0]?.trim() || 'Sin título';
      const content = lines.slice(1).join('\n').trim() || lines[0]?.trim() || '';
      
      return { title, content };
    });
  }

  private async logAudit(action: string, details: Record<string, any>, memberId: number): Promise<void> {
    try {
      await supabase.from('chat_audit_logs').insert({
        organization_id: this.organizationId,
        actor_type: 'member',
        actor_id: null,
        action,
        entity_type: 'knowledge',
        entity_id: details.source_id || details.fragment_id || null,
        changes: details,
        metadata: {},
        ip_address: null,
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null
      });
    } catch (error) {
      console.error('Error logging audit:', error);
    }
  }
}
