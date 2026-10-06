'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { useTranslations } from 'next-intl';

interface TerritoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: { id: string; name: string } | null;
  form: { name: string; criteria: string; is_active: boolean };
  onFormChange: (form: { name: string; criteria: string; is_active: boolean }) => void;
  onSave: () => void;
  saving: boolean;
  criteriaError: string | null;
}

export function TerritoryDialog({
  open, onOpenChange, editing, form, onFormChange, onSave, saving, criteriaError,
}: TerritoryDialogProps) {
  const t = useTranslations('crm.equipo');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? t('territoryDialog.editarTerritorio') : t('territoryDialog.nuevoTerritorio')}</DialogTitle>
          <DialogDescription>
            {editing ? t('territoryDialog.modificaDatosTerritorio') : t('territoryDialog.creaNuevoTerritorioComercial')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>{t('teamDialog.nombre')}</Label>
            <Input
              value={form.name}
              onChange={(e) => onFormChange({ ...form, name: e.target.value })}
              placeholder={t('territoryDialog.ejZonaNorte')}
            />
          </div>
          <div className="space-y-2">
            <Label>{t('territoryDialog.criteriosJson')}</Label>
            <Textarea
              value={form.criteria}
              onChange={(e) => onFormChange({ ...form, criteria: e.target.value })}
              rows={4}
              className="font-mono text-xs"
              placeholder='{"country": "CO"}'
            />
            {criteriaError && <p className="text-xs text-red-500">{criteriaError}</p>}
          </div>
          <div className="flex items-center justify-between">
            <Label>{t('teamDialog.activo')}</Label>
            <Switch
              checked={form.is_active}
              onCheckedChange={(c) => onFormChange({ ...form, is_active: c })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('memberDialog.cancelar')}</Button>
          <Button onClick={onSave} disabled={saving}>{saving ? t('teamDialog.guardando') : t('teamDialog.guardar')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
