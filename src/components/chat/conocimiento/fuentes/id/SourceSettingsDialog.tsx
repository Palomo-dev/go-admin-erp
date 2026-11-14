'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { KnowledgeSource, CreateSourceData } from '@/lib/services/knowledgeService';

interface SourceSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: KnowledgeSource | null;
  onSubmit: (data: CreateSourceData & { is_active?: boolean }) => Promise<void>;
}

export default function SourceSettingsDialog({
  open,
  onOpenChange,
  source,
  onSubmit
}: SourceSettingsDialogProps) {
  const t = useTranslations('chatDialogos.fuente');
  const tc = useTranslations('chatDialogos.comun');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (source) {
      setName(source.name);
      setDescription(source.description || '');
      setIcon(source.icon || '');
      setIsActive(source.is_active);
    }
  }, [source, open]);

  const handleSubmit = async () => {
    if (!name.trim()) return;

    setSaving(true);
    try {
      await onSubmit({
        name: name.trim(),
        description: description.trim() || undefined,
        icon: icon.trim() || undefined,
        is_active: isActive,
      });
      onOpenChange(false);
    } catch (error) {
      console.error('Error guardando configuración:', error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('ajustesTitulo')}</DialogTitle>
          <DialogDescription>{t('ajustesDescripcion')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">{t('nombre')} *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('nombrePlaceholder')}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">{t('descripcion')}</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('descripcionPlaceholder')}
              rows={3}
              className="resize-none"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="icon">{t('iconoEmoji')}</Label>
            <Input
              id="icon"
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              placeholder="📚"
              maxLength={2}
              className="w-20"
            />
          </div>

          <div className="flex items-center justify-between gap-4 rounded-lg bg-subtle p-4">
            <div>
              <Label htmlFor="source-active">{t('estado')}</Label>
              <p id="source-active-ayuda" className="text-sm text-fg-secondary">
                {isActive ? t('estadoActiva') : t('estadoInactiva')}
              </p>
            </div>
            <Switch
              id="source-active"
              aria-describedby="source-active-ayuda"
              checked={isActive}
              onCheckedChange={setIsActive}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {tc('cancelar')}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={saving || !name.trim()}
          >
            {saving ? (
              <>
                <Loader2 aria-hidden="true" className="h-4 w-4 mr-2 animate-spin" />
                {tc('guardando')}
              </>
            ) : (
              tc('guardar')
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
