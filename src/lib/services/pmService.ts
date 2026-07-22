'use client';

import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';

// ─── Types ──────────────────────────────────────────────
export interface Project {
  id: string;
  organization_id: number;
  name: string;
  description: string | null;
  status: 'draft' | 'active' | 'on_hold' | 'completed' | 'cancelled';
  priority: 'low' | 'med' | 'high' | 'critical';
  start_date: string | null;
  end_date: string | null;
  budget: number | null;
  owner_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Campos profesionales (Asana/Jira style)
  progress?: number;
  color?: string | null;
  code?: string | null;
  category?: string | null;
  tags?: string[];
  actual_cost?: number | null;
  health?: 'on_track' | 'at_risk' | 'off_track' | null;
}

export interface Goal {
  id: string;
  organization_id: number;
  project_id: string | null;
  title: string;
  description: string | null;
  type: 'goal' | 'purpose' | 'proposal';
  status: 'draft' | 'active' | 'achieved' | 'abandoned';
  target_date: string | null;
  progress: number;
  owner_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Campos profesionales
  start_date?: string | null;
  complexity?: 'low' | 'med' | 'high' | null;
  priority?: 'low' | 'med' | 'high' | 'urgent' | null;
  projects?: { name: string } | null;
  key_results?: KeyResult[];
}

