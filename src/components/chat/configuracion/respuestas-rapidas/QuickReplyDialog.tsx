'use client';

import { useState, useEffect } from 'react';
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

export default function QuickReplyDialog({
  open,
  onOpenChange,
  reply,
  onSave
}: QuickReplyDialogProps) {
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
    setTags(tags.filter(t => t !== tagToRemove));
  };

  const insertVariable = (variable: string) => {
    setContent(content + variable);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {reply ? 'Editar Respuesta Rápida' : 'Nueva Respuesta Rápida'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="title">Título *</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ej: Saludo inicial"
                className="bg-white dark:bg-gray-800"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="shortcut">Atajo (opcional)</Label>
              <Input
                id="shortcut"
                value={shortcut}
                onChange={(e) => setShortcut(e.target.value.replace(/\s/g, ''))}
                placeholder="Ej: saludo"
                className="bg-white dark:bg-gray-800 font-mono"
              />
              <p className="text-xs text-gray-500">Escribe /{shortcut || 'atajo'} para usar</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="content">Contenido *</Label>
            <Textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Escribe el mensaje de respuesta rápida..."
              rows={5}
              className="bg-white dark:bg-gray-800 resize-none"
            />
          </div>

          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <div className="flex items-center gap-2 mb-2">
              <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                Variables disponibles
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {QUICK_REPLY_VARIABLES.map((v) => (
                <button
                  key={v.value}
                  type="button"
                  onClick={() => insertVariable(v.value)}
                  className="text-xs px-2 py-1 rounded bg-white dark:bg-gray-800 border border-blue-200 dark:border-blue-700 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
                  title={v.description}
                >
                  {v.value}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Tags internos (opcional)</Label>
            <div className="flex gap-2">
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                placeholder="Agregar tag..."
                className="bg-white dark:bg-gray-800"
              />
              <Button type="button" variant="outline" onClick={addTag}>
                Agregar
              </Button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {tags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className="bg-gray-100 dark:bg-gray-800 gap-1"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => removeTag(tag)}
                      className="ml-1 hover:text-red-500"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <div>
              <Label htmlFor="is-active" className="text-sm font-medium">
                Respuesta activa
              </Label>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Las respuestas inactivas no aparecen en sugerencias
              </p>
            </div>
            <Switch
              id="is-active"
              checked={isActive}
              onCheckedChange={setIsActive}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={!title.trim() || !content.trim() || saving}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Guardando...
              </>
            ) : (
              reply ? 'Guardar Cambios' : 'Crear Respuesta'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
