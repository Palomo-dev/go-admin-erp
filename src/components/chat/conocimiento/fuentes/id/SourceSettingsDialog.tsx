'use client';

import { useState, useEffect } from 'react';
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
      <DialogContent className="max-w-md bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
        <DialogHeader>
          <DialogTitle className="text-gray-900 dark:text-white">
            Configuración de Fuente
          </DialogTitle>
          <DialogDescription className="text-gray-500 dark:text-gray-400">
            Modifica la configuración de esta fuente de conocimiento
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name" className="text-gray-700 dark:text-gray-300">
              Nombre *
            </Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Preguntas Frecuentes"
              className="bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description" className="text-gray-700 dark:text-gray-300">
              Descripción
            </Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe el propósito de esta fuente..."
              rows={3}
              className="bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 resize-none"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="icon" className="text-gray-700 dark:text-gray-300">
              Icono (emoji)
            </Label>
            <Input
              id="icon"
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              placeholder="📚"
              maxLength={2}
              className="bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 w-20"
            />
          </div>

          <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
            <div>
              <Label className="text-gray-700 dark:text-gray-300">
                Estado de la Fuente
              </Label>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {isActive 
                  ? 'Los fragmentos de esta fuente están disponibles para búsquedas'
                  : 'Los fragmentos de esta fuente no aparecerán en búsquedas'
                }
              </p>
            </div>
            <Switch
              checked={isActive}
              onCheckedChange={setIsActive}
            />
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
            disabled={saving || !name.trim()}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Guardando...
              </>
            ) : (
              'Guardar Cambios'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
