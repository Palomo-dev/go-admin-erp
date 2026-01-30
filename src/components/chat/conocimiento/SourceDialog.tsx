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
      <DialogContent className="sm:max-w-md bg-white dark:bg-gray-900">
        <DialogHeader>
          <DialogTitle className="text-gray-900 dark:text-white">
            {source ? 'Editar Fuente' : 'Nueva Fuente de Conocimiento'}
          </DialogTitle>
          <DialogDescription className="text-gray-500 dark:text-gray-400">
            {source 
              ? 'Modifica los datos de la fuente de conocimiento'
              : 'Crea una nueva fuente para organizar tus fragmentos de conocimiento'
            }
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nombre *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Ej: Preguntas Frecuentes"
              className="bg-gray-50 dark:bg-gray-800"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Descripción</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Describe el tipo de información que contiene esta fuente..."
              rows={3}
              className="bg-gray-50 dark:bg-gray-800"
            />
          </div>

          <div className="space-y-2">
            <Label>Icono</Label>
            <div className="flex flex-wrap gap-2">
              {ICONS.map((icon) => (
                <Button
                  key={icon}
                  type="button"
                  variant="outline"
                  size="icon"
                  className={`w-10 h-10 text-lg ${
                    formData.icon === icon 
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30' 
                      : ''
                  }`}
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
                  className="w-10 h-10 text-lg border-blue-500 bg-blue-50 dark:bg-blue-900/30"
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
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={saving || !formData.name.trim()}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Guardando...
                </>
              ) : source ? 'Guardar Cambios' : 'Crear Fuente'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