export interface KeyResult {
  id: string;
  organization_id: number;
  goal_id: string;
  title: string;
  description: string | null;
  metric_type: 'number' | 'percentage' | 'currency' | 'boolean';
  start_value: number;
  current_value: number;
  target_value: number | null;
  unit: string | null;
  progress: number;
  status: 'active' | 'achieved' | 'at_risk' | 'abandoned';
  due_date: string | null;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Milestone {
  id: string;
  organization_id: number;
  project_id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  is_completed: boolean;
  completed_at: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface PMTask {
  id: string;
  title: string;
  description: string | null;
  type: string | null;
  status: string;
  priority: string;
  due_date: string | null;
  start_time: string | null;
  project_id: string | null;
  milestone_id: string | null;
  goal_id: string | null;
  key_result_id: string | null;
  parent_task_id: string | null;
  related_to_type?: string | null;
  related_to_id?: string | null;
  customer_id?: string | null;
  estimated_hours: number | null;
  actual_hours: number | null;
  tags: string[];
  assigned_to: string | null;
  organization_id: number;
  created_at: string;
  updated_at: string;
  projects?: { id: string; name: string } | null;
  milestones?: { id: string; title: string } | null;
  goals?: { id: string; title: string } | null;
  profiles?: { first_name: string; last_name: string; email: string } | null;
  subtasks?: PMTask[];
  parent_task?: { id: string; title: string; status: string } | null;
}

export interface TaskTimeEntry {
  id: string;
  organization_id: number;
  task_id: string;
  user_id: string | null;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  note: string | null;
  created_at: string;
}

export interface PMDashboardStats {
  projects: { total: number; active: number; completed: number; onHold: number };
  goals: { total: number; active: number; achieved: number };
  tasks: { total: number; open: number; inProgress: number; done: number; overdue: number };
  milestones: { total: number; completed: number; pending: number };
}

// ─── Labels ─────────────────────────────────────────────
export const PROJECT_STATUS_LABELS: Record<string, string> = {
  draft: 'Borrador', active: 'Activo', on_hold: 'En Pausa', completed: 'Completado', cancelled: 'Cancelado',
};
export const PROJECT_STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  active: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  on_hold: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
  completed: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  cancelled: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};
export const PRIORITY_LABELS: Record<string, string> = {
  low: 'Baja', med: 'Media', high: 'Alta', critical: 'Crítica',
};
export const PRIORITY_COLORS: Record<string, string> = {
  low: 'bg-gray-100 text-gray-600', med: 'bg-blue-100 text-blue-600',
  high: 'bg-orange-100 text-orange-600', critical: 'bg-red-100 text-red-600',
};
export const TASK_STATUS_LABELS: Record<string, string> = {
  open: 'Pendiente', in_progress: 'En Progreso', done: 'Completada', canceled: 'Cancelada',
};
export const TASK_TYPE_LABELS: Record<string, string> = {
  // PM
  onboarding: 'Onboarding', operational: 'Operativa', reminder: 'Recordatorio',
  // CRM
  meeting: 'Reunión', call: 'Llamada', email: 'Email', visit: 'Visita',
  // Generales
  tarea: 'Tarea', seguimiento: 'Seguimiento', revision: 'Revisión', entrega: 'Entrega',
  investigacion: 'Investigación', documento: 'Documento', bug: 'Bug', feature: 'Feature',
};
export const TASK_STATUS_COLORS: Record<string, string> = {
  open: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  in_progress: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
  done: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  canceled: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};

// ─── Service ────────────────────────────────────────────
export const pmService = {
  // ─── Dashboard Stats ─────────────
  async getDashboardStats(): Promise<PMDashboardStats> {
    const orgId = getOrganizationId();
    if (!orgId) return { projects: { total: 0, active: 0, completed: 0, onHold: 0 }, goals: { total: 0, active: 0, achieved: 0 }, tasks: { total: 0, open: 0, inProgress: 0, done: 0, overdue: 0 }, milestones: { total: 0, completed: 0, pending: 0 } };

    const safeQuery = async <T>(query: Promise<{ data: T[] | null; error: any }>): Promise<T[]> => {
      try { const { data, error } = await query; if (error) { console.warn('PM query error:', error.message); return []; } return data || []; }
      catch { return []; }
    };

    const [projects, goals, tasks, milestones] = await Promise.all([
      safeQuery(supabase.from('projects').select('status').eq('organization_id', orgId)),
      safeQuery(supabase.from('goals').select('status').eq('organization_id', orgId)),
      safeQuery(supabase.from('tasks').select('status, due_date, project_id').eq('organization_id', orgId)),
      safeQuery(supabase.from('milestones').select('is_completed').eq('organization_id', orgId)),
    ]);

    const now = new Date().toISOString();

    return {
      projects: {
        total: projects.length,
        active: projects.filter((p: any) => p.status === 'active').length,
        completed: projects.filter((p: any) => p.status === 'completed').length,
        onHold: projects.filter((p: any) => p.status === 'on_hold').length,
      },
      goals: {
        total: goals.length,
        active: goals.filter((g: any) => g.status === 'active').length,
        achieved: goals.filter((g: any) => g.status === 'achieved').length,
      },
      tasks: {
        total: tasks.length,
        open: tasks.filter((t: any) => t.status === 'open').length,
        inProgress: tasks.filter((t: any) => t.status === 'in_progress').length,
        done: tasks.filter((t: any) => t.status === 'done').length,
        overdue: tasks.filter((t: any) => t.due_date && t.due_date < now && t.status !== 'done' && t.status !== 'canceled').length,
      },
      milestones: {
        total: milestones.length,
        completed: milestones.filter((m: any) => m.is_completed).length,
        pending: milestones.filter((m: any) => !m.is_completed).length,
      },
    };
  },

  // ─── Projects CRUD ───────────────
  async getProjects(filters?: { status?: string }): Promise<Project[]> {
    const orgId = getOrganizationId();
    if (!orgId) return [];
    let query = supabase.from('projects').select('*').eq('organization_id', orgId).order('created_at', { ascending: false });
    if (filters?.status && filters.status !== 'all') query = query.eq('status', filters.status);
    const { data, error } = await query;
    if (error) { console.error('Error getProjects:', error.message); return []; }
    return data || [];
  },

  async createProject(project: Partial<Project>): Promise<Project> {
    const orgId = getOrganizationId();
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.from('projects').insert({
      ...project, organization_id: orgId, created_by: user?.id,
    }).select().single();
    if (error) throw error;
    return data;
  },

  async updateProject(id: string, updates: Partial<Project>): Promise<Project> {
    const { data, error } = await supabase.from('projects').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },

  // ─── Goals CRUD ──────────────────
  async getGoals(filters?: { type?: string }): Promise<Goal[]> {
    const orgId = getOrganizationId();
    if (!orgId) return [];
    let query = supabase.from('goals').select('*, projects(name)').eq('organization_id', orgId).order('created_at', { ascending: false });
    if (filters?.type && filters.type !== 'all') query = query.eq('type', filters.type);
    const { data, error } = await query;
    if (error) { console.error('Error getGoals:', error.message); return []; }
    return data || [];
  },

  async createGoal(goal: Partial<Goal>): Promise<Goal> {
    const orgId = getOrganizationId();
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.from('goals').insert({
      ...goal, organization_id: orgId, created_by: user?.id,
    }).select().single();
    if (error) throw error;
    return data;
  },

  async updateGoal(id: string, updates: Partial<Goal>): Promise<Goal> {
    const { data, error } = await supabase.from('goals').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },

  async deleteGoal(id: string): Promise<void> {
    const { error } = await supabase.from('goals').delete().eq('id', id);
    if (error) throw error;
  },

  // ─── Key Results (KRs) ───────────
  async getKeyResults(goalId: string): Promise<KeyResult[]> {
    const { data, error } = await supabase.from('key_results').select('*').eq('goal_id', goalId).order('sort_order');
    if (error) { console.error('Error getKeyResults:', error.message); return []; }
    return data || [];
  },

  async createKeyResult(goalId: string, kr: Partial<KeyResult>): Promise<KeyResult> {
    const orgId = getOrganizationId();
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.from('key_results').insert({
      goal_id: goalId,
      organization_id: orgId,
      title: kr.title,
      description: kr.description ?? null,
      metric_type: kr.metric_type || 'number',
      start_value: kr.start_value ?? 0,
      current_value: kr.current_value ?? 0,
      target_value: kr.target_value ?? null,
      unit: kr.unit ?? null,
      progress: kr.progress ?? 0,
      status: kr.status || 'active',
      due_date: kr.due_date ?? null,
      sort_order: kr.sort_order ?? 0,
      created_by: user?.id,
    }).select().single();
    if (error) throw error;
    await this.recalcGoalProgress(goalId);
    return data;
  },

  async updateKeyResult(id: string, updates: Partial<KeyResult>): Promise<KeyResult> {
    // Recalcular progreso de la KR si cambian valores numéricos
    const patch: any = { ...updates, updated_at: new Date().toISOString() };
    if (updates.current_value != null || updates.target_value != null || updates.start_value != null) {
      const { data: existing } = await supabase.from('key_results').select('start_value, current_value, target_value').eq('id', id).single();
      const start = updates.start_value ?? existing?.start_value ?? 0;
      const current = updates.current_value ?? existing?.current_value ?? 0;
      const target = updates.target_value ?? existing?.target_value ?? null;
      if (target != null && target !== start) {
        patch.progress = Math.max(0, Math.min(100, Math.round(((current - start) / (target - start)) * 100)));
      }
    }
    const { data, error } = await supabase.from('key_results').update(patch).eq('id', id).select().single();
    if (error) throw error;
    if (data?.goal_id) await this.recalcGoalProgress(data.goal_id);
    return data;
  },

  async deleteKeyResult(id: string): Promise<void> {
    const { data } = await supabase.from('key_results').select('goal_id').eq('id', id).single();
    const { error } = await supabase.from('key_results').delete().eq('id', id);
    if (error) throw error;
    if (data?.goal_id) await this.recalcGoalProgress(data.goal_id);
  },

  // Recalcula el progreso de la meta combinando el avance de sus KRs y de las tareas vinculadas
  async recalcGoalProgress(goalId: string): Promise<void> {
    const { data: krs } = await supabase.from('key_results').select('progress').eq('goal_id', goalId);
    const { data: gtasks } = await supabase.from('tasks').select('status, estimated_hours').eq('goal_id', goalId);
    const metrics: number[] = [];
    if (krs && krs.length > 0) {
      metrics.push(Math.round(krs.reduce((s, k) => s + (Number(k.progress) || 0), 0) / krs.length));
    }
    if (gtasks && gtasks.length > 0) {
      const weight = (t: any) => Number(t.estimated_hours) || 1;
      const totalW = gtasks.reduce((s, t) => s + weight(t), 0);
      const doneW = gtasks.filter(t => t.status === 'done').reduce((s, t) => s + weight(t), 0);
      metrics.push(totalW > 0 ? Math.round((doneW / totalW) * 100) : 0);
    }
    if (metrics.length === 0) return;
    const progress = Math.round(metrics.reduce((s, m) => s + m, 0) / metrics.length);
    await supabase.from('goals').update({ progress, updated_at: new Date().toISOString() }).eq('id', goalId);
  },

  // Recalcula el progreso de un KR a partir de sus tareas completadas (ponderado por horas estimadas)
  async recalcKeyResultProgress(keyResultId: string): Promise<void> {
    const { data: tasks } = await supabase.from('tasks').select('status, estimated_hours').eq('key_result_id', keyResultId);
    const { data: kr } = await supabase.from('key_results').select('goal_id').eq('id', keyResultId).single();
    if (tasks && tasks.length > 0) {
      const weight = (t: any) => Number(t.estimated_hours) || 1;
      const totalW = tasks.reduce((s, t) => s + weight(t), 0);
      const doneW = tasks.filter(t => t.status === 'done').reduce((s, t) => s + weight(t), 0);
      const progress = totalW > 0 ? Math.round((doneW / totalW) * 100) : 0;
      await supabase.from('key_results').update({
        progress,
        status: progress >= 100 ? 'achieved' : 'active',
        updated_at: new Date().toISOString(),
      }).eq('id', keyResultId);
    }
    if (kr?.goal_id) await this.recalcGoalProgress(kr.goal_id);
  },

  // Tareas de un resultado clave (KR)
  async getKeyResultTasks(keyResultId: string): Promise<PMTask[]> {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('key_result_id', keyResultId)
      .is('parent_task_id', null)
      .order('due_date', { ascending: true, nullsFirst: false });
    if (error) { console.error('Error getKeyResultTasks:', error.message); return []; }
    return this._enrichWithProfiles(data || []);
  },

  async deleteProject(id: string): Promise<void> {
    const { error } = await supabase.from('projects').delete().eq('id', id);
    if (error) throw error;
  },

  async deleteTask(id: string): Promise<void> {
    const { data: t } = await supabase.from('tasks').select('project_id, goal_id, key_result_id').eq('id', id).single();
    const { error } = await supabase.from('tasks').delete().eq('id', id);
    if (error) throw error;
    if (t?.key_result_id) await this.recalcKeyResultProgress(t.key_result_id);
    if (t?.project_id) await this.recalcProjectProgress(t.project_id);
    if (t?.goal_id) await this.recalcGoalProgress(t.goal_id);
  },

  // ─── Milestones CRUD ─────────────
  async getMilestones(projectId?: string): Promise<Milestone[]> {
    const orgId = getOrganizationId();
    let query = supabase.from('milestones').select('*').eq('organization_id', orgId).order('sort_order');
    if (projectId) query = query.eq('project_id', projectId);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  async createMilestone(milestone: Partial<Milestone>): Promise<Milestone> {
    const orgId = getOrganizationId();
    const { data, error } = await supabase.from('milestones').insert({
      ...milestone, organization_id: orgId,
    }).select().single();
    if (error) throw error;
    return data;
  },

  // ─── PM Tasks ────────────────────
  async getTasks(filters?: { status?: string; projectId?: string; assignedTo?: string; type?: string; customerId?: string; module?: string }): Promise<PMTask[]> {
    const orgId = getOrganizationId();
    if (!orgId) return [];

    // Query sin join a profiles para evitar errores de FK indirecto
    // No filtrar por project_id IS NOT NULL: las tareas creadas por IA Planner
    // sin proyecto asignado deben ser visibles. El filtro de proyecto se aplica
    // vía el dropdown si el usuario lo selecciona.
    let query = supabase
      .from('tasks')
      .select('*, projects(id, name), milestones(id, title), goals(id, title), parent_task:tasks!parent_task_id(id, title, status)')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false });

    if (filters?.status && filters.status !== 'all') query = query.eq('status', filters.status);
    if (filters?.projectId && filters.projectId !== 'all') query = query.eq('project_id', filters.projectId);
    if (filters?.assignedTo) query = query.eq('assigned_to', filters.assignedTo);
    if (filters?.type && filters.type !== 'all') query = query.eq('type', filters.type);
    if (filters?.customerId && filters.customerId !== 'all') query = query.eq('customer_id', filters.customerId);

    const { data, error } = await query;
    if (error) { console.error('Error getTasks:', error.message); return []; }

    // Normalizar parent_task: Supabase devuelve array en self-referencing joins
    let tasks = (data || []).map((t: any) => ({
      ...t,
      parent_task: Array.isArray(t.parent_task) ? (t.parent_task[0] || null) : t.parent_task
    }));

    // Filtro por módulo (post-query, en cliente)
    if (filters?.module === 'crm') {
      tasks = tasks.filter(t =>
        ['llamada','reunion','email','visita','call','meeting'].includes(t.type || '') ||
        !!t.customer_id ||
        ['cliente','customer','oportunidad'].includes(t.related_to_type || '')
      );
    } else if (filters?.module === 'projects') {
      tasks = tasks.filter(t => !!t.project_id);
    } else if (filters?.module === 'general') {
      tasks = tasks.filter(t =>
        !t.project_id &&
        !t.customer_id &&
        !['llamada','reunion','email','visita','call','meeting'].includes(t.type || '')
      );
    }
    const userIds = Array.from(new Set(tasks.filter(t => t.assigned_to).map(t => t.assigned_to)));
    if (userIds.length > 0) {
      const { data: profiles } = await supabase.from('profiles').select('id, first_name, last_name, email').in('id', userIds);
      const profileMap = new Map((profiles || []).map(p => [p.id, p]));
      tasks.forEach(t => { if (t.assigned_to && profileMap.has(t.assigned_to)) t.profiles = profileMap.get(t.assigned_to); });
    }
    return tasks;
  },

