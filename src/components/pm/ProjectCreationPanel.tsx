'use client';

import React, { useState, useCallback, useEffect } from 'react';
import {
  X,
  Plus,
  Loader2,
  Sparkles,
  FolderKanban,
  CalendarIcon,
  DollarSign,
  Users,
  ChevronDown,
  ChevronUp,
  Trash2,
  UserPlus,
  Shuffle,
  Hash,
  Tag,
  Activity,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RichTextEditor } from '@/components/pm/RichTextEditor';
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
import { pmService, type Project, type PMTask } from '@/lib/services/pmService';
import { RelatedTasksList } from '@/components/pm/RelatedTasksList';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { cn } from '@/utils/Utils';

interface MemberItem {
  userId: string;
  nombre: string;
  role: string;
}

interface ProjectCreationPanelProps {
  isOpen: boolean;
  onClose: () => void;
  users: Array<{ id: string; nombre: string }>;
  onProjectCreated: () => void;
  editProject?: Project | null;
}

const INITIAL_FORM = {
  name: '',
  description: '',
  status: 'draft',
  priority: 'med',
  start_date: '',
  end_date: '',
  budget: '',
  owner_id: '',
  code: '',
  category: '',
  tags: '',
  health: 'on_track',
  progress: '0',
};

const ROLE_LABELS: Record<string, string> = {
  owner: 'Líder',
  manager: 'Gerente',
  member: 'Miembro',
  viewer: 'Observador',
};

