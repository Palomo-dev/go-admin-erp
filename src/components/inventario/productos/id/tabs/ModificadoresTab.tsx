'use client';

import React, { useEffect, useState } from 'react';
import { Plus, Trash2, GripVertical, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/components/ui/use-toast';
import {
  ProductModifiersService,
  type ProductModifierGroup,
  type ModifierSelectionMode,
} from '@/lib/services/productModifiersService';

interface ModificadoresTabProps {
  producto: any;
}

/**
 * Pestaña para gestionar los modificadores del producto (ej. "Salsas", "Extras").
 * A diferencia de las variantes, un modificador NO genera un nuevo SKU: se guarda
 * como dato adicional de la venta (sale_items.notes.modifiers).
 */
const ModificadoresTab: React.FC<ModificadoresTabProps> = ({ producto }) => {
  const [groups, setGroups] = useState<ProductModifierGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingGroup, setIsSavingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupMode, setNewGroupMode] = useState<ModifierSelectionMode>('multiple');
  const [newOptionNameByGroup, setNewOptionNameByGroup] = useState<Record<number, string>>({});
  const [newOptionPriceByGroup, setNewOptionPriceByGroup] = useState<Record<number, string>>({});
  const [existingGroupNames, setExistingGroupNames] = useState<string[]>([]);
  const [variantValueSuggestions, setVariantValueSuggestions] = useState<string[]>([]);

  const loadGroups = async () => {
    if (!producto?.id) return;
    setIsLoading(true);
    try {
      const data = await ProductModifiersService.getGroupsByProduct(producto.id);
      setGroups(data);
    } catch (error) {
      console.error('Error cargando modificadores:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los modificadores',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadExistingGroupNames = async () => {
    try {
      const names = await ProductModifiersService.getExistingGroupNames();
      setExistingGroupNames(names);
    } catch (error) {
      console.error('Error cargando nombres de grupos existentes:', error);
    }
  };

  const loadVariantValueSuggestions = async () => {
    try {
      const values = await ProductModifiersService.getVariantValueSuggestions();
      setVariantValueSuggestions(values);
    } catch (error) {
      console.error('Error cargando valores de variantes existentes:', error);
    }
  };

  useEffect(() => {
    loadGroups();
    loadExistingGroupNames();
    loadVariantValueSuggestions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [producto?.id]);

  const handleCreateGroup = async () => {
    const name = newGroupName.trim();
    if (!name) return;
    setIsSavingGroup(true);
    try {
      await ProductModifiersService.createGroup({
        product_id: producto.id,
        name,
        selection_mode: newGroupMode,
        display_order: groups.length,
      });
      setNewGroupName('');
      setNewGroupMode('multiple');
      await loadGroups();
      loadExistingGroupNames();
      toast({ title: 'Grupo creado', description: `"${name}" se agregó correctamente` });
    } catch (error) {
      console.error('Error creando grupo de modificadores:', error);
      toast({ title: 'Error', description: 'No se pudo crear el grupo', variant: 'destructive' });
    } finally {
      setIsSavingGroup(false);
    }
  };

  const handleDeleteGroup = async (groupId: number) => {
    if (!confirm('¿Eliminar este grupo de modificadores y todas sus opciones?')) return;
    try {
      await ProductModifiersService.deleteGroup(groupId);
      await loadGroups();
    } catch (error) {
      console.error('Error eliminando grupo:', error);
      toast({ title: 'Error', description: 'No se pudo eliminar el grupo', variant: 'destructive' });
    }
  };

  const handleToggleRequired = async (group: ProductModifierGroup) => {
    try {
      await ProductModifiersService.updateGroup(group.id, { required: !group.required });
      await loadGroups();
    } catch (error) {
      console.error('Error actualizando grupo:', error);
    }
  };

  const handleChangeSelectionMode = async (group: ProductModifierGroup, mode: ModifierSelectionMode) => {
    try {
      await ProductModifiersService.updateGroup(group.id, {
        selection_mode: mode,
        max_selections: mode === 'single' ? 1 : group.max_selections,
      });
      await loadGroups();
    } catch (error) {
      console.error('Error actualizando modo de selección:', error);
    }
  };

  const handleAddOption = async (groupId: number) => {
    const name = (newOptionNameByGroup[groupId] || '').trim();
    if (!name) return;
    const priceRaw = newOptionPriceByGroup[groupId];
    const extraPrice = priceRaw ? parseFloat(priceRaw) : 0;
    try {
      await ProductModifiersService.createModifier({
        group_id: groupId,
        name,
        extra_price: isNaN(extraPrice) ? 0 : extraPrice,
      });
      setNewOptionNameByGroup((prev) => ({ ...prev, [groupId]: '' }));
      setNewOptionPriceByGroup((prev) => ({ ...prev, [groupId]: '' }));
      await loadGroups();
    } catch (error) {
      console.error('Error agregando opción:', error);
      toast({ title: 'Error', description: 'No se pudo agregar la opción', variant: 'destructive' });
    }
  };

  const handleDeleteOption = async (modifierId: number) => {
    try {
      await ProductModifiersService.deleteModifier(modifierId);
      await loadGroups();
    } catch (error) {
      console.error('Error eliminando opción:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Los modificadores son extras opcionales que no cambian el producto (ej. salsas, quitar
        ingredientes). Para variantes con precio/SKU propio (talla, color) usa la pestaña
        "Variantes".
      </p>

      {groups.map((group) => (
        <Card key={group.id} className="dark:bg-gray-900 dark:border-gray-800">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <GripVertical className="h-4 w-4 text-gray-400 shrink-0" />
              <CardTitle className="text-base truncate">{group.name}</CardTitle>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <Select
                value={group.selection_mode}
                onValueChange={(v) => handleChangeSelectionMode(group, v as ModifierSelectionMode)}
              >
                <SelectTrigger className="h-8 w-[140px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="single">Única (radio)</SelectItem>
                  <SelectItem value="multiple">Múltiple (checkbox)</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex items-center gap-1.5">
                <Switch checked={group.required} onCheckedChange={() => handleToggleRequired(group)} />
                <Label className="text-xs text-gray-500">Obligatorio</Label>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-red-500 hover:text-red-600"
                onClick={() => handleDeleteGroup(group.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {(group.product_modifiers || []).map((option) => (
              <div
                key={option.id}
                className="flex items-center justify-between rounded-md border border-gray-200 dark:border-gray-700 px-3 py-1.5"
              >
                <span className="text-sm text-gray-900 dark:text-gray-100">{option.name}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {option.extra_price > 0 ? `+$${option.extra_price.toLocaleString()}` : 'Gratis'}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-red-500 hover:text-red-600"
                    onClick={() => handleDeleteOption(option.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}

            {variantValueSuggestions.filter(
              (v) => !(group.product_modifiers || []).some((m) => m.name === v)
            ).length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {variantValueSuggestions
                  .filter((v) => !(group.product_modifiers || []).some((m) => m.name === v))
                  .map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() =>
                        setNewOptionNameByGroup((prev) => ({ ...prev, [group.id]: value }))
                      }
                      className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                        newOptionNameByGroup[group.id] === value
                          ? 'bg-indigo-600 border-indigo-600 text-white'
                          : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700'
                      }`}
                      title="Valor ya usado en variantes, haz clic para reutilizarlo"
                    >
                      {value}
                    </button>
                  ))}
              </div>
            )}

            <div className="flex items-center gap-2 pt-1">
              <Input
                placeholder="Nueva opción (ej. BBQ)"
                className="h-8 text-sm"
                value={newOptionNameByGroup[group.id] || ''}
                onChange={(e) =>
                  setNewOptionNameByGroup((prev) => ({ ...prev, [group.id]: e.target.value }))
                }
              />
              <Input
                placeholder="Precio extra"
                type="number"
                className="h-8 w-28 text-sm"
                value={newOptionPriceByGroup[group.id] || ''}
                onChange={(e) =>
                  setNewOptionPriceByGroup((prev) => ({ ...prev, [group.id]: e.target.value }))
                }
              />
              <Button size="sm" className="h-8" onClick={() => handleAddOption(group.id)}>
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}

      <Card className="dark:bg-gray-900 dark:border-gray-800 border-dashed">
        <CardContent className="pt-4 space-y-3">
          <Label className="text-sm mb-2 block">Nuevo grupo de modificadores</Label>

          {existingGroupNames.filter((n) => !groups.some((g) => g.name === n)).length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Grupos existentes en tu catálogo, haz clic para reutilizar:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {existingGroupNames
                  .filter((n) => !groups.some((g) => g.name === n))
                  .map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => setNewGroupName(name)}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                        newGroupName === name
                          ? 'bg-indigo-600 border-indigo-600 text-white'
                          : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700'
                      }`}
                    >
                      {name}
                    </button>
                  ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            <Input
              placeholder="Nombre (ej. Salsas)"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
            />
            <Select value={newGroupMode} onValueChange={(v) => setNewGroupMode(v as ModifierSelectionMode)}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="single">Única (radio)</SelectItem>
                <SelectItem value="multiple">Múltiple (checkbox)</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={handleCreateGroup} disabled={isSavingGroup || !newGroupName.trim()}>
              {isSavingGroup ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Agregar
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ModificadoresTab;