  // Enriquece una lista de tareas con el perfil del responsable (assigned_to)
  async _enrichWithProfiles(tasks: PMTask[]): Promise<PMTask[]> {
    const userIds = Array.from(new Set(tasks.filter(t => t.assigned_to).map(t => t.assigned_to as string)));
    if (userIds.length > 0) {
      const { data: profiles } = await supabase.from('profiles').select('id, first_name, last_name, email').in('id', userIds);
      const profileMap = new Map((profiles || []).map(p => [p.id, p]));
      tasks.forEach(t => { if (t.assigned_to && profileMap.has(t.assigned_to)) t.profiles = profileMap.get(t.assigned_to); });
    }
    return tasks;
  },

  // Tareas de un proyecto (para mostrar en el drawer de proyecto)
  async getProjectTasks(projectId: string): Promise<PMTask[]> {
    const { data, error } = await supabase
      .from('tasks')
      .select('*, goals(id, title)')
      .eq('project_id', projectId)
      .is('parent_task_id', null)
      .order('due_date', { ascending: true, nullsFirst: false });
    if (error) { console.error('Error getProjectTasks:', error.message); return []; }
    return this._enrichWithProfiles(data || []);
  },

  // Tareas de una meta (para mostrar en el drawer de meta)
  async getGoalTasks(goalId: string): Promise<PMTask[]> {
    const { data, error } = await supabase
      .from('tasks')
      .select('*, projects(id, name)')
      .eq('goal_id', goalId)
      .is('parent_task_id', null)
      .order('due_date', { ascending: true, nullsFirst: false });
    if (error) { console.error('Error getGoalTasks:', error.message); return []; }
    return this._enrichWithProfiles(data || []);
  },

