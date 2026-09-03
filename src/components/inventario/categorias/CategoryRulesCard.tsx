'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Plus,
  Trash2,
  Wand2,
  Loader2,
  Package,
  CheckCircle2,
  Save,
  Eye,
  AlertCircle,
} from 'lucide-react';
import {
  type CategoryRule,
  type CategoryRuleInput,
  type RuleField,
  type RuleOperator,
  type LogicCombiner,
  FIELD_LABELS,
  FIELD_TYPES,
  FIELD_OPTIONS,
  OPERATOR_LABELS,
  OPERATORS_BY_TYPE,
} from '@/lib/services/categoryRulesService';

interface CategoryRulesCardProps {
  categoryId: number;
  organizationId: number;
  onProductsAssigned?: (count: number) => void;
}

interface SelectOption {
  id: number;
  name: string;
}

export default function CategoryRulesCard({
  categoryId,
  organizationId,
  onProductsAssigned,
}: CategoryRulesCardProps) {
  const [rules, setRules] = useState<CategoryRuleInput[]>([]);
  const [existingRules, setExistingRules] = useState<CategoryRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [applying, setApplying] = useState(false);
  const [previewProducts, setPreviewProducts] = useState<{ id: number; uuid: string; name: string; sku: string }[]>([]);
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [suppliers, setSuppliers] = useState<SelectOption[]>([]);
  const [tags, setTags] = useState<SelectOption[]>([]);
  const [dirty, setDirty] = useState(false);

  // Cargar reglas existentes y opciones
  useEffect(() => {
    loadRules();
  }, [categoryId, organizationId]);

  const loadRules = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/categorias/reglas?categoryId=${categoryId}&organizationId=${organizationId}`);
      if (res.ok) {
        const data = await res.json();
        setExistingRules(data.rules || []);
        setRules((data.rules || []).map((r: CategoryRule) => ({
          field: r.field,
          operator: r.operator,
          value: r.value,
          value_array: r.value_array || [],
          logic_combiner: r.logic_combiner,
          display_order: r.display_order,
          is_active: r.is_active,
        })));
        setSuppliers(data.suppliers || []);
        setTags(data.tags || []);
      }
    } catch (err) {
      console.error('Error cargando reglas:', err);
    } finally {
      setLoading(false);
    }
  };

  const addRule = () => {
    setRules(prev => [...prev, {
      field: 'name',
      operator: 'contains',
      value: '',
      value_array: [],
      logic_combiner: prev.length === 0 ? 'AND' : 'AND',
      display_order: prev.length,
      is_active: true,
    }]);
    setDirty(true);
  };

  const updateRule = (index: number, updates: Partial<CategoryRuleInput>) => {
    setRules(prev => prev.map((r, i) => {
      if (i !== index) return r;
      const updated = { ...r, ...updates };
      // Si cambió el campo, resetear el operador a uno válido para el tipo
      if (updates.field && updates.field !== r.field) {
        const newType = FIELD_TYPES[updated.field];
        const validOps = OPERATORS_BY_TYPE[newType] || [];
        if (!validOps.includes(updated.operator)) {
          updated.operator = validOps[0] as RuleOperator;
        }
        updated.value = '';
        updated.value_array = [];
      }
      return updated;
    }));
    setDirty(true);
    setPreviewCount(null);
  };

  const removeRule = (index: number) => {
    setRules(prev => prev.filter((_, i) => i !== index));
    setDirty(true);
    setPreviewCount(null);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/categorias/reglas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save',
          categoryId,
          organizationId,
          rules,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setExistingRules(data.rules || []);
        setDirty(false);
      }
    } catch (err) {
      console.error('Error guardando reglas:', err);
    } finally {
      setSaving(false);
    }
  };

  const handlePreview = async () => {
    setEvaluating(true);
    setShowPreview(true);
    try {
      const res = await fetch('/api/categorias/reglas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'evaluate',
          categoryId,
          organizationId,
          rules,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setPreviewProducts(data.products || []);
        setPreviewCount(data.count || 0);
      }
    } catch (err) {
      console.error('Error evaluando reglas:', err);
    } finally {
      setEvaluating(false);
    }
  };

  const handleApply = async () => {
    setApplying(true);
    try {
      // Primero guardar las reglas
      await handleSave();
      // Luego aplicar
      const res = await fetch('/api/categorias/reglas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'apply',
          categoryId,
          organizationId,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        onProductsAssigned?.(data.assigned);
      }
    } catch (err) {
      console.error('Error aplicando reglas:', err);
    } finally {
      setApplying(false);
    }
  };

  const getFieldOptions = (field: RuleField): { value: string; label: string }[] => {
    if (field === 'supplier') return suppliers.map(s => ({ value: s.id.toString(), label: s.name }));
    if (field === 'tag') return tags.map(t => ({ value: t.id.toString(), label: t.name }));
    return FIELD_OPTIONS[field] || [];
  };

  const getOperatorsForField = (field: RuleField): RuleOperator[] => {
    const type = FIELD_TYPES[field];
    return OPERATORS_BY_TYPE[type] || [];
  };

  if (loading) {
    return (
      <Card className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-gray-900 dark:text-white flex items-center gap-2">
            <Wand2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            Reglas de Auto-asignación
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
      <CardHeader className="pb-3">
        <CardTitle className="text-base text-gray-900 dark:text-white flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Wand2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            Reglas de Auto-asignación
          </span>
          {existingRules.length > 0 && !dirty && (
            <Badge variant="secondary" className="text-xs">
              {existingRules.length} regla{existingRules.length !== 1 ? 's' : ''}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Define reglas para asignar productos automáticamente a esta categoría. Los productos que cumplan las condiciones serán asignados. Puedes re-asignar manualmente después.
        </p>

        {/* Lista de reglas */}
        {rules.length === 0 ? (
          <div className="text-center py-6 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg">
            <Wand2 className="h-8 w-8 mx-auto mb-2 text-gray-300 dark:text-gray-600" />
            <p className="text-sm text-gray-500 dark:text-gray-400">No hay reglas definidas</p>
            <Button onClick={addRule} size="sm" variant="outline" className="mt-3 gap-1">
              <Plus className="h-3.5 w-3.5" /> Agregar primera regla
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {rules.map((rule, index) => {
              const fieldType = FIELD_TYPES[rule.field];
              const operators = getOperatorsForField(rule.field);
              const options = getFieldOptions(rule.field);

              return (
                <div key={index} className="space-y-2">
                  {/* Combinador AND/OR (excepto primera regla) */}
                  {index > 0 && (
                    <div className="flex items-center gap-2 pl-2">
                      <Select
                        value={rule.logic_combiner}
                        onValueChange={(v) => updateRule(index, { logic_combiner: v as LogicCombiner })}
                      >
                        <SelectTrigger className="w-20 h-7 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="AND">AND</SelectItem>
                          <SelectItem value="OR">OR</SelectItem>
                        </SelectContent>
                      </Select>
                      <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
                    </div>
                  )}

                  {/* Fila de regla */}
                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_1fr_auto] gap-2 items-end p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700/50">
                    {/* Campo */}
                    <div className="space-y-1">
                      <Label className="text-[11px] text-gray-500">Campo</Label>
                      <Select
                        value={rule.field}
                        onValueChange={(v) => updateRule(index, { field: v as RuleField })}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(FIELD_LABELS).map(([k, v]) => (
                            <SelectItem key={k} value={k}>{v}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Operador */}
                    <div className="space-y-1">
                      <Label className="text-[11px] text-gray-500">Operador</Label>
                      <Select
                        value={rule.operator}
                        onValueChange={(v) => updateRule(index, { operator: v as RuleOperator })}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {operators.map(op => (
                            <SelectItem key={op} value={op}>{OPERATOR_LABELS[op]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Valor */}
                    <div className="space-y-1">
                      <Label className="text-[11px] text-gray-500">Valor</Label>
                      {fieldType === 'select' && options.length > 0 ? (
                        <Select
                          value={rule.value || ''}
                          onValueChange={(v) => updateRule(index, { value: v })}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Seleccionar..." />
                          </SelectTrigger>
                          <SelectContent>
                            {options.map(opt => (
                              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          type={fieldType === 'number' ? 'number' : 'text'}
                          value={rule.value || ''}
                          onChange={(e) => updateRule(index, { value: e.target.value })}
                          placeholder={fieldType === 'number' ? '0' : 'Valor...'}
                          className="h-8 text-xs"
                        />
                      )}
                    </div>

                    {/* Eliminar */}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeRule(index)}
                      className="h-8 w-8 p-0 text-gray-400 hover:text-red-500"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}

            {/* Botón agregar regla */}
            <Button onClick={addRule} size="sm" variant="outline" className="w-full gap-1 border-dashed">
              <Plus className="h-3.5 w-3.5" /> Agregar regla
            </Button>
          </div>
        )}

        {/* Vista previa de productos */}
        {showPreview && (
          <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-blue-700 dark:text-blue-300 flex items-center gap-1.5">
                <Eye className="h-4 w-4" />
                Vista previa
              </span>
              {evaluating ? (
                <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
              ) : (
                <Badge className="bg-blue-600 text-white text-xs">
                  {previewCount} producto{previewCount !== 1 ? 's' : ''}
                </Badge>
              )}
            </div>
            {!evaluating && previewProducts.length > 0 && (
              <div className="max-h-40 overflow-y-auto space-y-1">
                {previewProducts.slice(0, 50).map(p => (
                  <div key={p.id} className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                    <Package className="h-3 w-3 flex-shrink-0 text-gray-400" />
                    <span className="truncate">{p.name}</span>
                    <span className="font-mono text-gray-400 ml-auto flex-shrink-0">{p.sku}</span>
                  </div>
                ))}
                {previewProducts.length > 50 && (
                  <p className="text-xs text-gray-400 italic pt-1">
                    y {previewProducts.length - 50} más...
                  </p>
                )}
              </div>
            )}
            {!evaluating && previewProducts.length === 0 && previewCount === 0 && (
              <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                <AlertCircle className="h-3.5 w-3.5" />
                Ningún producto cumple estas reglas
              </p>
            )}
          </div>
        )}

        {/* Botones de acción */}
        {rules.length > 0 && (
          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            <Button
              onClick={handlePreview}
              disabled={evaluating || rules.some(r => !r.value && r.operator !== 'in' && r.operator !== 'not_in')}
              variant="outline"
              size="sm"
              className="flex-1 gap-1.5"
            >
              {evaluating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
              Vista previa
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !dirty}
              variant="outline"
              size="sm"
              className="flex-1 gap-1.5"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Guardar reglas
            </Button>
            <Button
              onClick={handleApply}
              disabled={applying || rules.some(r => !r.value && r.operator !== 'in' && r.operator !== 'not_in')}
              size="sm"
              className="flex-1 gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
            >
              {applying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              Aplicar y asignar
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
