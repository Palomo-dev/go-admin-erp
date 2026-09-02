'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import type { SalesRole, Territory, OrgMember } from '../types';

interface MemberForm {
  user_id: string;
  sales_role_id: string;
  quota_amount: string;
  quota_currency: string;
  territory_id: string;
}

interface MemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roles: SalesRole[];
  territories: Territory[];
  orgMembers: OrgMember[];
  form: MemberForm;
  onFormChange: (form: MemberForm) => void;
  onAdd: () => void;
  saving: boolean;
}

export function MemberDialog({
  open, onOpenChange, roles, territories, orgMembers, form, onFormChange, onAdd, saving,
}: MemberDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Añadir miembro</DialogTitle>
          <DialogDescription>Selecciona un miembro de la organización</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Miembro *</Label>
            <Select
              value={form.user_id}
              onValueChange={(v) => onFormChange({ ...form, user_id: v })}
            >
              <SelectTrigger><SelectValue placeholder="Selecciona..." /></SelectTrigger>
              <SelectContent>
                {orgMembers.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}{m.email ? ` (${m.email})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Rol</Label>
            <Select
              value={form.sales_role_id || 'none'}
              onValueChange={(v) => onFormChange({ ...form, sales_role_id: v === 'none' ? '' : v })}
            >
              <SelectTrigger><SelectValue placeholder="Sin rol" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin rol</SelectItem>
                {roles.map((r) => (
                  <SelectItem key={r.id} value={r.id}>{r.name} ({r.code})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {territories.length > 0 && (
            <div className="space-y-2">
              <Label>Territorio (opcional)</Label>
              <Select
                value={form.territory_id || 'none'}
                onValueChange={(v) => onFormChange({ ...form, territory_id: v === 'none' ? '' : v })}
              >
                <SelectTrigger><SelectValue placeholder="Hereda del equipo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Hereda del equipo</SelectItem>
                  {territories.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Cuota</Label>
              <Input
                type="number"
                value={form.quota_amount}
                onChange={(e) => onFormChange({ ...form, quota_amount: e.target.value })}
                placeholder="0"
              />
            </div>
            <div className="space-y-2">
              <Label>Moneda</Label>
              <Select
                value={form.quota_currency}
                onValueChange={(v) => onFormChange({ ...form, quota_currency: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="COP">COP</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={onAdd} disabled={saving}>{saving ? 'Añadiendo...' : 'Añadir'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