  // Construye los campos de cierre al cambiar el estado de una tarea.
  // Al completar: fija completed_at y, si no hay horas reales, usa las estimadas.
  async buildCompletionPatch(taskId: string, status: string): Promise<Record<string, any>> {
    if (status === 'done') {
      const { data } = await supabase.from('tasks').select('estimated_hours, actual_hours').eq('id', taskId).single();
      const patch: Record<string, any> = { completed_at: new Date().toISOString() };
      if (data?.actual_hours == null || Number(data.actual_hours) === 0) patch.actual_hours = data?.estimated_hours ?? null;
      return patch;
    }
    return { completed_at: null };
  },

  async updateTaskStatus(taskId: string, status: string): Promise<void> {
    const patch = await this.buildCompletionPatch(taskId, status);
    const { error } = await supabase.from('tasks').update({ status, ...patch, updated_at: new Date().toISOString() }).eq('id', taskId);
    if (error) throw error;
    const { data: t } = await supabase.from('tasks').select('project_id, goal_id, key_result_id').eq('id', taskId).single();
    if (t?.key_result_id) await this.recalcKeyResultProgress(t.key_result_id);
    if (t?.project_id) await this.recalcProjectProgress(t.project_id);
    if (t?.goal_id) await this.recalcGoalProgress(t.goal_id);
  },

