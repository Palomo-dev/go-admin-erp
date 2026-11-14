'use client';

import type { Dispatch, SetStateAction } from 'react';
import { useTranslations } from 'next-intl';
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
import type { JobPosition } from './types';
import type { RoleForm } from './useRoles';

interface RoleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: boolean;
  form: RoleForm;
  setForm: Dispatch<SetStateAction<RoleForm>>;
  jobPositions: JobPosition[];
  saving: boolean;
  onSave: () => void;
}

/** Diálogo de alta/edición de un rol comercial. */
export function RoleDialog({
  open,
  onOpenChange,
  editing,
  form,
  setForm,
  jobPositions,
  saving,
  onSave,
}: RoleDialogProps) {
  const t = useTranslations('configuracionTextos.roleDialog');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? t('tituloEditar') : t('tituloNuevo')}</DialogTitle>
          <DialogDescription>
            {editing ? t('descripcionEditar') : t('descripcionNueva')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="role-code">{t('codigo')}</Label>
              <Input
                id="role-code"
                value={form.code}
                onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))}
                placeholder={t('codigoPlaceholder')}
                maxLength={50}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role-name">{t('nombre')}</Label>
              <Input
                id="role-name"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder={t('nombrePlaceholder')}
                maxLength={100}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="role-area">{t('area')}</Label>
            <Input
              id="role-area"
              value={form.area}
              onChange={(e) => setForm((p) => ({ ...p, area: e.target.value }))}
              placeholder={t('areaPlaceholder')}
              maxLength={100}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="role-job-position">{t('cargoHrm')}</Label>
            <Select
              value={form.job_position_id || 'none'}
              onValueChange={(v) =>
                setForm((p) => ({ ...p, job_position_id: v === 'none' ? '' : v }))
              }
            >
              <SelectTrigger id="role-job-position">
                <SelectValue placeholder={t('sinCargo')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t('sinCargo')}</SelectItem>
                {jobPositions.map((jp) => (
                  <SelectItem key={jp.id} value={jp.id}>
                    {jp.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {t('cargoHrmAyuda')}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="role-resp">{t('responsabilidades')}</Label>
            <Textarea
              id="role-resp"
              value={form.responsibilities}
              onChange={(e) => setForm((p) => ({ ...p, responsibilities: e.target.value }))}
              placeholder={t('responsabilidadesPlaceholder')}
              rows={4}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="role-active">{t('activo')}</Label>
            <Switch
              id="role-active"
              checked={form.is_active}
              onCheckedChange={(c) => setForm((p) => ({ ...p, is_active: c }))}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('cancelar')}
          </Button>
          <Button onClick={onSave} disabled={saving}>
            {saving ? t('guardando') : t('guardar')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
