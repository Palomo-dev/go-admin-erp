'use client';

import type { Dispatch, SetStateAction } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import type { OrgMember, SalesRole, Territory } from './types';
import type { MemberForm } from './useTeams';

interface TeamMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: MemberForm;
  setForm: Dispatch<SetStateAction<MemberForm>>;
  orgMembers: OrgMember[];
  roles: SalesRole[];
  territories: Territory[];
  saving: boolean;
  onSave: () => void;
}

/** Diálogo para añadir un miembro de la organización a un equipo. */
export function TeamMemberDialog({
  open,
  onOpenChange,
  form,
  setForm,
  orgMembers,
  roles,
  territories,
  saving,
  onSave,
}: TeamMemberDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Añadir miembro</DialogTitle>
          <DialogDescription>Añade un usuario al equipo con su rol y cuota</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="member-user">Miembro de la organización *</Label>
            <Select
              value={form.user_id}
              onValueChange={(v) => setForm((p) => ({ ...p, user_id: v }))}
            >
              <SelectTrigger id="member-user">
                <SelectValue placeholder="Selecciona un miembro..." />
              </SelectTrigger>
              <SelectContent>
                {orgMembers.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                    {m.email ? ` (${m.email})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {orgMembers.length === 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                No hay miembros activos en la organización.
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="member-role">Rol comercial</Label>
            <Select
              value={form.sales_role_id || 'none'}
              onValueChange={(v) =>
                setForm((p) => ({ ...p, sales_role_id: v === 'none' ? '' : v }))
              }
            >
              <SelectTrigger id="member-role">
                <SelectValue placeholder="Sin rol" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin rol</SelectItem>
                {roles.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name} ({r.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {territories.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="member-territory">Territorio (opcional)</Label>
              <Select
                value={form.territory_id || 'none'}
                onValueChange={(v) =>
                  setForm((p) => ({ ...p, territory_id: v === 'none' ? '' : v }))
                }
              >
                <SelectTrigger id="member-territory">
                  <SelectValue placeholder="Hereda del equipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Hereda del equipo</SelectItem>
                  {territories.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Si asignas un territorio específico, sobreescribe el del equipo.
              </p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="member-quota">Cuota</Label>
              <Input
                id="member-quota"
                type="number"
                value={form.quota_amount}
                onChange={(e) => setForm((p) => ({ ...p, quota_amount: e.target.value }))}
                placeholder="0"
                min={0}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="member-currency">Moneda</Label>
              <Select
                value={form.quota_currency}
                onValueChange={(v) => setForm((p) => ({ ...p, quota_currency: v }))}
              >
                <SelectTrigger id="member-currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="COP">COP</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={onSave} disabled={saving}>
            {saving ? 'Añadiendo...' : 'Añadir'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
