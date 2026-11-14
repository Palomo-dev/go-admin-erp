'use client';

/** Crear / editar una respuesta rápida. Textos en `chatConfig` (es/en/fr/pt), colores por tokens. */
import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Loader2, X, Info } from 'lucide-react';
import { QUICK_REPLY_VARIABLES, type QuickReply } from '@/lib/services/inboxConfigService';

interface QuickReplyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reply: QuickReply | null;
  onSave: (data: { title: string; content: string; shortcut?: string; tags?: string[]; is_active?: boolean }) => Promise<void>;
}

export default function QuickReplyDialog({ open, onOpenChange, reply, onSave }: QuickReplyDialogProps) {
  const t = useTranslations('chatConfig.respuestas');
  const tc = useTranslations('chatConfig.comun');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [shortcut, setShortcut] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (reply) {
      setTitle(reply.title);
      setContent(reply.content);
      setShortcut(reply.shortcut || '');
      setTags(reply.tags || []);
      setIsActive(reply.is_active);
    } else {
      setTitle('');
      setContent('');
      setShortcut('');
      setTags([]);
      setIsActive(true);
    }
    setTagInput('');
  }, [reply, open]);

  const handleSave = async () => {
    if (!title.trim() || !content.trim()) return;

    setSaving(true);
    try {
      await onSave({
        title: title.trim(),
        content: content.trim(),
        shortcut: shortcut.trim() || undefined,
        tags,
        is_active: isActive
      });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const addTag = () => {
    const tag = tagInput.trim().toLowerCase();
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag]);
      setTagInput('');
    }
  };

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter((x) => x !== tagToRemove));
  };

  const insertVariable = (variable: string) => {
    setContent(content + variable);
  };

  /** Descripción de la variable en el idioma de quien edita (`{{customer_name}}` → `customer_name`). */
  const describirVariable = (valor: string, respaldo: string) => {
    const clave = `variables.${valor.replace(/[{}]/g, '')}`;
    return t.has(clave) ? t(clave) : respaldo;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-[600px] md:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{reply ? t('dialogo.tituloEditar') : t('dialogo.tituloNueva')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="respuesta-titulo">{t('dialogo.titulo')}</Label>
              <Input
                id="respuesta-titulo"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('dialogo.tituloPlaceholder')}
                className="bg-surface"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="respuesta-atajo">{t('dialogo.atajo')}</Label>
              <Input
                id="respuesta-atajo"
                value={shortcut}
                onChange={(e) => setShortcut(e.target.value.replace(/\s/g, ''))}
                placeholder={t('dialogo.atajoPlaceholder')}
                aria-describedby="respuesta-atajo-ayuda"
                className="bg-surface font-mono"
              />
              <p id="respuesta-atajo-ayuda" className="text-xs text-fg-muted">
                {t('dialogo.atajoAyuda', { atajo: shortcut || t('dialogo.atajoPorDefecto') })}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="respuesta-contenido">{t('dialogo.contenido')}</Label>
            <Textarea
              id="respuesta-contenido"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={t('dialogo.contenidoPlaceholder')}
              rows={5}
              className="resize-none bg-surface"
            />
          </div>

          <div className="rounded-lg border border-line-brand bg-brand-tint p-3">
            <div className="mb-2 flex items-center gap-2">
              <Info aria-hidden="true" className="h-4 w-4 text-brand" />
              <span className="text-sm font-medium text-brand">{t('dialogo.variables')}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {QUICK_REPLY_VARIABLES.map((v) => (
                <button
                  key={v.value}
                  type="button"
                  onClick={() => insertVariable(v.value)}
                  className="rounded border border-line-brand bg-surface px-2 py-1 text-xs text-brand transition-colors hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  title={describirVariable(v.value, v.description)}
                >
                  {v.value}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="respuesta-etiqueta">{t('dialogo.etiquetas')}</Label>
            <div className="flex flex-wrap gap-2 sm:flex-nowrap">
              <Input
                id="respuesta-etiqueta"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                placeholder={t('dialogo.etiquetaPlaceholder')}
                className="bg-surface"
              />
              <Button type="button" variant="outline" onClick={addTag}>
                {t('dialogo.agregar')}
              </Button>
            </div>
            {tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <Badge key={tag} tono="neutro" tamano="sm" className="gap-1">
                    {tag}
                    <button
                      type="button"
                      onClick={() => removeTag(tag)}
                      aria-label={t('dialogo.quitarEtiqueta', { etiqueta: tag })}
                      className="ml-1 hover:text-danger-text"
                    >
                      <X aria-hidden="true" className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-subtle p-3 sm:flex-nowrap">
            <div className="min-w-0">
              <Label htmlFor="respuesta-activa" className="text-sm font-medium">
                {t('dialogo.activa')}
              </Label>
              <p className="break-words text-xs text-fg-muted">{t('dialogo.activaAyuda')}</p>
            </div>
            <Switch id="respuesta-activa" checked={isActive} onCheckedChange={setIsActive} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {tc('cancelar')}
          </Button>
          <Button onClick={handleSave} disabled={!title.trim() || !content.trim() || saving}>
            {saving ? (
              <>
                <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />
                {tc('guardando')}
              </>
            ) : reply ? (
              tc('guardarCambios')
            ) : (
              t('dialogo.crear')
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
