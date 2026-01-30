import { supabase } from '@/lib/supabase/config';

export interface AIJob {
  id: string;
  organization_id: number;
  conversation_id: string;
  trigger_message_id: string | null;
  job_type: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  result_message_id: string | null;
  response_text: string | null;
  confidence_score: number | null;
  fragments_used: string[] | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_cost: number | null;
  error_code: string | null;
  error_message: string | null;
  metadata: Record<string, any>;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface AIJobStats {
  total: number;
  pending: number;
  running: number;
  completed: number;
  failed: number;
  cancelled: number;
}

export interface JobFilters {
  status?: string;
  jobType?: string;
  dateFrom?: string;
  dateTo?: string;
}

export const JOB_STATUS_OPTIONS = [
  { value: 'pending', label: 'Pendiente', color: 'yellow' },
  { value: 'running', label: 'Ejecutando', color: 'blue' },
  { value: 'completed', label: 'Completado', color: 'green' },
  { value: 'failed', label: 'Fallido', color: 'red' },
  { value: 'cancelled', label: 'Cancelado', color: 'gray' }
];

export const JOB_TYPE_OPTIONS = [
  { value: 'generate_response', label: 'Generar Respuesta' },
  { value: 'generate_embeddings', label: 'Generar Embeddings' },
  { value: 'reindex_knowledge', label: 'Reindexar Conocimiento' },
  { value: 'summarize', label: 'Resumir' },
  { value: 'classify', label: 'Clasificar' }
];

export default class AIJobsService {
  private organizationId: number;

  constructor(organizationId: number) {
    this.organizationId = organizationId;
  }

  private async setOrgContext() {
    await supabase.rpc('set_org_context', { org_id: this.organizationId });
  }

  async getJobs(filters?: JobFilters, limit: number = 50): Promise<AIJob[]> {
    await this.setOrgContext();

    let query = supabase
      .from('ai_jobs')
      .select('*')
      .eq('organization_id', this.organizationId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (filters?.status && filters.status !== 'all') {
      query = query.eq('status', filters.status);
    }

    if (filters?.jobType && filters.jobType !== 'all') {
      query = query.eq('job_type', filters.jobType);
    }

    if (filters?.dateFrom) {
      query = query.gte('created_at', filters.dateFrom);
    }

    if (filters?.dateTo) {
      query = query.lte('created_at', filters.dateTo);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error obteniendo jobs:', error);
      return [];
    }

    return data || [];
  }

  async getJob(jobId: string): Promise<AIJob | null> {
    await this.setOrgContext();

    const { data, error } = await supabase
      .from('ai_jobs')
      .select('*')
      .eq('id', jobId)
      .eq('organization_id', this.organizationId)
      .single();

    if (error) {
      console.error('Error obteniendo job:', error);
      return null;
    }

    return data;
  }

  async getStats(): Promise<AIJobStats> {
    await this.setOrgContext();

    const { data, error } = await supabase
      .from('ai_jobs')
      .select('status')
      .eq('organization_id', this.organizationId);

    if (error) {
      console.error('Error obteniendo estadísticas:', error);
      return { total: 0, pending: 0, running: 0, completed: 0, failed: 0, cancelled: 0 };
    }

    const jobs = data || [];
    return {
      total: jobs.length,
      pending: jobs.filter(j => j.status === 'pending').length,
      running: jobs.filter(j => j.status === 'running').length,
      completed: jobs.filter(j => j.status === 'completed').length,
      failed: jobs.filter(j => j.status === 'failed').length,
      cancelled: jobs.filter(j => j.status === 'cancelled').length
    };
  }

  async retryJob(jobId: string, memberId: number): Promise<AIJob> {
    await this.setOrgContext();

    const existingJob = await this.getJob(jobId);
    if (!existingJob) {
      throw new Error('Job no encontrado');
    }

    if (existingJob.status !== 'failed') {
      throw new Error('Solo se pueden reintentar jobs fallidos');
    }

    const { data: newJob, error } = await supabase
      .from('ai_jobs')
      .insert({
        organization_id: this.organizationId,
        conversation_id: existingJob.conversation_id,
        trigger_message_id: existingJob.trigger_message_id,
        job_type: existingJob.job_type,
        status: 'pending',
        metadata: {
          ...existingJob.metadata,
          retry_of: jobId,
          retried_by: memberId
        }
      })
      .select()
      .single();

    if (error) {
      console.error('Error reintentando job:', error);
      throw new Error('No se pudo reintentar el job');
    }

    await this.logAudit('retry_ai_job', { 
      original_job_id: jobId, 
      new_job_id: newJob.id 
    }, memberId);

    return newJob;
  }

  async cancelJob(jobId: string, memberId: number): Promise<AIJob> {
    await this.setOrgContext();

    const existingJob = await this.getJob(jobId);
    if (!existingJob) {
      throw new Error('Job no encontrado');
    }

    if (existingJob.status !== 'pending' && existingJob.status !== 'running') {
      throw new Error('Solo se pueden cancelar jobs pendientes o en ejecución');
    }

    const { data, error } = await supabase
      .from('ai_jobs')
      .update({
        status: 'cancelled',
        completed_at: new Date().toISOString(),
        error_message: 'Cancelado por el usuario'
      })
      .eq('id', jobId)
      .eq('organization_id', this.organizationId)
      .select()
      .single();

    if (error) {
      console.error('Error cancelando job:', error);
      throw new Error('No se pudo cancelar el job');
    }

    await this.logAudit('cancel_ai_job', { job_id: jobId }, memberId);

    return data;
  }

  async getJobLogs(jobId: string): Promise<string[]> {
    const job = await this.getJob(jobId);
    if (!job) return [];

    const logs: string[] = [];

    logs.push(`[${job.created_at}] Job creado - Tipo: ${job.job_type}`);

    if (job.started_at) {
      logs.push(`[${job.started_at}] Job iniciado`);
    }

    if (job.metadata?.retry_of) {
      logs.push(`[INFO] Este job es un reintento de ${job.metadata.retry_of}`);
    }

    if (job.prompt_tokens || job.completion_tokens) {
      logs.push(`[INFO] Tokens usados: ${job.prompt_tokens || 0} prompt + ${job.completion_tokens || 0} completion`);
    }

    if (job.confidence_score !== null) {
      logs.push(`[INFO] Confianza: ${(job.confidence_score * 100).toFixed(1)}%`);
    }

    if (job.fragments_used && job.fragments_used.length > 0) {
      logs.push(`[INFO] Fragmentos usados: ${job.fragments_used.length}`);
    }

    if (job.error_code || job.error_message) {
      logs.push(`[ERROR] ${job.error_code || 'ERROR'}: ${job.error_message || 'Error desconocido'}`);
    }

    if (job.completed_at) {
      logs.push(`[${job.completed_at}] Job ${job.status === 'completed' ? 'completado' : job.status}`);
    }

    return logs;
  }

  private async logAudit(action: string, details: Record<string, any>, memberId: number): Promise<void> {
    try {
      await supabase.from('chat_audit_logs').insert({
        organization_id: this.organizationId,
        actor_type: 'member',
        actor_id: null,
        action,
        entity_type: 'ai_job',
        entity_id: details.job_id || details.new_job_id || null,
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
