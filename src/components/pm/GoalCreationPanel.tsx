'use client';

import React, { useState, useCallback, useEffect } from 'react';
import {
  X,
  Loader2,
  Target,
  CalendarIcon,
  ChevronDown,
  ChevronUp,
  Trash2,
  ListChecks,
  Plus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
import { pmService, type Goal } from '@/lib/services/pmService';
import { cn } from '@/utils/Utils';

interface KeyResult {
  id: string;
  text: string;
}

interface GoalCreationPanelProps {
  isOpen: boolean;
  onClose: () => void;
  projects: Array<{ id: string; name: string }>;
  users: Array<{ id: string; nombre: string }>;
  onGoalCreated: () => void;
  editGoal?: Goal | null;
}

const INITIAL_FORM = {
  title: '',
  description: '',
  type: 'goal',
  status: 'draft',
  target_date: '',
  project_id: '',
  owner_id: '',
};

export default function GoalCreationPanel({ isOpen, onClose, projects, users, onGoalCreated, editGoal }: GoalCreationPanelProps) {
  const { toast } = useToast();
  const [isMobile, setIsMobile] = useState(false);
  const isEdit = !!editGoal;

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
  const [keyResults, setKeyResults] = useState<KeyResult[]>([]);
  const [showKeyResults, setShowKeyResults] = useState(false);
  const [newKR, setNewKR] = useState('');

  const resetForm = useCallback(() => {
    setForm(INITIAL_FORM);
    setKeyResults([]);
    setNewKR('');
    setShowKeyResults(false);
  }, []);

  // Precargar datos al editar
  useEffect(() => {
    if (editGoal) {
      setForm({
        title: editGoal.title || '',
        description: editGoal.description || '',
        type: editGoal.type || 'goal',
        status: editGoal.status || 'draft',
        target_date: editGoal.target_date || '',
        project_id: editGoal.project_id || '',
        owner_id: editGoal.owner_id || '',
      });
      setKeyResults([]);
    } else {
      resetForm();
    }
  }, [editGoal, resetForm]);

  const handleDelete = async () => {
    if (!editGoal) return;
    if (!window.confirm(`¿Eliminar "${editGoal.title}"? Esta acción no se puede deshacer.`)) return;
    setDeleting(true);
    try {
      await pmService.deleteGoal(editGoal.id);
      toast({ title: 'Meta eliminada' });
      resetForm();
      onClose();
      onGoalCreated();
    } catch (error: any) {
      toast({ title: 'Error al eliminar', description: error.message, variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  const handleAddKR = () => {
    if (!newKR.trim()) return;
    setKeyResults(prev => [...prev, { id: crypto.randomUUID(), text: newKR.trim() }]);
    setNewKR('');
  };

  const handleCreate = async () => {
    if (!form.title.trim()) { toast({ title: 'El título es requerido', variant: 'destructive' }); return; }

    setCreating(true);
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim()
          ? (keyResults.length > 0
            ? `${form.description.trim()}\n\n---\nResultados clave:\n${keyResults.map((kr, i) => `${i + 1}. ${kr.text}`).join('\n')}`
            : form.description.trim())
          : (keyResults.length > 0
            ? `Resultados clave:\n${keyResults.map((kr, i) => `${i + 1}. ${kr.text}`).join('\n')}`
            : null),
        type: form.type as any,
        status: form.status as any,
        target_date: form.target_date || null,
        project_id: form.project_id || null,
        owner_id: form.owner_id || null,
      };

      if (isEdit && editGoal) {
        await pmService.updateGoal(editGoal.id, payload);
        toast({ title: 'Meta actualizada', description: `"${form.title}" guardada` });
      } else {
        await pmService.createGoal(payload);
        toast({ title: 'Meta creada exitosamente', description: `"${form.title}" creada` });
      }
      resetForm();
      onClose();
      onGoalCreated();
    } catch (error: any) {
      toast({ title: isEdit ? 'Error al actualizar meta' : 'Error al crear meta', description: error.message, variant: 'destructive' });
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
            <Target className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">{isEdit ? 'Editar Meta' : 'Nueva Meta'}</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">Define objetivos con resultados clave</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={() => { resetForm(); onClose(); }} className="h-8 w-8">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5 min-h-0">
        {/* Título */}
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">Título *</Label>
          <Input
            placeholder="¿Qué quieres lograr?"
            value={form.title}
            onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))}
            className="bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
            autoFocus
          />
        </div>

        {/* Descripción */}
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">Descripción / Contexto</Label>
          <Textarea
            placeholder="Razón, contexto o impacto esperado..."
            rows={3}
            value={form.description}
            onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
            className="bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 resize-none"
          />
        </div>

        {/* Tipo + Estado */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Tipo</Label>
            <Select value={form.type} onValueChange={(v) => setForm(f => ({ ...f, type: v }))}>
              <SelectTrigger className="bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="goal">Meta</SelectItem>
                <SelectItem value="purpose">Propósito</SelectItem>
                <SelectItem value="proposal">Propuesta</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Estado</Label>
            <Select value={form.status} onValueChange={(v) => setForm(f => ({ ...f, status: v }))}>
              <SelectTrigger className="bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Borrador</SelectItem>
                <SelectItem value="active">Activa</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Fecha + Responsable */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium flex items-center gap-1"><CalendarIcon className="h-3.5 w-3.5" />Fecha objetivo</Label>
            <Input
              type="date"
              value={form.target_date}
              onChange={(e) => setForm(f => ({ ...f, target_date: e.target.value }))}
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

        {/* Proyecto asociado */}
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">Proyecto asociado</Label>
          <Select value={form.project_id} onValueChange={(v) => setForm(f => ({ ...f, project_id: v }))}>
            <SelectTrigger className="bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700">
              <SelectValue placeholder="Sin proyecto (independiente)" />
            </SelectTrigger>
            <SelectContent>
              {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Divider */}
        <div className="border-t border-gray-100 dark:border-gray-800" />

        {/* Key Results - collapsible */}
        <div>
          <button
            type="button"
            onClick={() => setShowKeyResults(!showKeyResults)}
            className="flex items-center gap-2 w-full text-left text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
          >
            <ListChecks className="h-4 w-4" />
            Resultados Clave (KRs)
            {keyResults.length > 0 && <Badge variant="secondary" className="text-xs px-1.5 py-0">{keyResults.length}</Badge>}
            {showKeyResults ? <ChevronUp className="h-3.5 w-3.5 ml-auto" /> : <ChevronDown className="h-3.5 w-3.5 ml-auto" />}
          </button>

          {showKeyResults && (
            <div className="mt-3 space-y-2">
              <p className="text-xs text-gray-500">¿Cómo medirás el éxito de esta meta?</p>
              {keyResults.map((kr, idx) => (
                <div key={kr.id} className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2 group">
                  <span className="text-xs font-bold text-blue-600 flex-shrink-0">{idx + 1}.</span>
                  <span className="text-sm flex-1 text-gray-700 dark:text-gray-300">{kr.text}</span>
                  <button
                    type="button"
                    onClick={() => setKeyResults(prev => prev.filter(x => x.id !== kr.id))}
                    className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-opacity"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              <div className="flex gap-2">
                <Input
                  placeholder="Ej: Incrementar ventas en 20%"
                  value={newKR}
                  onChange={(e) => setNewKR(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddKR(); } }}
                  className="flex-1 text-sm bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700"
                />
                <Button type="button" variant="outline" size="icon" onClick={handleAddKR} className="h-9 w-9 flex-shrink-0">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
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
          disabled={creating || !form.title.trim()}
          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
        >
          {creating ? (
            <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />{isEdit ? 'Guardando...' : 'Creando...'}</>
          ) : (
            isEdit ? 'Guardar Cambios' : 'Crear Meta'
          )}
        </Button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop: Panel inline */}
      <div
        className={cn(
          'hidden lg:flex flex-col h-full',
          isOpen ? 'w-80 xl:w-96' : 'w-0',
          'bg-white dark:bg-gray-900',
          'border-l border-gray-200 dark:border-gray-700',
          'transition-all duration-300 ease-in-out',
          'overflow-hidden flex-shrink-0'
        )}
      >
        {isOpen && renderContent()}
      </div>

      {/* Móvil: Sheet */}
      {isMobile && (
        <Sheet open={isOpen} onOpenChange={(open) => { if (!open) { resetForm(); onClose(); } }}>
          <SheetContent
            side="right"
            className="w-full sm:w-[440px] sm:max-w-[440px] p-0 border-0 bg-white dark:bg-gray-900 [&>button:last-child]:hidden"
          >
            <VisuallyHidden.Root>
              <SheetTitle>{isEdit ? 'Editar Meta' : 'Nueva Meta'}</SheetTitle>
            </VisuallyHidden.Root>
            {renderContent()}
          </SheetContent>
        </Sheet>
      )}
    </>
  );
}
