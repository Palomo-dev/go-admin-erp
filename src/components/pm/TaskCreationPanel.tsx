'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  X,
  Plus,
  Loader2,
  Paperclip,
  Trash2,
  FileText,
  Image as ImageIcon,
  File,
  ListChecks,
  Check,
  Sparkles,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  CalendarIcon,
  Clock,
  Link2,
  Maximize2,
  GitBranch,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import * as VisuallyHidden from '@radix-ui/react-visually-hidden';
import { SearchSelect } from '@/components/ui/search-select';
import { pmService, PRIORITY_LABELS, TASK_TYPE_LABELS, type PMTask } from '@/lib/services/pmService';
import { RichTextEditor } from '@/components/pm/RichTextEditor';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { supabase } from '@/lib/supabase/config';
import { TaskTimer } from '@/components/pm/TaskTimer';
import { cn } from '@/utils/Utils';

interface SubtaskItem {
  id: string;
  title: string;
  priority: string;
  estimated_hours?: number | null;
  due_date?: string | null;
  assigned_to?: string | null;
  done?: boolean;
  persisted?: boolean;
}

interface AttachmentItem {
  file?: File;
  preview?: string;
  id?: string;
  file_name?: string;
  file_url?: string;
  file_size?: number;
  persisted?: boolean;
}

interface DependencyItem {
  taskId: string;
  title: string;
  type: 'blocks' | 'relates_to';
  persisted?: boolean;
}

interface TaskCreationPanelProps {
  isOpen: boolean;
  onClose: () => void;
  projects: Array<{ id: string; name: string }>;
  existingTasks?: Array<{ id: string; title: string; status: string }>;
  users?: Array<{ id: string; nombre: string }>;
  editTask?: PMTask | null;
  onTaskCreated: () => void;
  onOpenSubtask?: (subtaskId: string) => void;
  onOpenParent?: (parentTaskId: string) => void;
}

