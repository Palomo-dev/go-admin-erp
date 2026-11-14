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
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Loader2, X, Plus } from 'lucide-react';
import type { KnowledgeFragment, KnowledgeSource, CreateFragmentData } from '@/lib/services/knowledgeService';

interface FragmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fragment: KnowledgeFragment | null;
  sources: KnowledgeSource[];
  defaultSourceId?: string;
  /** Valores iniciales de un fragmento NUEVO (p. ej. «Convertir en fragmento» del Laboratorio). */
  prellenado?: Pick<CreateFragmentData, 'title' | 'content'>;
  onSubmit: (data: CreateFragmentData) => Promise<void>;
}

export default function FragmentDialog({
  open,
  onOpenChange,
  fragment,
  sources,
  defaultSourceId,
  prellenado,
  onSubmit
}: FragmentDialogProps) {
  const t = useTranslations('chatDialogos.fragmento');
  const tc = useTranslations('chatDialogos.comun');
  const [formData, setFormData] = useState<CreateFragmentData>({
    source_id: '',
    title: '',
    content: '',
    tags: [],
    priority: 5
  });
  const [tagInput, setTagInput] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (fragment) {
      setFormData({
        source_id: fragment.source_id || '',
        title: fragment.title,
        content: fragment.content,
        tags: fragment.tags || [],
        priority: fragment.priority
      });
    } else {
      setFormData({
        source_id: defaultSourceId || '',
        title: prellenado?.title ?? '',
        content: prellenado?.content ?? '',
        tags: [],
        priority: 5
      });
    }
    setTagInput('');
  }, [fragment, defaultSourceId, open, prellenado]);

  const handleAddTag = () => {
    const tag = tagInput.trim().toLowerCase();
    if (tag && !(formData.tags || []).includes(tag)) {
      setFormData({
        ...formData,
        tags: [...(formData.tags || []), tag]
      });
    }
    setTagInput('');
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setFormData({
      ...formData,
      tags: (formData.tags || []).filter(t => t !== tagToRemove)
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim() || !formData.content.trim()) return;

    setSaving(true);
    try {
      await onSubmit(formData);
      onOpenChange(false);
    } catch (error) {
      console.error('Error guardando fragmento:', error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{fragment ? t('tituloEditar') : t('tituloNuevo')}</DialogTitle>
          <DialogDescription>{fragment ? t('descripcionEditar') : t('descripcionNueva')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="source">{t('fuente')}</Label>
              <Select
                value={formData.source_id || 'none'}
                onValueChange={(value) => setFormData({ 
                  ...formData, 
                  source_id: value === 'none' ? '' : value 
                })}
              >
                <SelectTrigger id="source">
                  <SelectValue placeholder={t('sinFuente')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('sinFuente')}</SelectItem>
                  {sources.map((source) => (
                    <SelectItem key={source.id} value={source.id}>
                      {source.icon && <span className="mr-2">{source.icon}</span>}
                      {source.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="priority">{t('prioridad')}</Label>
              <Input
                id="priority"
                type="number"
                min={1}
                max={10}
                value={formData.priority}
                onChange={(e) => setFormData({ 
                  ...formData, 
                  priority: Math.max(1, Math.min(10, parseInt(e.target.value) || 5))
                })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="title">{t('titulo')} *</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder={t('tituloPlaceholder')}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="content">{t('contenido')} *</Label>
            <Textarea
              id="content"
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
              placeholder={t('contenidoPlaceholder')}
              rows={6}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="fragment-tag">{t('etiquetas')}</Label>
            <div className="flex gap-2">
              <Input
                id="fragment-tag"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t('etiquetaPlaceholder')}
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleAddTag}
                aria-label={t('agregarEtiqueta')}
              >
                <Plus aria-hidden="true" className="h-4 w-4" />
              </Button>
            </div>
            {(formData.tags || []).length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {formData.tags!.map((tag) => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className="gap-1 pr-1"
                  >
                    {tag}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-4 w-4 p-0 hover:bg-transparent"
                      onClick={() => handleRemoveTag(tag)}
                      aria-label={t('quitarEtiqueta', { etiqueta: tag })}
                    >
                      <X aria-hidden="true" className="h-3 w-3" />
                    </Button>
                  </Badge>
                ))}
              </div>
            )}
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
              disabled={saving || !formData.title.trim() || !formData.content.trim()}
            >
              {saving ? (
                <>
                  <Loader2 aria-hidden="true" className="h-4 w-4 mr-2 animate-spin" />
                  {tc('guardando')}
                </>
              ) : fragment ? tc('guardar') : t('crear')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
