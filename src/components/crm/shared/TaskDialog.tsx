'use client';

import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { CheckSquare, ChevronDown, Loader2, Plus } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { TASK_PRIORITIES, type TaskPriority } from '@/lib/crm/enums';
import {
  crmTaskService,
  TASK_PRIORITY_LABELS,
  type TaskFormValues,
} from '@/lib/services/crm/taskService';
import type { PMTask } from '@/lib/services/pmService';

const TaskCreationPanel = dynamic(() => import('@/components/pm/TaskCreationPanel'), { ssr: false });

/**
 * TaskDialog — diálogo ÚNICO de tarea del CRM (sustituye a QuickTaskDialog).
 *
 * Un solo componente con dos modos sobre la misma lógica de guardado
 * (`@/lib/services/crm/taskService`):
 *
 *  - `compact`: título, vence, prioridad y descripción. Lo que necesita quien
 *    solo quiere apuntar algo y seguir.
 *  - `full`: el formulario completo (`TaskCreationPanel`) con tipo, proyecto,
 *    cliente, relacionado con, meta, horas, responsable, editor enriquecido,
 *    «Generar con IA», subtareas, adjuntos y dependencias.
 *
 * «Más opciones» pasa de compacto a completo SIN perder lo ya escrito: los
 * valores del formulario corto viajan como `initialValues` del panel.
 * Editar una tarea abre siempre el modo completo.
 */
export interface TaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Modo inicial. Por defecto `compact`. Al editar siempre es `full`. */
  mode?: 'compact' | 'full';
  relatedType?: 'opportunity' | 'customer';
  relatedId?: string;
  /** Cliente de la oportunidad, para prellenar el campo Cliente del modo completo. */
  customerId?: string;
  defaultTitle?: string;
  editTask?: PMTask | null;
  /** Tareas hermanas, para el selector de dependencias del modo completo. */
  siblingTasks?: Array<{ id: string; title: string; status: string }>;
  onCreated?: (row: { id: string }) => void;
  /** Se dispara tras crear o editar (para recargar la lista). */
  onSaved?: () => void;
}

interface OrgUser {
  id: string;
  nombre: string;
}

