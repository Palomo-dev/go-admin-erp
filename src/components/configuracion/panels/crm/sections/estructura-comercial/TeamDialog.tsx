'use client';

import type { Dispatch, SetStateAction } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Territory } from './types';
import type { TeamForm } from './useTeams';

interface TeamDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: boolean;
  form: TeamForm;
  setForm: Dispatch<SetStateAction<TeamForm>>;
  territories: Territory[];
  saving: boolean;
  onSave: () => void;
}

/** Diálogo de alta/edición de un equipo comercial. */
export function TeamDialog({
  open,
  onOpenChange,
  editing,
  form,
  setForm,
  territories,
  saving,
  onSave,
}: TeamDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? 'Editar Equipo' : 'Nuevo Equipo'}</DialogTitle>
          <DialogDescription>
            {editing ? 'Modifica los datos del equipo' : 'Crea un nuevo equipo comercial'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="team-name">Nombre *</Label>
            <Input
              id="team-name"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="Ej: Equipo Norte, Enterprise Sales"
              maxLength={100}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="team-desc">Descripción</Label>
            <Textarea
              id="team-desc"
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              placeholder="Descripción opcional"
              rows={3}
              maxLength={500}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="team-active">Activo</Label>
            <Switch
              id="team-active"
              checked={form.is_active}
              onCheckedChange={(c) => setForm((p) => ({ ...p, is_active: c }))}
            />
          </div>
          {territories.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="team-territory">Territorio (opcional)</Label>
              <Select
                value={form.territory_id || 'none'}
                onValueChange={(v) =>
                  setForm((p) => ({ ...p, territory_id: v === 'none' ? '' : v }))
                }
              >
                <SelectTrigger id="team-territory">
                  <SelectValue placeholder="Sin territorio" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin territorio</SelectItem>
                  {territories.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Asigna un territorio al equipo. Los miembros heredan este territorio a menos que
                tengan uno propio.
              </p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={onSave} disabled={saving}>
            {saving ? 'Guardando...' : 'Guardar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