  async updateTask(taskId: string, updates: Record<string, any>): Promise<void> {
    let patch: Record<string, any> = { ...updates };
    if (updates.status) patch = { ...patch, ...(await this.buildCompletionPatch(taskId, updates.status)) };
    const { error } = await supabase.from('tasks').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', taskId);
    if (error) throw error;
    if (updates.status || updates.project_id || updates.goal_id || updates.key_result_id || updates.estimated_hours != null) {
      const { data: t } = await supabase.from('tasks').select('project_id, goal_id, key_result_id').eq('id', taskId).single();
      if (t?.key_result_id) await this.recalcKeyResultProgress(t.key_result_id);
      if (t?.project_id) await this.recalcProjectProgress(t.project_id);
      if (t?.goal_id) await this.recalcGoalProgress(t.goal_id);
    }
  },

  // Recalcula el progreso del proyecto ponderado por horas estimadas (fallback: conteo)
  async recalcProjectProgress(projectId: string): Promise<void> {
    const { data } = await supabase.from('tasks').select('status, estimated_hours').eq('project_id', projectId);
    if (!data || data.length === 0) return;
    const weight = (t: any) => Number(t.estimated_hours) || 1;
    const totalW = data.reduce((s, t) => s + weight(t), 0);
    const doneW = data.filter(t => t.status === 'done').reduce((s, t) => s + weight(t), 0);
    const progress = totalW > 0 ? Math.round((doneW / totalW) * 100) : 0;
    await supabase.from('projects').update({ progress, updated_at: new Date().toISOString() }).eq('id', projectId);
  },

  async createTask(task: Record<string, any>): Promise<PMTask> {
    const orgId = getOrganizationId();
    const { data: { user } } = await supabase.auth.getUser();
    const payload: Record<string, any> = { ...task, organization_id: orgId, created_by: user?.id };
    // Si la tarea pertenece a un KR, hereda la meta del KR (si no se especificó)
    if (payload.key_result_id && !payload.goal_id) {
      const { data: kr } = await supabase.from('key_results').select('goal_id').eq('id', payload.key_result_id).single();
      if (kr?.goal_id) payload.goal_id = kr.goal_id;
    }
    const { data, error } = await supabase.from('tasks').insert(payload).select().single();
    if (error) throw error;
    if (data?.key_result_id) await this.recalcKeyResultProgress(data.key_result_id);
    if (data?.project_id) await this.recalcProjectProgress(data.project_id);
    if (data?.goal_id) await this.recalcGoalProgress(data.goal_id);
    return data;
  },

  // Crea varias tareas vinculadas a un KR (hereda meta y proyecto de la meta)
  async createTasksForKeyResult(keyResultId: string, tasks: Array<Record<string, any>>): Promise<number> {
    if (!tasks || tasks.length === 0) return 0;
    const orgId = getOrganizationId();
    const { data: { user } } = await supabase.auth.getUser();
    const { data: kr } = await supabase.from('key_results').select('goal_id').eq('id', keyResultId).single();
    let projectId: string | null = null;
    if (kr?.goal_id) {
      const { data: g } = await supabase.from('goals').select('project_id, owner_id').eq('id', kr.goal_id).single();
      projectId = g?.project_id ?? null;
    }
    const rows = tasks.map(t => ({
      organization_id: orgId,
      created_by: user?.id,
      key_result_id: keyResultId,
      goal_id: kr?.goal_id ?? null,
      project_id: projectId,
      title: t.title,
      description: t.description ?? null,
      priority: t.priority ?? 'med',
      status: 'open',
      type: t.type ?? 'task',
      estimated_hours: t.estimated_hours ?? null,
      due_date: t.due_date ?? null,
      assigned_to: t.assigned_to ?? null,
    }));
    const { error } = await supabase.from('tasks').insert(rows);
    if (error) throw error;
    await this.recalcKeyResultProgress(keyResultId);
    return rows.length;
  },

