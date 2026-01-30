'use client';

import { useState, useEffect } from 'react';
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
      <DialogContent className="max-w-2xl bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
        <DialogHeader>
          <DialogTitle className="text-gray-900 dark:text-white">
            {fragment ? 'Editar Fragmento' : 'Nuevo Fragmento'}
          </DialogTitle>
          <DialogDescription className="text-gray-500 dark:text-gray-400">
            {fragment 
              ? 'Modifica la información del fragmento de conocimiento'
              : 'Agrega un nuevo fragmento de conocimiento a esta fuente'
            }
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="title" className="text-gray-700 dark:text-gray-300">
              Título *
            </Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ej: Cómo restablecer contraseña"
              className="bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="content" className="text-gray-700 dark:text-gray-300">
              Contenido *
            </Label>
            <Textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Escribe aquí el contenido del fragmento..."
              rows={8}
              className="bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 resize-none"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {content.length} caracteres
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-gray-700 dark:text-gray-300">
              Etiquetas
            </Label>
            <div className="flex gap-2">
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Agregar etiqueta..."
                className="bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700"
              />
              <Button 
                type="button" 
                variant="outline" 
                onClick={handleAddTag}
                className="border-gray-300 dark:border-gray-700"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {tags.map((tag, idx) => (
                  <Badge 
                    key={idx} 
                    variant="secondary"
                    className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 gap-1"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      className="ml-1 hover:text-blue-900 dark:hover:text-blue-200"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="priority" className="text-gray-700 dark:text-gray-300">
              Prioridad
            </Label>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger className="bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700">
                <SelectValue placeholder="Selecciona prioridad" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 - Más baja</SelectItem>
                <SelectItem value="2">2 - Baja</SelectItem>
                <SelectItem value="3">3 - Algo baja</SelectItem>
                <SelectItem value="4">4 - Media baja</SelectItem>
                <SelectItem value="5">5 - Normal</SelectItem>
                <SelectItem value="6">6 - Media alta</SelectItem>
                <SelectItem value="7">7 - Algo alta</SelectItem>
                <SelectItem value="8">8 - Alta</SelectItem>
                <SelectItem value="9">9 - Muy alta</SelectItem>
                <SelectItem value="10">10 - Máxima</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Los fragmentos con mayor prioridad aparecerán primero en las búsquedas
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-gray-300 dark:border-gray-700"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={saving || !title.trim() || !content.trim()}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Guardando...
              </>
            ) : (
              fragment ? 'Guardar Cambios' : 'Crear Fragmento'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
