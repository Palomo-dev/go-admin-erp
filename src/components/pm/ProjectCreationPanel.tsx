'use client';

import React, { useState, useCallback, useEffect } from 'react';
import {
  X,
  Plus,
  Loader2,
  FolderKanban,
  CalendarIcon,
  DollarSign,
  Users,
  ChevronDown,
  ChevronUp,
  Trash2,
  UserPlus,
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
import { pmService } from '@/lib/services/pmService';
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
};

const ROLE_LABELS: Record<string, string> = {
  owner: 'Líder',
  manager: 'Gerente',
  member: 'Miembro',
  viewer: 'Observador',
};

export default function ProjectCreationPanel({ isOpen, onClose, users, onProjectCreated }: ProjectCreationPanelProps) {
  const { toast } = useToast();
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)');
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const [form, setForm] = useState(INITIAL_FORM);
  const [creating, setCreating] = useState(false);
  const [members, setMembers] = useState<MemberItem[]>([]);
  const [showMembers, setShowMembers] = useState(false);

  const resetForm = useCallback(() => {
    setForm(INITIAL_FORM);
    setMembers([]);
    setShowMembers(false);
  }, []);

  const handleCreate = async () => {
    if (!form.name.trim()) { toast({ title: 'El nombre es requerido', variant: 'destructive' }); return; }

    setCreating(true);
    try {
      const project = await pmService.createProject({
        name: form.name.trim(),
        description: form.description.trim() || null,
        status: form.status as any,
        priority: form.priority as any,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        budget: form.budget ? parseFloat(form.budget) : null,
        owner_id: form.owner_id || null,
      });

      // Agregar miembros
      if (members.length > 0) {
        await Promise.all(members.map(m =>
          pmService.addProjectMember(project.id, m.userId, m.role)
        ));
      }

      toast({ title: 'Proyecto creado exitosamente', description: `"${form.name}" con ${members.length} miembros` });
      resetForm();
      onClose();
      onProjectCreated();
    } catch (error: any) {
      toast({ title: 'Error al crear proyecto', description: error.message, variant: 'destructive' });
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
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">Nuevo Proyecto</h2>
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
          <Label className="text-sm font-medium">Descripción</Label>
          <Textarea
            placeholder="Objetivo, alcance y contexto del proyecto..."
            rows={3}
            value={form.description}
            onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
            className="bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 resize-none"
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
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex gap-2 flex-shrink-0">
        <Button variant="outline" onClick={() => { resetForm(); onClose(); }} className="flex-1">
          Cancelar
        </Button>
        <Button
          onClick={handleCreate}
          disabled={creating || !form.name.trim()}
          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
        >
          {creating ? (
            <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Creando...</>
          ) : (
            'Crear Proyecto'
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
              <SheetTitle>Nuevo Proyecto</SheetTitle>
            </VisuallyHidden.Root>
            {renderContent()}
          </SheetContent>
        </Sheet>
      )}
    </>
  );
}