  // ─── Task Attachments ──────────────
  async uploadTaskAttachment(taskId: string, file: File): Promise<{ file_name: string; file_url: string }> {
    const orgId = getOrganizationId();
    const { data: { user } } = await supabase.auth.getUser();
    const filePath = `tasks/${taskId}/${Date.now()}_${file.name}`;

    const { error: upErr } = await supabase.storage.from('attachments').upload(filePath, file);
    if (upErr) throw upErr;

    const { data: { publicUrl } } = supabase.storage.from('attachments').getPublicUrl(filePath);

    const { error: dbErr } = await supabase.from('task_attachments').insert({
      task_id: taskId,
      organization_id: orgId,
      file_name: file.name,
      file_url: publicUrl,
      file_size: file.size,
      file_type: file.type,
      uploaded_by: user?.id,
    });
    if (dbErr) throw dbErr;
    return { file_name: file.name, file_url: publicUrl };
  },

  async getTaskAttachments(taskId: string): Promise<Array<{ id: string; file_name: string; file_url: string; file_size: number; file_type: string; created_at: string }>> {
    const { data, error } = await supabase.from('task_attachments').select('*').eq('task_id', taskId).order('created_at', { ascending: false });
    if (error) { console.error('Error getTaskAttachments:', error.message); return []; }
    return data || [];
  },

  async deleteTaskAttachment(attachmentId: string): Promise<void> {
    const { error } = await supabase.from('task_attachments').delete().eq('id', attachmentId);
    if (error) throw error;
  },

  // ─── Subtasks ─────────────────────
  async createSubtask(parentTaskId: string, subtask: { title: string; priority?: string; estimated_hours?: number | null; due_date?: string | null; status?: string; assigned_to?: string | null }): Promise<PMTask> {
    const orgId = getOrganizationId();
    const { data: { user } } = await supabase.auth.getUser();
    // Obtener project_id y responsable del padre (la subtarea hereda el responsable por defecto)
    const { data: parent } = await supabase.from('tasks').select('project_id, assigned_to').eq('id', parentTaskId).single();
    const { data, error } = await supabase.from('tasks').insert({
      title: subtask.title,
      priority: subtask.priority || 'med',
      status: subtask.status || 'open',
      estimated_hours: subtask.estimated_hours ?? null,
      due_date: subtask.due_date ?? null,
      assigned_to: subtask.assigned_to !== undefined ? subtask.assigned_to : (parent?.assigned_to ?? null),
      parent_task_id: parentTaskId,
      project_id: parent?.project_id,
      organization_id: orgId,
      created_by: user?.id,
    }).select().single();
    if (error) throw error;
    return data;
  },

  async getTaskById(taskId: string): Promise<PMTask | null> {
    if (!taskId || taskId === 'undefined') { console.error('Error getTaskById: taskId inválido:', taskId); return null; }
    const { data, error } = await supabase.from('tasks').select('*, parent_task:tasks!parent_task_id(id, title, status)').eq('id', taskId).single();
    if (error) { console.error('Error getTaskById:', error.message); return null; }
    // Normalizar parent_task: Supabase devuelve array en self-referencing joins
    if (data && Array.isArray(data.parent_task)) {
      data.parent_task = data.parent_task[0] || null;
    }
    return data;
  },

  // ─── Cronómetro de tareas (time tracking) ─────────────
  // Devuelve la sesión activa (sin cerrar) de la tarea, si existe
  async getRunningTimeEntry(taskId: string): Promise<TaskTimeEntry | null> {
    const { data, error } = await supabase.from('task_time_entries')
      .select('*').eq('task_id', taskId).is('ended_at', null)
      .order('started_at', { ascending: false }).limit(1).maybeSingle();
    if (error) { console.error('Error getRunningTimeEntry:', error.message); return null; }
    return data;
  },

  // Devuelve un mapa taskId -> sesión activa para un conjunto de tareas (1 sola consulta)
  async getRunningTimeEntriesForTasks(taskIds: string[]): Promise<Record<string, TaskTimeEntry>> {
    if (!taskIds || taskIds.length === 0) return {};
    const { data, error } = await supabase.from('task_time_entries')
      .select('*').in('task_id', taskIds).is('ended_at', null);
    if (error) { console.error('Error getRunningTimeEntriesForTasks:', error.message); return {}; }
    const map: Record<string, TaskTimeEntry> = {};
    (data || []).forEach(e => { if (!map[e.task_id]) map[e.task_id] = e; });
    return map;
  },

