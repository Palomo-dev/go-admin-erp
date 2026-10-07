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
import { useTranslations } from 'next-intl';

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
  const tx = useTranslations('crm.equipo');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? tx('teamDialog.editarEquipo') : tx('teamDialog.nuevoEquipo')}</DialogTitle>
          <DialogDescription>
            {editing ? tx('teamDialog.modificaDatosEquipoComercial') : tx('teamDialog.creaNuevoEquipoComercial')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>{tx('teamDialog.nombre')}</Label>
            <Input
              value={form.name}
              onChange={(e) => onFormChange({ ...form, name: e.target.value })}
              placeholder={tx('teamDialog.ejEquipoNorte')}
            />
          </div>
          <div className="space-y-2">
            <Label>{tx('teamDialog.descripcion')}</Label>
            <Textarea
              value={form.description}
              onChange={(e) => onFormChange({ ...form, description: e.target.value })}
              rows={2}
            />
          </div>
          {territories.length > 0 && (
            <div className="space-y-2">
              <Label>{tx('memberDialog.territorioOpcional')}</Label>
              <Select
                value={form.territory_id || 'none'}
                onValueChange={(v) => onFormChange({ ...form, territory_id: v === 'none' ? '' : v })}
              >
                <SelectTrigger><SelectValue placeholder={tx('teamDialog.sinTerritorio')} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{tx('teamDialog.sinTerritorio')}</SelectItem>
                  {territories.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex items-center justify-between">
            <Label>{tx('teamDialog.activo')}</Label>
            <Switch
              checked={form.is_active}
              onCheckedChange={(c) => onFormChange({ ...form, is_active: c })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{tx('memberDialog.cancelar')}</Button>
          <Button onClick={onSave} disabled={saving}>{saving ? tx('teamDialog.guardando') : tx('teamDialog.guardar')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