export default function ProjectCreationPanel({ isOpen, onClose, users, onProjectCreated, editProject }: ProjectCreationPanelProps) {
  const { toast } = useToast();
  const [isMobile, setIsMobile] = useState(false);
  const isEdit = !!editProject;

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)');
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const [form, setForm] = useState(INITIAL_FORM);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [distributing, setDistributing] = useState(false);
  const [members, setMembers] = useState<MemberItem[]>([]);
  const [showMembers, setShowMembers] = useState(false);
  const [relatedTasks, setRelatedTasks] = useState<PMTask[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);

  const resetForm = useCallback(() => {
    setForm(INITIAL_FORM);
    setMembers([]);
    setShowMembers(false);
  }, []);

  // Precargar datos al editar
  useEffect(() => {
    if (editProject) {
      setForm({
        name: editProject.name || '',
        description: editProject.description || '',
        status: editProject.status || 'draft',
        priority: editProject.priority || 'med',
        start_date: editProject.start_date || '',
        end_date: editProject.end_date || '',
        budget: editProject.budget != null ? String(editProject.budget) : '',
        owner_id: editProject.owner_id || '',
        code: editProject.code || '',
        category: editProject.category || '',
        tags: (editProject.tags || []).join(', '),
        health: editProject.health || 'on_track',
        progress: editProject.progress != null ? String(editProject.progress) : '0',
      });
      pmService.getProjectMembers(editProject.id).then(pm => {
        setMembers(pm.map(m => ({
          userId: m.user_id,
          nombre: users.find(u => u.id === m.user_id)?.nombre || 'Usuario',
          role: m.role,
        })));
        if (pm.length > 0) setShowMembers(true);
      });
      setLoadingTasks(true);
      pmService.getProjectTasks(editProject.id).then(t => { setRelatedTasks(t); setLoadingTasks(false); }).catch(() => setLoadingTasks(false));
    } else {
      resetForm();
      setRelatedTasks([]);
    }
  }, [editProject, users, resetForm]);

  const handleDelete = async () => {
    if (!editProject) return;
    if (!window.confirm(`¿Eliminar el proyecto "${editProject.name}"? Esta acción no se puede deshacer.`)) return;
    setDeleting(true);
    try {
      await pmService.deleteProject(editProject.id);
      toast({ title: 'Proyecto eliminado' });
      resetForm();
      onClose();
      onProjectCreated();
    } catch (error: any) {
      toast({ title: 'Error al eliminar', description: error.message, variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  const handleDistribute = async () => {
    if (!editProject) return;
    setDistributing(true);
    try {
      const n = await pmService.distributeProjectTasks(editProject.id);
      toast({ title: 'Tareas distribuidas', description: `${n} tarea(s) asignadas por cargo y departamento` });
      onProjectCreated();
    } catch (error: any) {
      toast({ title: 'Error al distribuir', description: error.message, variant: 'destructive' });
    } finally {
      setDistributing(false);
    }
  };

  const [descLoading, setDescLoading] = useState(false);
  const handleGenerateDescription = async () => {
    if (!form.name.trim()) { toast({ title: 'Escribe un nombre primero', variant: 'destructive' }); return; }
    setDescLoading(true);
    try {
      const owner = users.find(u => u.id === form.owner_id)?.nombre;
      const res = await fetch('/api/ai/pm-assist', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'describe', entity: 'proyecto', title: form.name, description: form.description,
          organizationId: getOrganizationId(),
          context: { priority: form.priority, due_date: form.end_date, assignee: owner },
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

  const handleCreate = async () => {
    if (!form.name.trim()) { toast({ title: 'El nombre es requerido', variant: 'destructive' }); return; }

    setCreating(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        status: form.status as any,
        priority: form.priority as any,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        budget: form.budget ? parseFloat(form.budget) : null,
        owner_id: form.owner_id || null,
        code: form.code.trim() || null,
        category: form.category.trim() || null,
        tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
        health: form.health as any,
        progress: form.progress ? Math.max(0, Math.min(100, parseFloat(form.progress))) : 0,
      };

      if (isEdit && editProject) {
        await pmService.updateProject(editProject.id, payload);
        // Sincronizar miembros: agregar nuevos, quitar eliminados
        const existing = await pmService.getProjectMembers(editProject.id);
        const existingIds = new Set(existing.map(m => m.user_id));
        const currentIds = new Set(members.map(m => m.userId));
        await Promise.all([
          ...members.filter(m => !existingIds.has(m.userId)).map(m => pmService.addProjectMember(editProject.id, m.userId, m.role)),
          ...existing.filter(m => !currentIds.has(m.user_id)).map(m => pmService.removeProjectMember(editProject.id, m.user_id)),
        ]);
        toast({ title: 'Proyecto actualizado', description: `"${form.name}" guardado` });
      } else {
        const project = await pmService.createProject(payload);
        if (members.length > 0) {
          await Promise.all(members.map(m => pmService.addProjectMember(project.id, m.userId, m.role)));
        }
        toast({ title: 'Proyecto creado exitosamente', description: `"${form.name}" con ${members.length} miembros` });
      }

      resetForm();
      onClose();
      onProjectCreated();
    } catch (error: any) {
      toast({ title: isEdit ? 'Error al actualizar proyecto' : 'Error al crear proyecto', description: error.message, variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  const renderContent = () => (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
            <FolderKanban className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">{isEdit ? 'Editar Proyecto' : 'Nuevo Proyecto'}</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">Define alcance, equipo y presupuesto</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={() => { resetForm(); onClose(); }} className="h-8 w-8">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5 min-h-0">
        {/* Nombre */}
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">Nombre *</Label>
          <Input
            placeholder="Nombre del proyecto"
            value={form.name}
            onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
            className="bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
            autoFocus
          />
        </div>

        {/* Descripción */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Descripción</Label>
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
            placeholder="Objetivo, alcance y contexto del proyecto..."
          />
        </div>

        {/* Estado + Prioridad */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Estado</Label>
            <Select value={form.status} onValueChange={(v) => setForm(f => ({ ...f, status: v }))}>
              <SelectTrigger className="bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Borrador</SelectItem>
                <SelectItem value="active">Activo</SelectItem>
                <SelectItem value="on_hold">En Pausa</SelectItem>
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
                <SelectItem value="low">Baja</SelectItem>
                <SelectItem value="med">Media</SelectItem>
                <SelectItem value="high">Alta</SelectItem>
                <SelectItem value="critical">Crítica</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Fechas */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium flex items-center gap-1"><CalendarIcon className="h-3.5 w-3.5" />Fecha inicio</Label>
            <Input
              type="date"
              value={form.start_date}
              onChange={(e) => setForm(f => ({ ...f, start_date: e.target.value }))}
              className="bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium flex items-center gap-1"><CalendarIcon className="h-3.5 w-3.5" />Fecha fin</Label>
            <Input
              type="date"
              value={form.end_date}
              onChange={(e) => setForm(f => ({ ...f, end_date: e.target.value }))}
              className="bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
            />
          </div>
        </div>

        {/* Presupuesto + Responsable */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium flex items-center gap-1"><DollarSign className="h-3.5 w-3.5" />Presupuesto</Label>
            <Input
              type="number"
              step="1000"
              min="0"
              placeholder="0"
              value={form.budget}
              onChange={(e) => setForm(f => ({ ...f, budget: e.target.value }))}
              className="bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Responsable</Label>
            <Select value={form.owner_id} onValueChange={(v) => setForm(f => ({ ...f, owner_id: v }))}>
              <SelectTrigger className="bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                <SelectValue placeholder="Seleccionar" />
              </SelectTrigger>
              <SelectContent>
                {users.map(u => <SelectItem key={u.id} value={u.id}>{u.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Clave + Categoría */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium flex items-center gap-1"><Hash className="h-3.5 w-3.5" />Clave</Label>
            <Input
              placeholder="Ej: PROJ-1"
              value={form.code}
              onChange={(e) => setForm(f => ({ ...f, code: e.target.value }))}
              className="bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium flex items-center gap-1"><Tag className="h-3.5 w-3.5" />Categoría</Label>
            <Input
              placeholder="Ej: Marketing, Operaciones..."
              value={form.category}
              onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))}
              className="bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
            />
          </div>
        </div>

        {/* Salud + Progreso */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium flex items-center gap-1"><Activity className="h-3.5 w-3.5" />Salud</Label>
            <Select value={form.health} onValueChange={(v) => setForm(f => ({ ...f, health: v }))}>
              <SelectTrigger className="bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="on_track">En curso</SelectItem>
                <SelectItem value="at_risk">En riesgo</SelectItem>
                <SelectItem value="off_track">Desviado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Progreso ({form.progress || 0}%)</Label>
            <Input
              type="number"
              min="0"
              max="100"
              value={form.progress}
              onChange={(e) => setForm(f => ({ ...f, progress: e.target.value }))}
              className="bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
            />
          </div>
        </div>

        {/* Etiquetas */}
        <div className="space-y-1.5">
          <Label className="text-sm font-medium flex items-center gap-1"><Tag className="h-3.5 w-3.5" />Etiquetas</Label>
          <Input
            placeholder="Separadas por comas: urgente, cliente-vip, q1"
            value={form.tags}
            onChange={(e) => setForm(f => ({ ...f, tags: e.target.value }))}
            className="bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
          />
        </div>

        {/* Divider */}
        <div className="border-t border-gray-100 dark:border-gray-800" />

        {/* Miembros del equipo - collapsible */}
        <div>
          <button
            type="button"
            onClick={() => setShowMembers(!showMembers)}
            className="flex items-center gap-2 w-full text-left text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
          >
            <Users className="h-4 w-4" />
            Equipo del proyecto
            {members.length > 0 && <Badge variant="secondary" className="text-xs px-1.5 py-0">{members.length}</Badge>}
            {showMembers ? <ChevronUp className="h-3.5 w-3.5 ml-auto" /> : <ChevronDown className="h-3.5 w-3.5 ml-auto" />}
          </button>

          {showMembers && (
            <div className="mt-3 space-y-2">
              {members.map((m) => (
                <div key={m.userId} className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2 group">
                  <UserPlus className="h-3.5 w-3.5 text-blue-500 flex-shrink-0" />
                  <span className="text-sm flex-1 text-gray-700 dark:text-gray-300 truncate">{m.nombre}</span>
                  <Select value={m.role} onValueChange={(v) => setMembers(prev => prev.map(x => x.userId === m.userId ? { ...x, role: v } : x))}>
                    <SelectTrigger className="h-7 w-24 text-xs border-0 bg-transparent p-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(ROLE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <button
                    type="button"
                    onClick={() => setMembers(prev => prev.filter(x => x.userId !== m.userId))}
                    className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-opacity"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              <Select onValueChange={(userId) => {
                const user = users.find(u => u.id === userId);
                if (user && !members.find(m => m.userId === userId)) {
                  setMembers(prev => [...prev, { userId: user.id, nombre: user.nombre, role: 'member' }]);
                }
              }}>
                <SelectTrigger className="text-sm bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
                  <SelectValue placeholder="Agregar miembro..." />
                </SelectTrigger>
                <SelectContent>
                  {users.filter(u => !members.find(m => m.userId === u.id)).map(u => (
                    <SelectItem key={u.id} value={u.id}>{u.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {isEdit && members.length > 1 && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleDistribute}
                  disabled={distributing}
                  className="w-full mt-1 border-dashed text-blue-600 hover:text-blue-700 hover:border-blue-400"
                >
                  {distributing ? (
                    <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Distribuyendo...</>
                  ) : (
                    <><Shuffle className="h-4 w-4 mr-1.5" />Distribuir tareas por cargo/departamento</>
                  )}
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Tareas del proyecto (solo edición) */}
        {isEdit && (
          <>
            <div className="border-t border-gray-100 dark:border-gray-800" />
            <div>
              <div className="flex items-center gap-2 mb-3 text-sm font-medium text-gray-700 dark:text-gray-300">
                <Activity className="h-4 w-4" />
                Tareas del proyecto
                {relatedTasks.length > 0 && <Badge variant="secondary" className="text-xs px-1.5 py-0">{relatedTasks.length}</Badge>}
              </div>
              <RelatedTasksList tasks={relatedTasks} loading={loadingTasks} show="goal" emptyLabel="Aún no hay tareas en este proyecto." />
            </div>
          </>
        )}
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
          disabled={creating || !form.name.trim()}
          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
        >
          {creating ? (
            <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />{isEdit ? 'Guardando...' : 'Creando...'}</>
          ) : (
            isEdit ? 'Guardar Cambios' : 'Crear Proyecto'
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
          <SheetTitle>{isEdit ? 'Editar Proyecto' : 'Nuevo Proyecto'}</SheetTitle>
        </VisuallyHidden.Root>
        {renderContent()}
      </SheetContent>
    </Sheet>
  );
}
