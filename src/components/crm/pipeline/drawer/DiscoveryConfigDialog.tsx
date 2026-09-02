'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/use-toast';
import {
  getActiveDiscoveryTemplate,
  saveDiscoveryTemplate,
  DEFAULT_DISCOVERY_FIELDS,
  type DiscoveryField,
} from '@/lib/services/crm/discoveryTemplateService';
import {
  Plus,
  Trash2,
  GripVertical,
  Loader2,
  Save,
  RotateCcw,
} from 'lucide-react';

interface DiscoveryConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

export function DiscoveryConfigDialog({ open, onOpenChange, onSaved }: DiscoveryConfigDialogProps) {
  const [fields, setFields] = useState<DiscoveryField[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { fields: templateFields } = await getActiveDiscoveryTemplate();
      setFields(templateFields);
    } catch {
      setFields(DEFAULT_DISCOVERY_FIELDS);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const addField = () => {
    const newId = `field_${Date.now()}`;
    setFields((prev) => [
      ...prev,
      { id: newId, label: 'Nuevo campo', placeholder: '', type: 'text' },
    ]);
  };

  const updateField = (index: number, updates: Partial<DiscoveryField>) => {
    setFields((prev) => prev.map((f, i) => (i === index ? { ...f, ...updates } : f)));
  };

  const removeField = (index: number) => {
    setFields((prev) => prev.filter((_, i) => i !== index));
  };

  const moveField = (index: number, direction: 'up' | 'down') => {
    setFields((prev) => {
      const next = [...prev];
      const target = direction === 'up' ? index - 1 : index + 1;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const handleSave = async () => {
    // Validar que todos los campos tengan label e id
    const invalid = fields.filter((f) => !f.label.trim() || !f.id.trim());
    if (invalid.length > 0) {
      toast({ title: 'Todos los campos deben tener etiqueta', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      await saveDiscoveryTemplate(fields);
      toast({ title: 'Configuración guardada', description: `${fields.length} campos de discovery` });
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      toast({ title: 'Error al guardar', description: msg, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setFields(DEFAULT_DISCOVERY_FIELDS);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configurar campos de Discovery</DialogTitle>
          <DialogDescription>
            Personaliza qué información quieres capturar durante la calificación de oportunidades.
            Cada organización puede tener sus propios campos según su tipo de negocio.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : (
          <div className="space-y-3">
            {/* Lista de campos */}
            {fields.map((field, index) => (
              <div
                key={field.id}
                className="p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 space-y-2"
              >
                <div className="flex items-center gap-2">
                  <GripVertical className="h-4 w-4 text-gray-400 shrink-0" />
                  <Input
                    value={field.label}
                    onChange={(e) => updateField(index, { label: e.target.value })}
                    placeholder="Etiqueta del campo"
                    className="h-8 text-sm flex-1"
                  />
                  <select
                    value={field.type}
                    onChange={(e) => updateField(index, { type: e.target.value as DiscoveryField['type'] })}
                    className="h-8 text-xs px-2 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
                  >
                    <option value="text">Texto</option>
                    <option value="textarea">Texto largo</option>
                    <option value="number">Número</option>
                    <option value="date">Fecha</option>
                    <option value="select">Selección</option>
                  </select>
                  <button
                    onClick={() => moveField(index, 'up')}
                    disabled={index === 0}
                    className="text-gray-400 hover:text-gray-600 disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => moveField(index, 'down')}
                    disabled={index === fields.length - 1}
                    className="text-gray-400 hover:text-gray-600 disabled:opacity-30"
                  >
                    ↓
                  </button>
                  <button
                    onClick={() => removeField(index)}
                    className="text-gray-400 hover:text-red-500"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex gap-2 pl-6">
                  <Input
                    value={field.placeholder || ''}
                    onChange={(e) => updateField(index, { placeholder: e.target.value })}
                    placeholder="Placeholder (ej: Ej: Gerente general)"
                    className="h-8 text-xs flex-1"
                  />
                  <Input
                    value={field.id}
                    onChange={(e) => updateField(index, { id: e.target.value })}
                    placeholder="id_campo"
                    className="h-8 text-xs w-32"
                  />
                  <label className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400 shrink-0">
                    <input
                      type="checkbox"
                      checked={field.required || false}
                      onChange={(e) => updateField(index, { required: e.target.checked })}
                    />
                    Oblig.
                  </label>
                </div>
                {field.type === 'select' && (
                  <div className="pl-6">
                    <Input
                      value={field.options?.join(', ') || ''}
                      onChange={(e) =>
                        updateField(index, {
                          options: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                        })
                      }
                      placeholder="Opciones separadas por coma: Opción 1, Opción 2, Opción 3"
                      className="h-8 text-xs"
                    />
                  </div>
                )}
              </div>
            ))}

            {fields.length === 0 && (
              <p className="text-sm text-gray-500 dark:text-gray-400 italic text-center py-4">
                No hay campos configurados. Agrega campos o restaura el template por defecto.
              </p>
            )}

            {/* Acciones */}
            <div className="flex gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={addField} className="text-xs">
                <Plus className="h-3.5 w-3.5 mr-1" />
                Agregar campo
              </Button>
              <Button variant="outline" size="sm" onClick={handleReset} className="text-xs">
                <RotateCcw className="h-3.5 w-3.5 mr-1" />
                Restaurar por defecto
              </Button>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            Guardar configuración
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