export function TaskDialog({
  open,
  onOpenChange,
  mode = 'compact',
  relatedType,
  relatedId,
  customerId,
  defaultTitle,
  editTask,
  siblingTasks = [],
  onCreated,
  onSaved,
}: TaskDialogProps) {
  const isEdit = Boolean(editTask);
  const [expanded, setExpanded] = useState(mode === 'full' || isEdit);
  const [title, setTitle] = useState(defaultTitle ?? '');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('med');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [catalogsLoaded, setCatalogsLoaded] = useState(false);

  // Al abrir, se parte siempre del modo pedido y del formulario limpio.
  useEffect(() => {
    if (!open) return;
    setExpanded(mode === 'full' || isEdit);
    setTitle(defaultTitle ?? '');
    setDueDate('');
    setPriority('med');
    setDescription('');
    setSaving(false);
  }, [open, mode, isEdit, defaultTitle]);

  /**
   * Proyectos y usuarios solo se piden cuando hace falta el modo completo.
   * `organization_members.user_id` tiene DOS claves foráneas (auth.users y
   * profiles): sin nombrar la restricción, `profiles:user_id(...)` es ambiguo
   * y PostgREST devuelve vacío sin error.
   */
  const loadCatalogs = useCallback(async () => {
    if (catalogsLoaded) return;
    const orgId = getOrganizationId();
    if (!orgId) return;
    setCatalogsLoaded(true);
    const [projectsRes, membersRes] = await Promise.all([
      supabase.from('projects').select('id, name').eq('organization_id', orgId).order('name').limit(100),
      supabase
        .from('organization_members')
        .select('user_id, profiles!organization_members_user_id_fkey1(first_name, last_name, email)')
        .eq('organization_id', orgId)
        .eq('is_active', true),
    ]);

    if (projectsRes.error) {
      console.error('[TaskDialog] proyectos:', projectsRes.error.message);
      toast({ title: 'No se pudieron cargar los proyectos', description: projectsRes.error.message, variant: 'destructive' });
    } else {
      setProjects(projectsRes.data ?? []);
    }

    if (membersRes.error) {
      console.error('[TaskDialog] miembros:', membersRes.error.message);
      toast({ title: 'No se pudo cargar el equipo', description: membersRes.error.message, variant: 'destructive' });
    } else {
      const rows = (membersRes.data ?? []) as Array<{
        user_id: string;
        profiles: { first_name?: string | null; last_name?: string | null; email?: string | null } | Array<{ first_name?: string | null; last_name?: string | null; email?: string | null }> | null;
      }>;
      setUsers(
        rows.map((m) => {
          const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
          const nombre = `${p?.first_name ?? ''} ${p?.last_name ?? ''}`.trim();
          return { id: m.user_id, nombre: nombre || p?.email || 'Usuario' };
        })
      );
    }
  }, [catalogsLoaded]);

  useEffect(() => {
    if (open && expanded) void loadCatalogs();
  }, [open, expanded, loadCatalogs]);

  const handleQuickSave = async () => {
    if (!title.trim() || saving) return;
    setSaving(true);
    try {
      const values: TaskFormValues = {
        title,
        description,
        priority,
        due_date: dueDate,
        related_to_type: relatedType ?? null,
        related_to_id: relatedType ? relatedId ?? null : null,
        customer_id: customerId ?? (relatedType === 'customer' ? relatedId ?? null : null),
        type: 'crm',
      };
      const created = await crmTaskService.createTask(values);
      toast({ title: 'Tarea creada', description: created.title });
      onCreated?.({ id: created.id });
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      toast({
        title: 'No se pudo crear la tarea',
        description: err instanceof Error ? err.message : 'Error desconocido',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  // Modo completo: el mismo panel avanzado, precargado con lo ya escrito.
  if (expanded) {
    return (
      <TaskCreationPanel
        isOpen={open}
        onClose={() => onOpenChange(false)}
        projects={projects}
        users={users}
        existingTasks={siblingTasks}
        editTask={editTask ?? null}
        onTaskCreated={() => {
          onSaved?.();
          onOpenChange(false);
        }}
        initialCustomerId={customerId ?? (relatedType === 'customer' ? relatedId : undefined)}
        initialRelatedToType={relatedType}
        initialRelatedToId={relatedType ? relatedId : undefined}
        initialValues={
          isEdit
            ? undefined
            : {
                title,
                description,
                priority,
                due_date: dueDate,
                type: 'crm',
              }
        }
      />
    );
  }

  const relatedLabel = relatedType === 'opportunity' ? 'la oportunidad' : 'el cliente';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-white dark:bg-gray-900" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-gray-900 dark:text-gray-100">
            <CheckSquare className="h-5 w-5 text-indigo-500" />
            Nueva tarea
          </DialogTitle>
          <DialogDescription>
            {relatedType
              ? `Queda ligada a ${relatedLabel} y aparece en el timeline.`
              : 'Se guarda en las tareas de tu organización.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="qt-title" className="text-xs">Título *</Label>
            <Input
              id="qt-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enviar cotización…"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleQuickSave();
              }}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="qt-due" className="text-xs">Vence</Label>
              <Input id="qt-due" type="datetime-local" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Prioridad</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TASK_PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>{TASK_PRIORITY_LABELS[p]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="qt-desc" className="text-xs">Descripción</Label>
            <Textarea id="qt-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs text-gray-600 dark:text-gray-300"
            onClick={() => {
              void loadCatalogs();
              setExpanded(true);
            }}
          >
            <ChevronDown className="h-3.5 w-3.5 mr-1" />
            Más opciones (proyecto, responsable, meta, horas…)
          </Button>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="button" onClick={handleQuickSave} disabled={saving || !title.trim()}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
            Crear
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default TaskDialog;
