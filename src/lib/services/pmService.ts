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
  projects?: { name: string } | null;
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
  parent_task_id: string | null;
  related_to_type?: string | null;
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
  onboarding: 'Onboarding', operational: 'Operativa', reminder: 'Recordatorio', meeting: 'Reunión', call: 'Llamada', email: 'Email', visit: 'Visita',
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
      safeQuery(supabase.from('tasks').select('status, due_date, project_id').eq('organization_id', orgId).not('project_id', 'is', null)),
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

  async deleteProject(id: string): Promise<void> {
    const { error } = await supabase.from('projects').delete().eq('id', id);
    if (error) throw error;
  },

  async deleteTask(id: string): Promise<void> {
    const { error } = await supabase.from('tasks').delete().eq('id', id);
    if (error) throw error;
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
  async getTasks(filters?: { status?: string; projectId?: string; assignedTo?: string }): Promise<PMTask[]> {
    const orgId = getOrganizationId();
    if (!orgId) return [];

    // Query sin join a profiles para evitar errores de FK indirecto
    let query = supabase
      .from('tasks')
      .select('*, projects(id, name), milestones(id, title), goals(id, title)')
      .eq('organization_id', orgId)
      .not('project_id', 'is', null)
      .order('created_at', { ascending: false });

    if (filters?.status && filters.status !== 'all') query = query.eq('status', filters.status);
    if (filters?.projectId && filters.projectId !== 'all') query = query.eq('project_id', filters.projectId);
    if (filters?.assignedTo) query = query.eq('assigned_to', filters.assignedTo);

    const { data, error } = await query;
    if (error) { console.error('Error getTasks:', error.message); return []; }

    // Enriquecer con profiles por separado si hay assigned_to
    const tasks = data || [];
    const userIds = Array.from(new Set(tasks.filter(t => t.assigned_to).map(t => t.assigned_to)));
    if (userIds.length > 0) {
      const { data: profiles } = await supabase.from('profiles').select('id, first_name, last_name, email').in('id', userIds);
      const profileMap = new Map((profiles || []).map(p => [p.id, p]));
      tasks.forEach(t => { if (t.assigned_to && profileMap.has(t.assigned_to)) t.profiles = profileMap.get(t.assigned_to); });
    }
    return tasks;
  },

  async updateTaskStatus(taskId: string, status: string): Promise<void> {
    const { error } = await supabase.from('tasks').update({ status, updated_at: new Date().toISOString() }).eq('id', taskId);
    if (error) throw error;
  },

  async updateTask(taskId: string, updates: Record<string, any>): Promise<void> {
    const { error } = await supabase.from('tasks').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', taskId);
    if (error) throw error;
  },

  async createTask(task: Record<string, any>): Promise<PMTask> {
    const orgId = getOrganizationId();
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.from('tasks').insert({
      ...task, organization_id: orgId, created_by: user?.id,
    }).select().single();
    if (error) throw error;
    return data;
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
  async createSubtask(parentTaskId: string, subtask: { title: string; priority?: string }): Promise<PMTask> {
    const orgId = getOrganizationId();
    const { data: { user } } = await supabase.auth.getUser();
    // Obtener project_id del padre
    const { data: parent } = await supabase.from('tasks').select('project_id').eq('id', parentTaskId).single();
    const { data, error } = await supabase.from('tasks').insert({
      title: subtask.title,
      priority: subtask.priority || 'med',
      status: 'open',
      parent_task_id: parentTaskId,
      project_id: parent?.project_id,
      organization_id: orgId,
      created_by: user?.id,
    }).select().single();
    if (error) throw error;
    return data;
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

  // ─── Recent Activity ─────────────
  async getRecentTasks(limit = 5): Promise<PMTask[]> {
    const orgId = getOrganizationId();
    if (!orgId) return [];
    const { data, error } = await supabase
      .from('tasks')
      .select('*, projects(id, name)')
      .eq('organization_id', orgId)
      .not('project_id', 'is', null)
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