const INITIAL_FORM = {
  title: '',
  description: '',
  project_id: '',
  priority: 'med',
  due_date: '',
  estimated_hours: '',
  actual_hours: '',
  status: 'open',
  assigned_to: '',
  goal_id: '',
  type: '',
  customer_id: '',
  related_to_type: '',
  related_to_id: '',
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(type: string) {
  if (type.startsWith('image/')) return <ImageIcon className="h-4 w-4 text-blue-500" />;
  if (type.includes('pdf')) return <FileText className="h-4 w-4 text-red-500" />;
  return <File className="h-4 w-4 text-gray-500" />;
}

export default function TaskCreationPanel({ isOpen, onClose, projects, existingTasks = [], users = [], editTask, onTaskCreated, onOpenSubtask, onOpenParent }: TaskCreationPanelProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isMobile, setIsMobile] = useState(false);
  const isEdit = !!editTask;
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)');
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const [form, setForm] = useState(INITIAL_FORM);
  const [creating, setCreating] = useState(false);
  const [subtasks, setSubtasks] = useState<SubtaskItem[]>([]);
  const [newSubtask, setNewSubtask] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [showSubtasks, setShowSubtasks] = useState(false);
  const [showAttachments, setShowAttachments] = useState(false);
  const [showDependencies, setShowDependencies] = useState(false);
  const [dependencies, setDependencies] = useState<DependencyItem[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [goals, setGoals] = useState<Array<{ id: string; title: string }>>([]);
  const [customers, setCustomers] = useState<Array<{ id: string; name: string }>>([]);
  const [spaces, setSpaces] = useState<Array<{ id: string; label: string; type_name: string }>>([]);
  const [sales, setSales] = useState<Array<{ id: string; total: number; sale_date: string; customer_name: string; source: string }>>([]);
  const [reservations, setReservations] = useState<Array<{ id: string; checkin: string; checkout: string; customer_name: string }>>([]);
  const [pmsActive, setPmsActive] = useState(false);

  // Cargar metas, clientes, espacios, ventas y reservas de la organización
  useEffect(() => {
    pmService.getGoals().then(gs => setGoals(gs.map(g => ({ id: g.id, title: g.title }))));
    const orgId = getOrganizationId();
    if (orgId) {
      supabase.from('customers')
        .select('id, first_name, last_name')
        .eq('organization_id', orgId)
        .limit(200)
        .then(({ data }) => {
          setCustomers((data || []).map(c => ({ id: c.id, name: `${c.first_name} ${c.last_name}` })));
        });
      // Cargar ventas POS recientes con nombre del cliente
      supabase.from('sales')
        .select('id, total, sale_date, status, table_session_id, customers(first_name, last_name)')
        .eq('organization_id', orgId)
        .order('sale_date', { ascending: false })
        .limit(200)
        .then(({ data }) => {
          const posSales = (data || []).map(s => ({
            id: s.id,
            total: Number(s.total) || 0,
            sale_date: s.sale_date,
            customer_name: s.customers ? `${s.customers.first_name} ${s.customers.last_name}` : 'Sin cliente',
            source: s.table_session_id ? 'Mesa' : 'POS',
          }));
          // Cargar ventas Web (web_orders)
          supabase.from('web_orders')
            .select('id, total_amount, order_date, customer_name, status')
            .eq('organization_id', orgId)
            .order('order_date', { ascending: false })
            .limit(200)
            .then(({ data: webData }) => {
              const webSales = (webData || []).map(w => ({
                id: w.id,
                total: Number(w.total_amount) || 0,
                sale_date: w.order_date,
                customer_name: w.customer_name || 'Sin cliente',
                source: 'Web',
              }));
              // Combinar y ordenar por fecha descendente
              const combined = [...posSales, ...webSales].sort((a, b) =>
                new Date(b.sale_date).getTime() - new Date(a.sale_date).getTime()
              );
              setSales(combined);
            });
        });
      // Verificar si el módulo PMS está activo
      supabase.from('organization_modules')
        .select('is_active')
        .eq('organization_id', orgId)
        .eq('module_code', 'pms_hotel')
        .eq('is_active', true)
        .single()
        .then(({ data }) => {
          setPmsActive(!!data);
          if (data) {
            supabase.from('spaces')
              .select('id, label, space_types(name)')
              .eq('organization_id', orgId)
              .limit(200)
              .then(({ data: spaceData }) => {
                setSpaces((spaceData || []).map(s => ({
                  id: s.id,
                  label: s.label,
                  type_name: s.space_types?.name || 'Sin tipo',
                })));
              });
            supabase.from('reservations')
              .select('id, checkin, checkout, status, customers(first_name, last_name)')
              .eq('organization_id', orgId)
              .order('checkin', { ascending: false })
              .limit(200)
              .then(({ data: resData }) => {
                setReservations((resData || []).map(r => ({
                  id: r.id,
                  checkin: r.checkin,
                  checkout: r.checkout,
                  customer_name: r.customers ? `${r.customers.first_name} ${r.customers.last_name}` : 'Sin cliente',
                })));
              });
          }
        });
    }
  }, []);

  const resetForm = useCallback(() => {
    setForm(INITIAL_FORM);
    setSubtasks([]);
    setAttachments([]);
    setDependencies([]);
    setNewSubtask('');
    setShowSubtasks(false);
    setShowAttachments(false);
    setShowDependencies(false);
  }, []);

  // Precargar datos al editar
  useEffect(() => {
    if (editTask) {
      setForm({
        title: editTask.title || '',
        description: editTask.description || '',
        project_id: editTask.project_id || '',
        priority: editTask.priority || 'med',
        due_date: editTask.due_date || '',
        estimated_hours: editTask.estimated_hours != null ? String(editTask.estimated_hours) : '',
        actual_hours: editTask.actual_hours != null ? String(editTask.actual_hours) : '',
        status: editTask.status || 'open',
        assigned_to: editTask.assigned_to || '',
        goal_id: editTask.goal_id || '',
        type: editTask.type || '',
        customer_id: editTask.customer_id || '',
        related_to_type: editTask.related_to_type || '',
        related_to_id: editTask.related_to_id || '',
      });
    } else {
      resetForm();
    }
  }, [editTask, resetForm]);

  // Recargar adjuntos persistidos desde el servidor
  const reloadAttachments = useCallback(async (taskId: string) => {
    const list = await pmService.getTaskAttachments(taskId);
    setAttachments(list.map(a => ({
      id: a.id, file_name: a.file_name, file_url: a.file_url, file_size: a.file_size,
      preview: /\.(png|jpe?g|gif|svg|webp)$/i.test(a.file_name) ? a.file_url : undefined,
      persisted: true,
    })));
    if (list.length > 0) setShowAttachments(true);
  }, []);

  // Recargar dependencias persistidas desde el servidor
  const reloadDependencies = useCallback(async (taskId: string) => {
    const list = await pmService.getTaskDependencies(taskId);
    setDependencies(list.map(d => ({
      taskId: d.depends_on_task_id, title: d.task?.title || 'Tarea',
      type: (d.dependency_type as 'blocks' | 'relates_to') || 'blocks', persisted: true,
    })));
    if (list.length > 0) setShowDependencies(true);
  }, []);

  // Cargar subtareas, adjuntos y dependencias existentes al editar
  useEffect(() => {
    if (editTask) {
      // Resetear estado de subtareas antes de cargar las nuevas
      setSubtasks([]);
      setShowSubtasks(false);
      pmService.getSubtasks(editTask.id).then(subs => {
        setSubtasks(subs.map(s => ({ id: s.id, title: s.title, priority: s.priority || 'med', estimated_hours: s.estimated_hours, due_date: s.due_date, assigned_to: s.assigned_to, done: s.status === 'done', persisted: true })));
        if (subs.length > 0) setShowSubtasks(true);
      }).catch(err => {
        console.error('Error cargando subtareas:', err);
      });
      reloadAttachments(editTask.id);
      reloadDependencies(editTask.id);
    }
  }, [editTask, reloadAttachments, reloadDependencies]);

  const handleDelete = async () => {
    if (!editTask) return;
    if (!window.confirm(`¿Eliminar la tarea "${editTask.title}"? Esta acción no se puede deshacer.`)) return;
    setDeleting(true);
    try {
      await pmService.deleteTask(editTask.id);
      toast({ title: 'Tarea eliminada' });
      resetForm();
      onClose();
      onTaskCreated();
    } catch (error: any) {
      toast({ title: 'Error al eliminar', description: error.message, variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  const handleAddSubtask = async () => {
    if (!newSubtask.trim()) return;
    const title = newSubtask.trim();
    setNewSubtask('');
    // En modo edición persiste de inmediato
    if (isEdit && editTask) {
      try {
        const created = await pmService.createSubtask(editTask.id, { title, priority: 'med' });
        setSubtasks(prev => [...prev, { id: created.id, title, priority: 'med', done: false, persisted: true }]);
      } catch (error: any) {
        toast({ title: 'Error al crear subtarea', description: error.message, variant: 'destructive' });
      }
      return;
    }
    setSubtasks(prev => [...prev, { id: crypto.randomUUID(), title, priority: 'med' }]);
  };

  const handleRemoveSubtask = async (id: string) => {
    const st = subtasks.find(s => s.id === id);
    setSubtasks(prev => prev.filter(s => s.id !== id));
    if (st?.persisted) {
      try { await pmService.deleteTask(id); }
      catch (error: any) { toast({ title: 'Error al eliminar subtarea', description: error.message, variant: 'destructive' }); }
    }
  };

  const [expandedSubtasks, setExpandedSubtasks] = useState<Set<string>>(new Set());
  const toggleExpandSubtask = (id: string) => {
    setExpandedSubtasks(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Actualiza un campo de la subtarea (horas, fecha, etc.) sin recargar la lista
  const updateSubtaskField = async (id: string, patch: Partial<SubtaskItem>) => {
    setSubtasks(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));
    const st = subtasks.find(s => s.id === id);
    if (st?.persisted) {
      try { await pmService.updateTask(id, patch as Record<string, any>); }
      catch (error: any) { toast({ title: 'Error al actualizar subtarea', description: error.message, variant: 'destructive' }); }
    }
  };

  const handleReassignSubtask = async (id: string, userId: string | null) => {
    setSubtasks(prev => prev.map(s => s.id === id ? { ...s, assigned_to: userId } : s));
    const st = subtasks.find(s => s.id === id);
    if (st?.persisted) {
      try { await pmService.updateTask(id, { assigned_to: userId }); }
      catch (error: any) { toast({ title: 'Error al reasignar', description: error.message, variant: 'destructive' }); }
    }
  };

  const handleToggleSubtask = async (id: string) => {
    const st = subtasks.find(s => s.id === id);
    if (!st) return;
    const nextDone = !st.done;
    setSubtasks(prev => prev.map(s => s.id === id ? { ...s, done: nextDone } : s));
    if (st.persisted) {
      try {
        await pmService.updateTaskStatus(id, nextDone ? 'done' : 'open');
      } catch (error: any) { toast({ title: 'Error al actualizar subtarea', description: error.message, variant: 'destructive' }); }
    }
  };

  const handleAISuggest = async () => {
    if (!form.title.trim()) { toast({ title: 'Escribe un título primero', variant: 'destructive' }); return; }
    setAiLoading(true);
    try {
      const res = await fetch('/api/ai-assistant/pm-assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'task', title: form.title, description: form.description,
          startDate: form.due_date || undefined, hoursPerDay: 8, organizationId: getOrganizationId(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error de IA');
      // Rellenar horas, fecha y prioridad de la tarea padre si están vacías
      setForm(f => ({
        ...f,
        estimated_hours: f.estimated_hours || (data.estimated_hours != null ? String(data.estimated_hours) : ''),
        due_date: f.due_date || data.due_date || '',
        priority: data.priority || f.priority,
      }));
      const suggested: SubtaskItem[] = (data.subtasks || []).map((st: any) => ({
        id: crypto.randomUUID(), title: st.title, priority: st.priority || 'med',
        estimated_hours: st.estimated_hours ?? null, due_date: st.due_date ?? null,
      }));
      setShowSubtasks(true);
      if (isEdit && editTask) {
        const created = await Promise.all(suggested.map(st => pmService.createSubtask(editTask.id, {
          title: st.title, priority: st.priority, estimated_hours: st.estimated_hours, due_date: st.due_date, status: 'open',
        })));
        setSubtasks(prev => [...prev, ...created.map((c, i) => ({
          id: c.id, title: c.title, priority: suggested[i].priority,
          estimated_hours: suggested[i].estimated_hours, due_date: suggested[i].due_date,
          assigned_to: c.assigned_to, done: false, persisted: true,
        }))]);
      } else {
        setSubtasks(prev => [...prev, ...suggested]);
      }
      toast({ title: 'IA generó el desglose', description: `${suggested.length} subtareas · ${data.estimated_hours}h · prioridad ${data.priority}` });
    } catch (error: any) {
      toast({ title: 'Error del asistente IA', description: error.message, variant: 'destructive' });
    } finally {
      setAiLoading(false);
    }
  };

  const [descLoading, setDescLoading] = useState(false);
  const handleGenerateDescription = async () => {
    if (!form.title.trim()) { toast({ title: 'Escribe un título primero', variant: 'destructive' }); return; }
    setDescLoading(true);
    try {
      const assignee = users.find(u => u.id === form.assigned_to)?.nombre;
      const goalTitle = goals.find(g => g.id === form.goal_id)?.title;
      let parentTitle: string | undefined;
      let parentDescription: string | undefined;
      if (editTask?.parent_task_id) {
        const parent = await pmService.getTaskById(editTask.parent_task_id);
        parentTitle = parent?.title;
        parentDescription = parent?.description || undefined;
      }
      const res = await fetch('/api/ai-assistant/pm-assist', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'describe', entity: 'tarea', title: form.title, description: form.description,
          organizationId: getOrganizationId(),
          context: {
            priority: PRIORITY_LABELS[form.priority as keyof typeof PRIORITY_LABELS],
            estimated_hours: form.estimated_hours, due_date: form.due_date, assignee, goal: goalTitle,
            dependencies: dependencies.map(d => d.title),
            attachments: attachments.map(a => a.file_name || a.file?.name).filter(Boolean),
            parentTitle, parentDescription,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error de IA');
      if (data.description) setForm(f => ({ ...f, description: data.description }));
      toast({ title: 'Descripción generada con IA' });
    } catch (error: any) {
      toast({ title: 'Error del asistente IA', description: error.message, variant: 'destructive' });
    } finally {
      setDescLoading(false);
    }
  };

  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const maxSize = 10 * 1024 * 1024; // 10MB
    const valid = files.filter(f => {
      if (f.size > maxSize) {
        toast({ title: `"${f.name}" excede 10MB`, variant: 'destructive' });
        return false;
      }
      return true;
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
    // En modo edición sube de inmediato y refresca la lista persistida
    if (isEdit && editTask) {
      setUploadingFiles(true);
      try {
        await Promise.all(valid.map(f => pmService.uploadTaskAttachment(editTask.id, f)));
        await reloadAttachments(editTask.id);
      } catch (error: any) {
        toast({ title: 'Error al subir archivo', description: error.message, variant: 'destructive' });
      } finally {
        setUploadingFiles(false);
      }
      return;
    }
    const newAttachments: AttachmentItem[] = valid.map(file => ({
      file,
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
    }));
    setAttachments(prev => [...prev, ...newAttachments]);
  };

  const handleRemoveAttachment = async (index: number) => {
    const att = attachments[index];
    setAttachments(prev => {
      const copy = [...prev];
      if (copy[index]?.preview && copy[index]?.file) URL.revokeObjectURL(copy[index].preview!);
      copy.splice(index, 1);
      return copy;
    });
    if (att?.persisted && att.id) {
      try { await pmService.deleteTaskAttachment(att.id); }
      catch (error: any) { toast({ title: 'Error al eliminar archivo', description: error.message, variant: 'destructive' }); }
    }
  };

  const handleAddDependency = async (taskId: string) => {
    const task = existingTasks.find(t => t.id === taskId);
    if (!task || dependencies.find(d => d.taskId === taskId)) return;
    setDependencies(prev => [...prev, { taskId: task.id, title: task.title, type: 'blocks', persisted: isEdit }]);
    if (isEdit && editTask) {
      try { await pmService.addTaskDependency(editTask.id, taskId, 'blocks'); }
      catch (error: any) { toast({ title: 'Error al agregar dependencia', description: error.message, variant: 'destructive' }); }
    }
  };

  const handleRemoveDependency = async (taskId: string) => {
    const dep = dependencies.find(d => d.taskId === taskId);
    setDependencies(prev => prev.filter(d => d.taskId !== taskId));
    if (dep?.persisted && isEdit && editTask) {
      try { await pmService.removeTaskDependency(editTask.id, taskId); }
      catch (error: any) { toast({ title: 'Error al quitar dependencia', description: error.message, variant: 'destructive' }); }
    }
  };

  const handleCreate = async () => {
    if (!form.title.trim()) { toast({ title: 'El título es requerido', variant: 'destructive' }); return; }

    setCreating(true);
    try {
      // Modo edición: actualizar campos principales y salir
      if (isEdit && editTask) {
        await pmService.updateTask(editTask.id, {
          title: form.title.trim(),
          description: form.description.trim() || null,
          project_id: form.project_id || null,
          priority: form.priority,
          due_date: form.due_date || null,
          estimated_hours: form.estimated_hours ? parseFloat(form.estimated_hours) : null,
          actual_hours: form.actual_hours ? parseFloat(form.actual_hours) : null,
          status: form.status,
          assigned_to: form.assigned_to || null,
          goal_id: form.goal_id || null,
          type: form.type || null,
          customer_id: form.customer_id || null,
          related_to_type: form.related_to_type || null,
          related_to_id: form.related_to_id || null,
        });
        toast({ title: 'Tarea actualizada', description: `"${form.title}" guardada` });
        resetForm();
        onClose();
        onTaskCreated();
        return;
      }

      // 1. Crear tarea principal
      const task = await pmService.createTask({
        title: form.title.trim(),
        description: form.description.trim() || null,
        project_id: form.project_id || null,
        priority: form.priority,
        due_date: form.due_date || null,
        estimated_hours: form.estimated_hours ? parseFloat(form.estimated_hours) : null,
        assigned_to: form.assigned_to || null,
        goal_id: form.goal_id || null,
        status: 'open',
        type: form.type || null,
        customer_id: form.customer_id || null,
        related_to_type: form.related_to_type || null,
        related_to_id: form.related_to_id || null,
      });

      // 2. Crear subtareas (heredan responsable del padre; salvo reasignación explícita)
      if (subtasks.length > 0) {
        await Promise.all(subtasks.map(st =>
          pmService.createSubtask(task.id, {
            title: st.title, priority: st.priority,
            estimated_hours: st.estimated_hours ?? null, due_date: st.due_date ?? null, status: 'open',
            assigned_to: st.assigned_to !== undefined ? st.assigned_to : undefined,
          })
        ));
      }

      // 3. Subir archivos
      if (attachments.length > 0) {
        setUploadingFiles(true);
        await Promise.all(attachments.filter(a => a.file).map(att =>
          pmService.uploadTaskAttachment(task.id, att.file!)
        ));
        setUploadingFiles(false);
      }

      // 4. Crear dependencias
      if (dependencies.length > 0) {
        await Promise.all(dependencies.map(dep =>
          pmService.addTaskDependency(task.id, dep.taskId, dep.type)
        ));
      }

      toast({ title: 'Tarea creada exitosamente', description: `"${form.title}" con ${subtasks.length} subtareas y ${attachments.length} archivos` });
      resetForm();
      onClose();
      onTaskCreated();
    } catch (error: any) {
      toast({ title: 'Error al crear tarea', description: error.message, variant: 'destructive' });
    } finally {
      setCreating(false);
      setUploadingFiles(false);
    }
  };

  const renderContent = () => (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
            <ClipboardList className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">{isEdit ? 'Editar Tarea' : 'Nueva Tarea'}</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">Crea o edita una tarea</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={() => { resetForm(); onClose(); }} className="h-8 w-8">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Body - scrollable */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5 min-h-0">
        {/* Título */}
        <div className="space-y-1.5">
          <Label htmlFor="panel-title" className="text-sm font-medium">Título *</Label>
          <Input
            id="panel-title"
            placeholder="¿Qué necesitas hacer?"
            value={form.title}
            onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))}
            className="bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
            autoFocus
          />
        </div>

        {/* Tarea padre (si es subtarea) */}
        {isEdit && editTask?.parent_task?.id && (
          <div className="flex items-center gap-2 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg px-3 py-2 border border-indigo-100 dark:border-indigo-800">
            <GitBranch className="h-4 w-4 text-indigo-500 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-indigo-500 dark:text-indigo-400 font-medium">Pertenece a</p>
              <p className="text-sm text-gray-700 dark:text-gray-300 truncate">{editTask.parent_task.title}</p>
            </div>
            {onOpenParent && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onOpenParent(editTask.parent_task!.id)}
                className="h-7 gap-1 text-xs border-indigo-200 text-indigo-600 hover:bg-indigo-50 dark:border-indigo-800 dark:text-indigo-400"
              >
                <Maximize2 className="h-3.5 w-3.5" />Abrir tarea
              </Button>
            )}
          </div>
        )}

        {/* Descripción */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="panel-desc" className="text-sm font-medium">Descripción</Label>
            <Button
              type="button" variant="outline" size="sm"
              onClick={handleGenerateDescription} disabled={descLoading}
              className="h-7 gap-1 text-xs border-purple-200 text-purple-600 hover:bg-purple-50 dark:border-purple-800 dark:text-purple-400"
            >
              {descLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              Generar con IA
            </Button>
          </div>
          <RichTextEditor
            value={form.description}
            onChange={(html) => setForm(f => ({ ...f, description: html }))}
            placeholder="Agrega detalles, contexto o instrucciones..."
          />
        </div>

        {/* Tipo + Prioridad */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Tipo de tarea</Label>
            <Select value={form.type || 'none'} onValueChange={(v) => setForm(f => ({ ...f, type: v === 'none' ? '' : v }))}>
              <SelectTrigger className="bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                <SelectValue placeholder="Sin tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin tipo</SelectItem>
                {Object.entries(TASK_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Prioridad</Label>
            <Select value={form.priority} onValueChange={(v) => setForm(f => ({ ...f, priority: v }))}>
              <SelectTrigger className="bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PRIORITY_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Proyecto + Cliente */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Proyecto</Label>
            <Select value={form.project_id || 'none'} onValueChange={(v) => setForm(f => ({ ...f, project_id: v === 'none' ? '' : v }))}>
              <SelectTrigger className="bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                <SelectValue placeholder="Sin proyecto" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin proyecto</SelectItem>
                {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Cliente</Label>
            <SearchSelect
              options={customers.map(c => ({ value: c.id, label: c.name }))}
              value={form.customer_id || 'none'}
              onValueChange={(v) => setForm(f => ({ ...f, customer_id: v === 'none' ? '' : v }))}
              placeholder="Sin cliente"
              searchPlaceholder="Buscar cliente..."
              noneLabel="Sin cliente"
              className="bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
            />
          </div>
        </div>

        {/* Relacionado con (espacio/habitación) - solo mostrar espacio/reserva si PMS activo */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Relacionado con</Label>
            <Select value={form.related_to_type || 'none'} onValueChange={(v) => setForm(f => ({ ...f, related_to_type: v === 'none' ? '' : v, related_to_id: '' }))}>
              <SelectTrigger className="bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                <SelectValue placeholder="Nada" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nada</SelectItem>
                {pmsActive && <SelectItem value="space">Espacio/Habitación</SelectItem>}
                {pmsActive && <SelectItem value="reservation">Reserva</SelectItem>}
                <SelectItem value="sale">Venta</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {form.related_to_type && form.related_to_type !== 'none' && (
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Buscar</Label>
              {form.related_to_type === 'space' && (
                <SearchSelect
                  options={spaces.map(s => ({ value: s.id, label: s.label, sublabel: s.type_name }))}
                  value={form.related_to_id || 'none'}
                  onValueChange={(v) => setForm(f => ({ ...f, related_to_id: v === 'none' ? '' : v }))}
                  placeholder="Seleccionar espacio..."
                  searchPlaceholder="Buscar espacio..."
                  noneLabel="Sin seleccionar"
                  className="bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                />
              )}
              {form.related_to_type === 'reservation' && (
                <SearchSelect
                  options={reservations.map(r => ({
                    value: r.id,
                    label: `${r.customer_name} — ${new Date(r.checkin).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })} → ${new Date(r.checkout).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}`,
                    sublabel: `Reserva`,
                  }))}
                  value={form.related_to_id || 'none'}
                  onValueChange={(v) => setForm(f => ({ ...f, related_to_id: v === 'none' ? '' : v }))}
                  placeholder="Seleccionar reserva..."
                  searchPlaceholder="Buscar reserva..."
                  noneLabel="Sin seleccionar"
                  className="bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                />
              )}
              {form.related_to_type === 'sale' && (
                <SearchSelect
                  options={sales.map(s => ({
                    value: s.id,
                    label: `${s.customer_name} — $${s.total.toLocaleString('es-ES', { minimumFractionDigits: 0 })}`,
                    sublabel: `${s.source} · ${new Date(s.sale_date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}`,
                  }))}
                  value={form.related_to_id || 'none'}
                  onValueChange={(v) => setForm(f => ({ ...f, related_to_id: v === 'none' ? '' : v }))}
                  placeholder="Seleccionar venta..."
                  searchPlaceholder="Buscar venta..."
                  noneLabel="Sin seleccionar"
                  className="bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                />
              )}
            </div>
          )}
        </div>

        {/* Meta vinculada (opcional) */}
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">Meta vinculada (opcional)</Label>
          <Select value={form.goal_id || 'none'} onValueChange={(v) => setForm(f => ({ ...f, goal_id: v === 'none' ? '' : v }))}>
            <SelectTrigger className="bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700">
              <SelectValue placeholder="Sin meta" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sin meta</SelectItem>
              {goals.map(g => <SelectItem key={g.id} value={g.id}>{g.title}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-gray-400">Al completar la tarea, avanzará el progreso de la meta.</p>
        </div>

        {/* Fecha + Horas */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium flex items-center gap-1"><CalendarIcon className="h-3.5 w-3.5" />Fecha límite</Label>
            <Input
              type="date"
              value={form.due_date}
              onChange={(e) => setForm(f => ({ ...f, due_date: e.target.value }))}
              className="bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium flex items-center gap-1"><Clock className="h-3.5 w-3.5" />Horas estimadas</Label>
            <Input
              type="number"
              step="0.5"
              min="0"
              placeholder="0"
              value={form.estimated_hours}
              onChange={(e) => setForm(f => ({ ...f, estimated_hours: e.target.value }))}
              className="bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
            />
          </div>
        </div>

        {isEdit && (
          <div className="space-y-1.5">
            <Label className="text-sm font-medium flex items-center gap-1"><Clock className="h-3.5 w-3.5" />Horas reales</Label>
            <Input
              type="number"
              step="0.5"
              min="0"
              placeholder="Registrar horas trabajadas"
              value={form.actual_hours}
              onChange={(e) => setForm(f => ({ ...f, actual_hours: e.target.value }))}
              className="bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
            />
          </div>
        )}

        {/* Responsable + Estado (edición) */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Responsable</Label>
            <Select value={form.assigned_to || 'none'} onValueChange={(v) => setForm(f => ({ ...f, assigned_to: v === 'none' ? '' : v }))}>
              <SelectTrigger className="bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                <SelectValue placeholder="Sin asignar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin asignar</SelectItem>
                {users.map(u => <SelectItem key={u.id} value={u.id}>{u.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {isEdit && (
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Estado</Label>
              <Select value={form.status} onValueChange={(v) => setForm(f => ({ ...f, status: v }))}>
                <SelectTrigger className="bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Pendiente</SelectItem>
                  <SelectItem value="in_progress">En Progreso</SelectItem>
                  <SelectItem value="done">Completada</SelectItem>
                  <SelectItem value="canceled">Cancelada</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* Cronómetro (solo al editar una tarea existente) */}
        {isEdit && editTask && (
          <TaskTimer
            taskId={editTask.id}
            estimatedHours={form.estimated_hours ? parseFloat(form.estimated_hours) : null}
            variant="full"
          />
        )}

        {/* Divider */}
        <div className="border-t border-gray-100 dark:border-gray-800" />

        {/* Subtareas - collapsible */}
        <div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowSubtasks(!showSubtasks)}
              className="flex items-center gap-2 flex-1 text-left text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
            >
              <ListChecks className="h-4 w-4" />
              Subtareas
              {subtasks.length > 0 && <Badge variant="secondary" className="text-xs px-1.5 py-0">{subtasks.length}</Badge>}
              {showSubtasks ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
            <Button
              type="button" variant="outline" size="sm"
              onClick={handleAISuggest} disabled={aiLoading}
              className="h-7 gap-1 text-xs border-purple-200 text-purple-600 hover:bg-purple-50 dark:border-purple-800 dark:text-purple-400"
            >
              {aiLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              Desglosar con IA
            </Button>
          </div>

          {showSubtasks && (
            <div className="mt-3 space-y-2">
              {subtasks.map((st) => (
                <div key={st.id} className="bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <div className="flex items-center gap-2 px-3 py-2 group">
                    <button
                      type="button"
                      onClick={() => handleToggleSubtask(st.id)}
                      className={cn('h-4 w-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors',
                        st.done ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 dark:border-gray-600 hover:border-green-400')}
                    >
                      {st.done && <Check className="h-3 w-3" />}
                    </button>
                    <span className={cn('text-sm flex-1 truncate', st.done ? 'text-gray-400 line-through' : 'text-gray-700 dark:text-gray-300')}>{st.title}</span>
                    {st.due_date && (
                      <span className="text-[10px] text-gray-400 flex-shrink-0 hidden sm:inline">
                        {new Date(st.due_date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
                      </span>
                    )}
                    {st.estimated_hours != null && (
                      <span className="text-[10px] text-gray-400 flex-shrink-0">{st.estimated_hours}h</span>
                    )}
                    {users.length > 0 && (
                      <Select value={st.assigned_to || 'none'} onValueChange={(v) => handleReassignSubtask(st.id, v === 'none' ? null : v)}>
                        <SelectTrigger className="h-7 w-24 text-xs border-0 bg-transparent p-1">
                          <SelectValue placeholder="Resp." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Sin asignar</SelectItem>
                          {users.map(u => <SelectItem key={u.id} value={u.id}>{u.nombre}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    )}
                    <Select value={st.priority} onValueChange={(v) => updateSubtaskField(st.id, { priority: v })}>
                      <SelectTrigger className="h-7 w-20 text-xs border-0 bg-transparent p-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(PRIORITY_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <button
                      type="button"
                      onClick={() => toggleExpandSubtask(st.id)}
                      title="Expandir"
                      className="text-gray-400 hover:text-blue-600 transition-colors"
                    >
                      {expandedSubtasks.has(st.id) ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveSubtask(st.id)}
                      className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-opacity"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {expandedSubtasks.has(st.id) && (
                    <div className="px-3 pb-3 pt-1 space-y-2 border-t border-gray-100 dark:border-gray-700">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-[11px] text-gray-500 flex items-center gap-1"><CalendarIcon className="h-3 w-3" />Fecha límite</Label>
                          <Input
                            type="date"
                            value={st.due_date ? st.due_date.split('T')[0] : ''}
                            onChange={(e) => updateSubtaskField(st.id, { due_date: e.target.value || null })}
                            className="h-8 text-xs bg-white dark:bg-gray-900"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[11px] text-gray-500 flex items-center gap-1"><Clock className="h-3 w-3" />Horas estimadas</Label>
                          <Input
                            type="number" step="0.5" min="0" placeholder="0"
                            value={st.estimated_hours != null ? String(st.estimated_hours) : ''}
                            onChange={(e) => updateSubtaskField(st.id, { estimated_hours: e.target.value ? parseFloat(e.target.value) : null })}
                            className="h-8 text-xs bg-white dark:bg-gray-900"
                          />
                        </div>
                      </div>
                      {st.persisted && onOpenSubtask ? (
                        <Button type="button" variant="outline" size="sm" onClick={() => onOpenSubtask(st.id)} className="h-8 gap-1 text-xs w-full">
                          <Maximize2 className="h-3.5 w-3.5" />Abrir editor completo (IA, adjuntos, dependencias)
                        </Button>
                      ) : (
                        <p className="text-[11px] text-gray-400">Guarda la tarea para poder añadir descripción IA, adjuntos o dependencias a la subtarea.</p>
                      )}
                    </div>
                  )}
                </div>
              ))}
              <div className="flex gap-2">
                <Input
                  placeholder="Agregar subtarea..."
                  value={newSubtask}
                  onChange={(e) => setNewSubtask(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddSubtask(); } }}
                  className="text-sm bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700"
                />
                <Button type="button" variant="outline" size="sm" onClick={handleAddSubtask} disabled={!newSubtask.trim()} className="shrink-0">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Archivos - collapsible */}
        <div>
          <button
            type="button"
            onClick={() => setShowAttachments(!showAttachments)}
            className="flex items-center gap-2 w-full text-left text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
          >
            <Paperclip className="h-4 w-4" />
            Archivos adjuntos
            {attachments.length > 0 && <Badge variant="secondary" className="text-xs px-1.5 py-0">{attachments.length}</Badge>}
            {showAttachments ? <ChevronUp className="h-3.5 w-3.5 ml-auto" /> : <ChevronDown className="h-3.5 w-3.5 ml-auto" />}
          </button>

          {showAttachments && (
            <div className="mt-3 space-y-2">
              {attachments.map((att, idx) => (
                <div key={idx} className="flex items-center gap-2.5 bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2 group">
                  {att.preview ? (
                    <img src={att.preview} alt="" className="h-8 w-8 object-cover rounded" />
                  ) : (
                    getFileIcon(att.file?.type || 'application/octet-stream')
                  )}
                  <div className="flex-1 min-w-0">
                    {att.persisted && att.file_url ? (
                      <a href={att.file_url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline truncate block">{att.file_name}</a>
                    ) : (
                      <p className="text-sm text-gray-700 dark:text-gray-300 truncate">{att.file_name || att.file?.name}</p>
                    )}
                    <p className="text-xs text-gray-400">{formatFileSize(att.file_size ?? att.file?.size ?? 0)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveAttachment(idx)}
                    className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-opacity"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}

              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={handleFilesSelected}
                className="hidden"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.png,.jpg,.jpeg,.gif,.svg,.zip,.rar"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="w-full border-dashed border-gray-300 dark:border-gray-600 text-gray-500 hover:text-blue-600 hover:border-blue-400"
              >
                <Paperclip className="h-4 w-4 mr-1.5" />
                Seleccionar archivos
              </Button>
              <p className="text-xs text-gray-400 text-center">PDF, Word, Excel, imágenes — máx. 10MB c/u</p>
            </div>
          )}
        </div>

        {/* Dependencias - collapsible */}
        <div>
          <button
            type="button"
            onClick={() => setShowDependencies(!showDependencies)}
            className="flex items-center gap-2 w-full text-left text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
          >
            <Link2 className="h-4 w-4" />
            Dependencias
            {dependencies.length > 0 && <Badge variant="secondary" className="text-xs px-1.5 py-0">{dependencies.length}</Badge>}
            {showDependencies ? <ChevronUp className="h-3.5 w-3.5 ml-auto" /> : <ChevronDown className="h-3.5 w-3.5 ml-auto" />}
          </button>

          {showDependencies && (
            <div className="mt-3 space-y-2">
              <p className="text-xs text-gray-500">Tareas que deben completarse antes de esta:</p>
              {dependencies.map((dep) => (
                <div key={dep.taskId} className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2 group">
                  <Link2 className="h-3.5 w-3.5 text-orange-500 flex-shrink-0" />
                  <span className="text-sm flex-1 text-gray-700 dark:text-gray-300 truncate">{dep.title}</span>
                  <Badge variant="outline" className="text-[10px] px-1.5">{dep.type === 'blocks' ? 'Bloquea' : 'Relacionada'}</Badge>
                  <button
                    type="button"
                    onClick={() => handleRemoveDependency(dep.taskId)}
                    className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-opacity"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              {existingTasks.length > 0 && (
                <Select onValueChange={(taskId) => handleAddDependency(taskId)}>
                  <SelectTrigger className="text-sm bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
                    <SelectValue placeholder="Seleccionar tarea bloqueante..." />
                  </SelectTrigger>
                  <SelectContent>
                    {existingTasks.filter(t => t.id !== editTask?.id && !dependencies.find(d => d.taskId === t.id)).map(t => (
                      <SelectItem key={t.id} value={t.id}>
                        <span className="truncate">{t.title}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {existingTasks.length === 0 && (
                <p className="text-xs text-gray-400 italic">No hay tareas existentes para vincular</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex gap-2 flex-shrink-0">
        {isEdit ? (
          <Button variant="outline" onClick={handleDelete} disabled={deleting} className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 dark:border-red-900/40">
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          </Button>
        ) : (
          <Button variant="outline" onClick={() => { resetForm(); onClose(); }} className="flex-1">
            Cancelar
          </Button>
        )}
        <Button
          onClick={handleCreate}
          disabled={creating || !form.title.trim() || !form.project_id}
          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
        >
          {creating ? (
            <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />{uploadingFiles ? 'Subiendo archivos...' : (isEdit ? 'Guardando...' : 'Creando...')}</>
          ) : (
            isEdit ? 'Guardar Cambios' : 'Crear Tarea'
          )}
        </Button>
      </div>
    </div>
  );

  return (
    <Sheet open={isOpen} onOpenChange={(open) => { if (!open) { resetForm(); onClose(); } }}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-2xl lg:max-w-3xl p-0 border-0 bg-white dark:bg-gray-900 [&>button:last-child]:hidden"
      >
        <VisuallyHidden.Root>
          <SheetTitle>{isEdit ? 'Editar Tarea' : 'Nueva Tarea'}</SheetTitle>
        </VisuallyHidden.Root>
        {renderContent()}
      </SheetContent>
    </Sheet>
  );
}
