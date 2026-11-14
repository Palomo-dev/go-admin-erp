'use client';

import type { Dispatch, SetStateAction } from 'react';
import { useTranslations } from 'next-intl';
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
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';

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

/**
 * Monedas extra del selector. La base de la organización y la del formulario
 * se añaden siempre; no se cablea ninguna moneda local.
 */
const MONEDAS_CATALOGO = ['USD', 'EUR'];

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
  const tx = useTranslations('configuracionTextos.teamMemberDialog');
  const { code: monedaBase, resuelta: monedaResuelta } = useMonedaOrganizacion();
  const opcionesMoneda = Array.from(
    new Set([monedaResuelta ? monedaBase : '', form.quota_currency, ...MONEDAS_CATALOGO].filter(Boolean)),
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{tx('titulo')}</DialogTitle>
          <DialogDescription>{tx('descripcion')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="member-user">{tx('miembro')}</Label>
            <Select
              value={form.user_id}
              onValueChange={(v) => setForm((p) => ({ ...p, user_id: v }))}
            >
              <SelectTrigger id="member-user">
                <SelectValue placeholder={tx('miembroPlaceholder')} />
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
                {tx('sinMiembros')}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="member-role">{tx('rol')}</Label>
            <Select
              value={form.sales_role_id || 'none'}
              onValueChange={(v) =>
                setForm((p) => ({ ...p, sales_role_id: v === 'none' ? '' : v }))
              }
            >
              <SelectTrigger id="member-role">
                <SelectValue placeholder={tx('sinRol')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{tx('sinRol')}</SelectItem>
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
              <Label htmlFor="member-territory">{tx('territorio')}</Label>
              <Select
                value={form.territory_id || 'none'}
                onValueChange={(v) =>
                  setForm((p) => ({ ...p, territory_id: v === 'none' ? '' : v }))
                }
              >
                <SelectTrigger id="member-territory">
                  <SelectValue placeholder={tx('heredaEquipo')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{tx('heredaEquipo')}</SelectItem>
                  {territories.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {tx('territorioAyuda')}
              </p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="member-quota">{tx('cuota')}</Label>
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
              <Label htmlFor="member-currency">{tx('moneda')}</Label>
              <Select
                value={form.quota_currency}
                onValueChange={(v) => setForm((p) => ({ ...p, quota_currency: v }))}
              >
                <SelectTrigger id="member-currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {opcionesMoneda.map((code) => (
                    <SelectItem key={code} value={code}>
                      {code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tx('cancelar')}
          </Button>
          <Button onClick={onSave} disabled={saving}>
            {saving ? tx('anadiendo') : tx('anadir')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
