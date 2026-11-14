'use client';

/** Crear / editar una etiqueta de conversación. Textos en `chatConfig` (es/en/fr/pt), colores por tokens. */
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
import { RichTextEditor } from '@/components/shared/RichTextEditor';
import { Loader2 } from 'lucide-react';
import { TAG_COLORS, type ConversationTag } from '@/lib/services/inboxConfigService';

interface TagDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tag: ConversationTag | null;
  onSave: (data: { name: string; color: string; description?: string }) => Promise<void>;
}

const COLOR_INICIAL = TAG_COLORS[0]?.value ?? '#3b82f6';

export default function TagDialog({ open, onOpenChange, tag, onSave }: TagDialogProps) {
  const t = useTranslations('chatConfig.etiquetas');
  const tc = useTranslations('chatConfig.comun');
  const [name, setName] = useState('');
  const [color, setColor] = useState(COLOR_INICIAL);
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (tag) {
      setName(tag.name);
      setColor(tag.color);
      setDescription(tag.description || '');
    } else {
      setName('');
      setColor(COLOR_INICIAL);
      setDescription('');
    }
  }, [tag, open]);

  const handleSave = async () => {
    if (!name.trim()) return;

    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        color,
        description: description.trim() || undefined
      });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  /** Nombre del color en el idioma de quien edita; el hex es el dato. */
  const nombreColor = (valor: string, respaldo: string) => {
    const clave = `colores.${valor.replace('#', '')}`;
    return t.has(clave) ? t(clave) : respaldo;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{tag ? t('dialogo.tituloEditar') : t('dialogo.tituloNueva')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="etiqueta-nombre">{t('dialogo.nombre')}</Label>
            <Input
              id="etiqueta-nombre"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('dialogo.nombrePlaceholder')}
              className="bg-surface"
            />
          </div>

          <div className="space-y-2">
            <Label id="etiqueta-color">{t('dialogo.color')}</Label>
            <div role="radiogroup" aria-labelledby="etiqueta-color" className="flex flex-wrap gap-2">
              {TAG_COLORS.map((c) => {
                const nombre = nombreColor(c.value, c.label);
                return (
                  <button
                    key={c.value}
                    type="button"
                    role="radio"
                    aria-checked={color === c.value}
                    aria-label={nombre}
                    title={nombre}
                    onClick={() => setColor(c.value)}
                    className={`h-8 w-8 rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                      color === c.value ? 'ring-2 ring-brand ring-offset-2 ring-offset-surface' : 'hover:scale-110'
                    }`}
                    style={{ backgroundColor: c.value }}
                  />
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="etiqueta-descripcion">{t('dialogo.descripcion')}</Label>
            <RichTextEditor
              value={description}
              onChange={(html) => setDescription(html)}
              placeholder={t('dialogo.descripcionPlaceholder')}
              minHeight={60}
              className="bg-surface"
            />
          </div>

          <div className="rounded-lg bg-subtle p-3">
            <p className="mb-2 text-sm text-fg-secondary">{t('dialogo.vistaPrevia')}</p>
            <div className="flex items-center gap-2">
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-medium text-white"
                style={{ backgroundColor: color }}
              >
                {name || t('dialogo.nombrePorDefecto')}
              </span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {tc('cancelar')}
          </Button>
          <Button onClick={handleSave} disabled={!name.trim() || saving}>
            {saving ? (
              <>
                <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />
                {tc('guardando')}
              </>
            ) : tag ? (
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
