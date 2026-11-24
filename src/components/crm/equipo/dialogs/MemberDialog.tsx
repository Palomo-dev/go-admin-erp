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
import type { OpcionCatalogo, OrgMember } from '../types';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { useTranslations } from 'next-intl';

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
  roles: OpcionCatalogo[];
  territories: OpcionCatalogo[];
  orgMembers: OrgMember[];
  form: MemberForm;
  onFormChange: (form: MemberForm) => void;
  onAdd: () => void;
  saving: boolean;
  /**
   * Editar un miembro existente («Editar cuota», Figma 1411:837770): el
   * miembro no se cambia, solo rol, territorio y cuota.
   */
  editando?: { nombre: string } | null;
}

/**
 * Monedas extra del selector. La base de la organización y la del formulario
 * se añaden siempre; no se cablea ninguna moneda local.
 */
const MONEDAS_CATALOGO = ['USD'];

export function MemberDialog({
  open, onOpenChange, roles, territories, orgMembers, form, onFormChange, onAdd, saving, editando,
}: MemberDialogProps) {
  const tx = useTranslations('crm.equipo');
  const { code: monedaBase, resuelta: monedaResuelta } = useMonedaOrganizacion();
  const opcionesMoneda = Array.from(
    new Set([monedaResuelta ? monedaBase : '', form.quota_currency, ...MONEDAS_CATALOGO].filter(Boolean)),
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editando ? tx('pantalla.miembro.editarTitulo') : tx('equiposTab.anadirMiembro')}</DialogTitle>
          <DialogDescription>{editando ? editando.nombre : tx('memberDialog.seleccionaMiembroOrganizacion')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {!editando && (
          <div className="space-y-2">
            <Label>{tx('memberDialog.miembro')}</Label>
            <Select
              value={form.user_id}
              onValueChange={(v) => onFormChange({ ...form, user_id: v })}
            >
              <SelectTrigger><SelectValue placeholder={tx('memberDialog.selecciona')} /></SelectTrigger>
              <SelectContent>
                {orgMembers.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}{m.email ? ` (${m.email})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          )}
          <div className="space-y-2">
            <Label>{tx('performanceTab.rol')}</Label>
            <Select
              value={form.sales_role_id || 'none'}
              onValueChange={(v) => onFormChange({ ...form, sales_role_id: v === 'none' ? '' : v })}
            >
              <SelectTrigger><SelectValue placeholder={tx('memberDialog.sinRol')} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{tx('memberDialog.sinRol')}</SelectItem>
                {roles.map((r) => (
                  <SelectItem key={r.id} value={r.id}>{r.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {territories.length > 0 && (
            <div className="space-y-2">
              <Label>{tx('memberDialog.territorioOpcional')}</Label>
              <Select
                value={form.territory_id || 'none'}
                onValueChange={(v) => onFormChange({ ...form, territory_id: v === 'none' ? '' : v })}
              >
                <SelectTrigger><SelectValue placeholder={tx('memberDialog.heredaEquipo')} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{tx('memberDialog.heredaEquipo')}</SelectItem>
                  {territories.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>{tx('performanceTab.cuota')}</Label>
              <Input
                type="number"
                min={0}
                value={form.quota_amount}
                onChange={(e) => onFormChange({ ...form, quota_amount: e.target.value })}
                placeholder="0"
              />
            </div>
            <div className="space-y-2">
              <Label>{tx('memberDialog.moneda')}</Label>
              <Select
                value={form.quota_currency}
                onValueChange={(v) => onFormChange({ ...form, quota_currency: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {opcionesMoneda.map((code) => (
                    <SelectItem key={code} value={code}>{code}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{tx('memberDialog.cancelar')}</Button>
          <Button onClick={onAdd} disabled={saving}>{editando ? (saving ? tx('teamDialog.guardando') : tx('teamDialog.guardar')) : saving ? tx('memberDialog.anadiendo') : tx('memberDialog.anadir')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
