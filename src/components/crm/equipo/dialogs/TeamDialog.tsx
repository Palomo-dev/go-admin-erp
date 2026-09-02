'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import type { SalesTeam, Territory } from '../types';

interface TeamDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: SalesTeam | null;
  territories: Territory[];
  form: { name: string; description: string; is_active: boolean; territory_id: string };
  onFormChange: (form: { name: string; description: string; is_active: boolean; territory_id: string }) => void;
  onSave: () => void;
  saving: boolean;
}

export function TeamDialog({
  open, onOpenChange, editing, territories, form, onFormChange, onSave, saving,
}: TeamDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? 'Editar equipo' : 'Nuevo equipo'}</DialogTitle>
          <DialogDescription>
            {editing ? 'Modifica los datos del equipo comercial' : 'Crea un nuevo equipo comercial'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Nombre *</Label>
            <Input
              value={form.name}
              onChange={(e) => onFormChange({ ...form, name: e.target.value })}
              placeholder="Ej: Equipo Norte"
            />
          </div>
          <div className="space-y-2">
            <Label>Descripción</Label>
            <Textarea
              value={form.description}
              onChange={(e) => onFormChange({ ...form, description: e.target.value })}
              rows={2}
            />
          </div>
          {territories.length > 0 && (
            <div className="space-y-2">
              <Label>Territorio (opcional)</Label>
              <Select
                value={form.territory_id || 'none'}
                onValueChange={(v) => onFormChange({ ...form, territory_id: v === 'none' ? '' : v })}
              >
                <SelectTrigger><SelectValue placeholder="Sin territorio" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin territorio</SelectItem>
                  {territories.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex items-center justify-between">
            <Label>Activo</Label>
            <Switch
              checked={form.is_active}
              onCheckedChange={(c) => onFormChange({ ...form, is_active: c })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={onSave} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
