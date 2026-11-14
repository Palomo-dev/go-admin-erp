'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { X, Plus, Loader2 } from 'lucide-react';
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
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { KnowledgeFragment, CreateFragmentData } from '@/lib/services/knowledgeService';

const PRIORIDADES = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'] as const;

interface FragmentDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fragment: KnowledgeFragment | null;
  sourceId: string;
  onSubmit: (data: CreateFragmentData) => Promise<void>;
}

export default function FragmentDetailDialog({
  open,
  onOpenChange,
  fragment,
  sourceId,
  onSubmit
}: FragmentDetailDialogProps) {
  const t = useTranslations('chatDialogos.fragmento');
  const tc = useTranslations('chatDialogos.comun');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [priority, setPriority] = useState('5');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (fragment) {
      setTitle(fragment.title);
      setContent(fragment.content);
      setTags(fragment.tags || []);
      setPriority(String(fragment.priority || 5));
    } else {
      setTitle('');
      setContent('');
      setTags([]);
      setTagInput('');
      setPriority('5');
    }
  }, [fragment, open]);

  const handleAddTag = () => {
    const trimmedTag = tagInput.trim().toLowerCase();
    if (trimmedTag && !tags.includes(trimmedTag)) {
      setTags([...tags, trimmedTag]);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
    }
  };

  const handleSubmit = async () => {
    if (!title.trim() || !content.trim()) return;

    setSaving(true);
    try {
      await onSubmit({
        source_id: sourceId,
        title: title.trim(),
        content: content.trim(),
        tags,
        priority: parseInt(priority)
      });
      onOpenChange(false);
    } catch (error) {
      console.error('Error guardando fragmento:', error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{fragment ? t('tituloEditar') : t('tituloNuevo')}</DialogTitle>
          <DialogDescription>{fragment ? t('descripcionEditar') : t('descripcionNuevaFuente')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="title">{t('titulo')} *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('tituloPlaceholder')}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="content">{t('contenido')} *</Label>
            <Textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={t('contenidoPlaceholder')}
              rows={8}
              className="resize-none"
              aria-describedby="fragment-content-count"
            />
            <p id="fragment-content-count" className="text-xs text-fg-muted">
              {t('caracteres', { n: content.length })}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="fragment-detail-tag">{t('etiquetas')}</Label>
            <div className="flex gap-2">
              <Input
                id="fragment-detail-tag"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t('etiquetaPlaceholder')}
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleAddTag}
                aria-label={t('agregarEtiqueta')}
              >
                <Plus aria-hidden="true" className="h-4 w-4" />
              </Button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {tags.map((tag, idx) => (
                  <Badge 
                    key={idx} 
                    variant="secondary"
                    className="gap-1 bg-brand-tint text-brand-deep"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      aria-label={t('quitarEtiqueta', { etiqueta: tag })}
                      className="ml-1 hover:text-fg"
                    >
                      <X aria-hidden="true" className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="priority">{t('prioridad')}</Label>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger id="priority" aria-describedby="priority-ayuda">
                <SelectValue placeholder={t('prioridadPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {PRIORIDADES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {t('prioridadOpcion', { n: p, nombre: t(`prioridades.p${p}`) })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p id="priority-ayuda" className="text-xs text-fg-muted">
              {t('prioridadAyuda')}
            </p>
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
            disabled={saving || !title.trim() || !content.trim()}
          >
            {saving ? (
              <>
                <Loader2 aria-hidden="true" className="h-4 w-4 mr-2 animate-spin" />
                {tc('guardando')}
              </>
            ) : (
              fragment ? tc('guardar') : t('crear')
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