  // Devuelve las sesiones y el total de segundos registrados de una tarea
  async getTaskTimeSummary(taskId: string): Promise<{ entries: TaskTimeEntry[]; totalSeconds: number }> {
    const { data, error } = await supabase.from('task_time_entries')
      .select('*').eq('task_id', taskId).order('started_at', { ascending: false });
    if (error) { console.error('Error getTaskTimeSummary:', error.message); return { entries: [], totalSeconds: 0 }; }
    const entries = data || [];
    const totalSeconds = entries.reduce((s, e) => s + (e.duration_seconds || 0), 0);
    return { entries, totalSeconds };
  },

  // Inicia (o reanuda) el cronómetro creando una sesión abierta y marca la tarea en progreso
  async startTimer(taskId: string): Promise<TaskTimeEntry> {
    const existing = await this.getRunningTimeEntry(taskId);
    if (existing) return existing;
    const orgId = getOrganizationId();
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.from('task_time_entries').insert({
      task_id: taskId, organization_id: orgId, user_id: user?.id, started_at: new Date().toISOString(),
    }).select().single();
    if (error) throw error;
    // Poner la tarea en progreso si estaba abierta
    const task = await this.getTaskById(taskId);
    if (task && task.status === 'open') await supabase.from('tasks').update({ status: 'in_progress', updated_at: new Date().toISOString() }).eq('id', taskId);
    return data;
  },

  // Detiene la sesión activa, calcula la duración y la suma a las horas reales de la tarea
  async stopTimer(entryId: string): Promise<number> {
    const { data: entry, error: e1 } = await supabase.from('task_time_entries').select('*').eq('id', entryId).single();
    if (e1) throw e1;
    const started = new Date(entry.started_at).getTime();
    const durationSeconds = Math.max(1, Math.round((Date.now() - started) / 1000));
    const { error: e2 } = await supabase.from('task_time_entries')
      .update({ ended_at: new Date().toISOString(), duration_seconds: durationSeconds }).eq('id', entryId);
    if (e2) throw e2;
    // Acumular en actual_hours de la tarea
    const task = await this.getTaskById(entry.task_id);
    const prevHours = Number(task?.actual_hours) || 0;
    const newHours = Math.round((prevHours + durationSeconds / 3600) * 100) / 100;
    await supabase.from('tasks').update({ actual_hours: newHours, updated_at: new Date().toISOString() }).eq('id', entry.task_id);
    return durationSeconds;
  },

  // Cancela la sesión activa sin registrar tiempo
  async cancelTimer(entryId: string): Promise<void> {
    const { error } = await supabase.from('task_time_entries').delete().eq('id', entryId);
    if (error) throw error;
  },

  async getSubtasks(parentTaskId: string): Promise<PMTask[]> {
    const { data, error } = await supabase.from('tasks').select('*').eq('parent_task_id', parentTaskId).order('created_at');
    if (error) { console.error('Error getSubtasks:', error.message); return []; }
    return data || [];
  },

  // ─── Task Dependencies ─────────────
  async addTaskDependency(taskId: string, dependsOnTaskId: string, type: 'blocks' | 'relates_to' = 'blocks'): Promise<void> {
    const { error } = await supabase.from('task_dependencies').insert({
      task_id: taskId,
      depends_on_task_id: dependsOnTaskId,
      dependency_type: type,
    });
    if (error) throw error;
  },

  async removeTaskDependency(taskId: string, dependsOnTaskId: string): Promise<void> {
    const { error } = await supabase.from('task_dependencies').delete()
      .eq('task_id', taskId).eq('depends_on_task_id', dependsOnTaskId);
    if (error) throw error;
  },

  async getTaskDependencies(taskId: string): Promise<Array<{ id: string; depends_on_task_id: string; dependency_type: string; task: { id: string; title: string; status: string } }>> {
    const { data, error } = await supabase.from('task_dependencies')
      .select('id, depends_on_task_id, dependency_type, tasks!task_dependencies_depends_on_task_id_fkey(id, title, status)')
      .eq('task_id', taskId);
    if (error) { console.error('Error getTaskDependencies:', error.message); return []; }
    return (data || []).map((d: any) => ({ ...d, task: d.tasks }));
  },

  // ─── Project Members ─────────────
  async addProjectMember(projectId: string, userId: string, role: string = 'member'): Promise<void> {
    const { error } = await supabase.from('project_members').insert({ project_id: projectId, user_id: userId, role });
    if (error) throw error;
  },

  async getProjectMembers(projectId: string): Promise<Array<{ id: string; user_id: string; role: string }>> {
    const { data, error } = await supabase.from('project_members').select('id, user_id, role').eq('project_id', projectId);
    if (error) { console.error('Error getProjectMembers:', error.message); return []; }
    return data || [];
  },

  async removeProjectMember(projectId: string, userId: string): Promise<void> {
    const { error } = await supabase.from('project_members').delete().eq('project_id', projectId).eq('user_id', userId);
    if (error) throw error;
  },

