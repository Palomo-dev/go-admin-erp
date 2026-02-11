'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, Users, User, X, Search, Briefcase, Shield } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { useOrganization } from '@/lib/hooks/useOrganization';
import type { CreateAlertPayload } from './types';

interface CreateAlertDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: CreateAlertPayload) => Promise<boolean>;
}

interface OrgMember {
  user_id: string;
  email: string;
  name: string;
  role_id: number | null;
  role_name: string;
  job_position_name: string;
}

const severityOptions = [
  { value: 'info', label: 'Info' },
  { value: 'warning', label: 'Warning' },
  { value: 'critical', label: 'Crítica' },
];

const moduleOptions = [
  { value: 'sistema', label: 'Sistema' },
  { value: 'inventario', label: 'Inventario' },
  { value: 'finanzas', label: 'Finanzas' },
  { value: 'pos', label: 'POS' },
  { value: 'crm', label: 'CRM' },
  { value: 'hrm', label: 'HRM' },
  { value: 'pms', label: 'PMS' },
  { value: 'integraciones', label: 'Integraciones' },
  { value: 'transporte', label: 'Transporte' },
];

const selectCls = 'w-full h-9 px-3 text-sm rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100';

export function CreateAlertDialog({ open, onOpenChange, onSubmit }: CreateAlertDialogProps) {
  const { organization } = useOrganization();
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [severity, setSeverity] = useState<'info' | 'warning' | 'critical'>('info');
  const [sourceModule, setSourceModule] = useState('sistema');
  const [targetType, setTargetType] = useState<'all' | 'specific'>('all');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [filterRole, setFilterRole] = useState('all');
  const [filterJob, setFilterJob] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    if (!open || !organization?.id) return;
    const load = async () => {
      const { supabase } = await import('@/lib/supabase/config');
      const { data } = await supabase
        .from('organization_members')
        .select('user_id, role_id, profiles(email, first_name, last_name), roles(name), job_positions(name)')
        .eq('organization_id', organization.id)
        .eq('is_active', true);

      if (data) {
        setMembers(data.map((m: any) => ({
          user_id: m.user_id,
          email: m.profiles?.email || '',
          name: [m.profiles?.first_name, m.profiles?.last_name].filter(Boolean).join(' ') || m.profiles?.email || 'Sin nombre',
          role_id: m.role_id,
          role_name: m.roles?.name || '',
          job_position_name: m.job_positions?.name || '',
        })));
      }
    };
    load();
  }, [open, organization?.id]);

  // Listas únicas de roles y cargos
  const roles = useMemo(() => {
    const set = new Map<string, string>();
    members.forEach((m) => { if (m.role_name) set.set(String(m.role_id), m.role_name); });
    return Array.from(set.entries()).map(([id, name]) => ({ id, name }));
  }, [members]);

  const jobPositions = useMemo(() => {
    const set = new Set<string>();
    members.forEach((m) => { if (m.job_position_name) set.add(m.job_position_name); });
    return Array.from(set).sort();
  }, [members]);

  // Miembros filtrados
  const filteredMembers = useMemo(() => {
    return members.filter((m) => {
      if (filterRole !== 'all' && String(m.role_id) !== filterRole) return false;
      if (filterJob !== 'all' && m.job_position_name !== filterJob) return false;
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        return m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q);
      }
      return true;
    });
  }, [members, filterRole, filterJob, searchTerm]);

  const toggleUser = (uid: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]
    );
  };

  const selectAllFiltered = () => {
    const ids = filteredMembers.map((m) => m.user_id);
    setSelectedUserIds((prev) => {
      const set = new Set([...prev, ...ids]);
      return Array.from(set);
    });
  };

  const deselectAllFiltered = () => {
    const ids = new Set(filteredMembers.map((m) => m.user_id));
    setSelectedUserIds((prev) => prev.filter((id) => !ids.has(id)));
  };

  const reset = () => {
    setTitle('');
    setMessage('');
    setSeverity('info');
    setSourceModule('sistema');
    setTargetType('all');
    setSelectedUserIds([]);
    setFilterRole('all');
    setFilterJob('all');
    setSearchTerm('');
  };

  const handleSubmit = async () => {
    if (!title.trim() || !message.trim()) return;
    setIsSending(true);

    const success = await onSubmit({
      title: title.trim(),
      message: message.trim(),
      severity,
      source_module: sourceModule,
      target_type: targetType,
      ...(targetType === 'specific' && selectedUserIds.length > 0 ? { target_user_ids: selectedUserIds } : {}),
    });

    setIsSending(false);
    if (success) {
      reset();
      onOpenChange(false);
    }
  };

  const selectedMembers = members.filter((m) => selectedUserIds.includes(m.user_id));
  const allFilteredSelected = filteredMembers.length > 0 && filteredMembers.every((m) => selectedUserIds.includes(m.user_id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg bg-white dark:bg-gray-900 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nueva Alerta</DialogTitle>
          <DialogDescription>Crear alerta manual del sistema.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-600 dark:text-gray-400">Severidad</Label>
              <select value={severity} onChange={(e) => setSeverity(e.target.value as any)} className={selectCls}>
                {severityOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-600 dark:text-gray-400">Módulo</Label>
              <select value={sourceModule} onChange={(e) => setSourceModule(e.target.value)} className={selectCls}>
                {moduleOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-gray-600 dark:text-gray-400">Título *</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Título de la alerta"
              className="bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-gray-600 dark:text-gray-400">Mensaje *</Label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Descripción detallada de la alerta..."
              rows={2}
              className="w-full px-3 py-2 text-sm rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Destinatarios */}
          <div className="space-y-2">
            <Label className="text-xs text-gray-600 dark:text-gray-400">Destinatarios</Label>
            <div className="flex gap-2">
              <button
                onClick={() => { setTargetType('all'); setSelectedUserIds([]); }}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border-2 transition-all',
                  targetType === 'all'
                    ? 'bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700'
                    : 'bg-gray-50 dark:bg-gray-800 text-gray-500 border-gray-200 dark:border-gray-700 hover:border-gray-300',
                )}
              >
                <Users className="h-3.5 w-3.5" /> Toda la organización
              </button>
              <button
                onClick={() => setTargetType('specific')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border-2 transition-all',
                  targetType === 'specific'
                    ? 'bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700'
                    : 'bg-gray-50 dark:bg-gray-800 text-gray-500 border-gray-200 dark:border-gray-700 hover:border-gray-300',
                )}
              >
                <User className="h-3.5 w-3.5" /> Seleccionar personas
              </button>
            </div>

            {targetType === 'specific' && (
              <div className="space-y-2 mt-1">
                {/* Filtros por rol y cargo */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="relative">
                    <Shield className="absolute left-2 top-2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
                    <select
                      value={filterRole}
                      onChange={(e) => setFilterRole(e.target.value)}
                      className="w-full h-8 pl-7 pr-2 text-xs rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    >
                      <option value="all">Todos los roles</option>
                      {roles.map((r) => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="relative">
                    <Briefcase className="absolute left-2 top-2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
                    <select
                      value={filterJob}
                      onChange={(e) => setFilterJob(e.target.value)}
                      className="w-full h-8 pl-7 pr-2 text-xs rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    >
                      <option value="all">Todos los cargos</option>
                      {jobPositions.map((jp) => (
                        <option key={jp} value={jp}>{jp}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Búsqueda */}
                <div className="relative">
                  <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
                  <Input
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Buscar por nombre o email..."
                    className="h-8 pl-8 text-xs bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                  />
                </div>

                {/* Seleccionar / deseleccionar todos */}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">
                    {filteredMembers.length} persona{filteredMembers.length !== 1 ? 's' : ''} encontrada{filteredMembers.length !== 1 ? 's' : ''}
                  </span>
                  <button
                    onClick={allFilteredSelected ? deselectAllFiltered : selectAllFiltered}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium"
                  >
                    {allFilteredSelected ? 'Deseleccionar filtrados' : 'Seleccionar todos filtrados'}
                  </button>
                </div>

                {/* Lista de miembros */}
                <div className="max-h-36 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-100 dark:divide-gray-800">
                  {filteredMembers.length === 0 ? (
                    <p className="text-xs text-gray-400 p-3 text-center">No se encontraron miembros</p>
                  ) : (
                    filteredMembers.map((m) => {
                      const selected = selectedUserIds.includes(m.user_id);
                      return (
                        <label
                          key={m.user_id}
                          className={cn(
                            'flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors',
                            selected && 'bg-blue-50/50 dark:bg-blue-950/20',
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleUser(m.user_id)}
                            className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate">{m.name}</p>
                            <p className="text-[10px] text-gray-400 truncate">{m.email}</p>
                          </div>
                          <div className="flex gap-1 flex-shrink-0">
                            {m.role_name && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-50 dark:bg-purple-950/30 text-purple-600 dark:text-purple-400">
                                {m.role_name}
                              </span>
                            )}
                            {m.job_position_name && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                                {m.job_position_name}
                              </span>
                            )}
                          </div>
                        </label>
                      );
                    })
                  )}
                </div>

                {/* Chips de seleccionados */}
                {selectedMembers.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {selectedMembers.map((m) => (
                      <Badge
                        key={m.user_id}
                        variant="secondary"
                        className="text-[10px] py-0 pl-2 pr-1 gap-1 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300"
                      >
                        {m.name}
                        <button onClick={() => toggleUser(m.user_id)} className="hover:text-red-500 ml-0.5">
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                    <span className="text-[10px] text-gray-400 self-center ml-1">
                      {selectedMembers.length} seleccionado{selectedMembers.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSending}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!title.trim() || !message.trim() || (targetType === 'specific' && selectedUserIds.length === 0) || isSending}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {isSending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Crear Alerta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
