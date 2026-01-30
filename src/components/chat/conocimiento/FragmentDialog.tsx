'use client';

import { useState, useEffect } from 'react';
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
  onSubmit: (data: CreateFragmentData) => Promise<void>;
}

export default function FragmentDialog({
  open,
  onOpenChange,
  fragment,
  sources,
  defaultSourceId,
  onSubmit
}: FragmentDialogProps) {
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
        title: '',
        content: '',
        tags: [],
        priority: 5
      });
    }
    setTagInput('');
  }, [fragment, defaultSourceId, open]);

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
      <DialogContent className="sm:max-w-2xl bg-white dark:bg-gray-900 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-gray-900 dark:text-white">
            {fragment ? 'Editar Fragmento' : 'Nuevo Fragmento de Conocimiento'}
          </DialogTitle>
          <DialogDescription className="text-gray-500 dark:text-gray-400">
            {fragment 
              ? 'Modifica el contenido del fragmento'
              : 'Agrega un nuevo fragmento de información a la base de conocimiento'
            }
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="source">Fuente</Label>
              <Select
                value={formData.source_id || 'none'}
                onValueChange={(value) => setFormData({ 
                  ...formData, 
                  source_id: value === 'none' ? '' : value 
                })}
              >
                <SelectTrigger className="bg-gray-50 dark:bg-gray-800">
                  <SelectValue placeholder="Sin fuente" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin fuente</SelectItem>
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
              <Label htmlFor="priority">Prioridad (1-10)</Label>
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
                className="bg-gray-50 dark:bg-gray-800"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="title">Título *</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="Ej: ¿Cuáles son los horarios de atención?"
              className="bg-gray-50 dark:bg-gray-800"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="content">Contenido *</Label>
            <Textarea
              id="content"
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
              placeholder="Escribe aquí el contenido del fragmento..."
              rows={6}
              className="bg-gray-50 dark:bg-gray-800"
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Etiquetas</Label>
            <div className="flex gap-2">
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Escribe una etiqueta y presiona Enter"
                className="bg-gray-50 dark:bg-gray-800 flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleAddTag}
              >
                <Plus className="h-4 w-4" />
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
                    >
                      <X className="h-3 w-3" />
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
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={saving || !formData.title.trim() || !formData.content.trim()}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Guardando...
                </>
              ) : fragment ? 'Guardar Cambios' : 'Crear Fragmento'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