  // Miembros de la organización con su cargo y departamento (para asignación por rol)
  async getMembersWithPositions(): Promise<Array<{ user_id: string; nombre: string; position: string; department: string }>> {
    const orgId = getOrganizationId();
    if (!orgId) return [];
    const { data, error } = await supabase
      .from('organization_members')
      .select('user_id, job_position_id, profiles!inner(first_name, last_name, email), job_positions(name, departments(name))')
      .eq('organization_id', orgId)
      .eq('is_active', true);
    if (error) { console.error('Error getMembersWithPositions:', error.message); return []; }
    return (data || []).map((m: any) => {
      const p = m.profiles;
      const nombre = (p?.first_name || p?.last_name) ? `${p.first_name || ''} ${p.last_name || ''}`.trim() : (p?.email || 'Usuario');
      return {
        user_id: m.user_id,
        nombre,
        position: m.job_positions?.name || '',
        department: m.job_positions?.departments?.name || '',
      };
    });
  },

  /**
   * Distribuye las tareas sin responsable de un proyecto entre sus miembros,
   * priorizando por coincidencia de cargo/departamento con el contenido de la tarea
   * y balanceando la carga (round-robin) como respaldo.
   */
  async distributeProjectTasks(projectId: string): Promise<number> {
    const [members, tasks] = await Promise.all([
      this.getProjectMembers(projectId),
      supabase.from('tasks').select('id, title, description, tags, assigned_to, estimated_hours, priority').eq('project_id', projectId)
        .in('status', ['open', 'in_progress']).then(r => r.data || []),
    ]);
    if (members.length === 0) return 0;

    const positions = await this.getMembersWithPositions();
    const posMap = new Map(positions.map(p => [p.user_id, p]));
    // Enriquecer miembros del proyecto con cargo/departamento
    const enriched = members.map(m => ({
      user_id: m.user_id,
      keywords: [
        (posMap.get(m.user_id)?.position || ''),
        (posMap.get(m.user_id)?.department || ''),
      ].join(' ').toLowerCase().split(/[\s,/-]+/).filter(w => w.length >= 3),
      load: 0, // carga acumulada en horas estimadas
    }));

    // La carga se pondera por horas estimadas (fallback: 1h por tarea)
    const weightOf = (t: any) => Number(t.estimated_hours) || 1;
    // Sembrar la carga inicial con las tareas ya asignadas para balancear de forma justa
    const loadByUser = new Map(enriched.map(e => [e.user_id, e]));
    for (const t of tasks as any[]) {
      if (t.assigned_to && loadByUser.has(t.assigned_to)) loadByUser.get(t.assigned_to)!.load += weightOf(t);
    }

    // Priorizar la asignación de las tareas más críticas primero
    const priorityRank: Record<string, number> = { critical: 4, high: 3, med: 2, low: 1 };
    const unassigned = (tasks as any[]).filter(t => !t.assigned_to)
      .sort((a, b) => (priorityRank[b.priority] || 0) - (priorityRank[a.priority] || 0));

    let assigned = 0;
    for (const task of unassigned) {
      const haystack = `${task.title || ''} ${task.description || ''} ${(task.tags || []).join(' ')}`.toLowerCase();
      // Puntuar cada miembro por coincidencia de cargo/departamento y menor carga en horas
      let best = enriched[0];
      let bestScore = -Infinity;
      for (const member of enriched) {
        const matches = member.keywords.filter(k => haystack.includes(k)).length;
        const score = matches * 1000 - member.load; // prioriza match, luego menor carga (horas)
        if (score > bestScore) { bestScore = score; best = member; }
      }
      const { error } = await supabase.from('tasks').update({ assigned_to: best.user_id, updated_at: new Date().toISOString() }).eq('id', task.id);
      if (!error) { best.load += weightOf(task); assigned += 1; }
    }
    return assigned;
  },

  // ─── Recent Activity ─────────────
  async getRecentTasks(limit = 5): Promise<PMTask[]> {
    const orgId = getOrganizationId();
    if (!orgId) return [];
    const { data, error } = await supabase
      .from('tasks')
      .select('*, projects(id, name)')
      .eq('organization_id', orgId)
      .order('updated_at', { ascending: false })
      .limit(limit);
    if (error) { console.error('Error getRecentTasks:', error.message); return []; }

    const tasks = data || [];
    const userIds = Array.from(new Set(tasks.filter(t => t.assigned_to).map(t => t.assigned_to)));
    if (userIds.length > 0) {
      const { data: profiles } = await supabase.from('profiles').select('id, first_name, last_name, email').in('id', userIds);
      const profileMap = new Map((profiles || []).map(p => [p.id, p]));
      tasks.forEach(t => { if (t.assigned_to && profileMap.has(t.assigned_to)) t.profiles = profileMap.get(t.assigned_to); });
    }
    return tasks;
  },
};
