'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import type { KnowledgeSource, CreateSourceData } from '@/lib/services/knowledgeService';

const ICONS = ['📚', '📖', '📝', '💡', '🎯', '🔧', '💬', '❓', '📋', '🏢', '💼', '🛒'];

interface SourceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: KnowledgeSource | null;
  onSubmit: (data: CreateSourceData) => Promise<void>;
}

export default function SourceDialog({
  open,
  onOpenChange,
  source,
  onSubmit
}: SourceDialogProps) {
  const t = useTranslations('chatDialogos.fuente');
  const tc = useTranslations('chatDialogos.comun');
  const [formData, setFormData] = useState<CreateSourceData>({
    name: '',
    description: '',
    icon: ''
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (source) {
      setFormData({
        name: source.name,
        description: source.description || '',
        icon: source.icon || ''
      });
    } else {
      setFormData({
        name: '',
        description: '',
        icon: ''
      });
    }
  }, [source, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    setSaving(true);
    try {
      await onSubmit(formData);
      onOpenChange(false);
    } catch (error) {
      console.error('Error guardando fuente:', error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{source ? t('tituloEditar') : t('tituloNueva')}</DialogTitle>
          <DialogDescription>{source ? t('descripcionEditar') : t('descripcionNueva')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">{t('nombre')} *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder={t('nombrePlaceholder')}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">{t('descripcion')}</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder={t('descripcionPlaceholder')}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <p id="source-icon" className="text-sm font-medium text-fg">{t('icono')}</p>
            <div role="group" aria-labelledby="source-icon" className="flex flex-wrap gap-2">
              {ICONS.map((icon) => (
                <Button
                  key={icon}
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-pressed={formData.icon === icon}
                  aria-label={t('elegirIcono', { icono: icon })}
                  className={`w-10 h-10 text-lg ${formData.icon === icon ? 'border-brand bg-brand-tint' : ''}`}
                  onClick={() => setFormData({ ...formData, icon })}
                >
                  {icon}
                </Button>
              ))}
              {formData.icon && !ICONS.includes(formData.icon) && (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-pressed
                  aria-label={t('elegirIcono', { icono: formData.icon })}
                  className="w-10 h-10 text-lg border-brand bg-brand-tint"
                >
                  {formData.icon}
                </Button>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              {tc('cancelar')}
            </Button>
            <Button
              type="submit"
              disabled={saving || !formData.name.trim()}
            >
              {saving ? (
                <>
                  <Loader2 aria-hidden="true" className="h-4 w-4 mr-2 animate-spin" />
                  {tc('guardando')}
                </>
              ) : source ? tc('guardar') : t('crear')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
