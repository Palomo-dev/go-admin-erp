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
import type { TerritoryForm } from './useTerritories';

interface TerritoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: boolean;
  form: TerritoryForm;
  setForm: Dispatch<SetStateAction<TerritoryForm>>;
  criteriaError: string | null;
  setCriteriaError: (error: string | null) => void;
  saving: boolean;
  onSave: () => void;
}

/** Diálogo de alta/edición de un territorio con criterios JSON. */
export function TerritoryDialog({
  open,
  onOpenChange,
  editing,
  form,
  setForm,
  criteriaError,
  setCriteriaError,
  saving,
  onSave,
}: TerritoryDialogProps) {
  const t = useTranslations('configuracionTextos.territoryDialog');
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
          <div className="space-y-2">
            <Label htmlFor="terr-name">{t('nombre')}</Label>
            <Input
              id="terr-name"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              placeholder={t('nombrePlaceholder')}
              maxLength={100}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="terr-criteria">{t('criterios')}</Label>
            <Textarea
              id="terr-criteria"
              value={form.criteria}
              onChange={(e) => {
                setForm((p) => ({ ...p, criteria: e.target.value }));
                setCriteriaError(null);
              }}
              placeholder='{"city": "Bogota", "company_size": "large"}'
              rows={6}
              className="font-mono text-xs"
            />
            {criteriaError && <p className="text-xs text-red-500">{criteriaError}</p>}
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {t('criteriosAyuda')}
            </p>
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="terr-active">{t('activo')}</Label>
            <Switch
              id="terr-active"
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
