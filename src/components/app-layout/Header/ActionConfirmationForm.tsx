'use client';

import React, { useState } from 'react';
import { Check, X, AlertTriangle, Loader2, Shield, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/utils/Utils';
import type { ActionFieldDef, PendingAction } from '@/lib/ai/assistant/clientTypes';

interface ActionConfirmationFormProps {
  action: PendingAction;
  /** Devuelve los campos corregidos; el id lo pone el llamador. */
  onConfirm: (fields: Array<{ name: string; value: unknown }>) => void;
  onReject: () => void;
  isExecuting?: boolean;
}

const RISK_LABEL: Record<PendingAction['risk'], { text: string; className: string }> = {
  low: {
    text: 'Sin impacto',
    className: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600',
  },
  medium: {
    text: 'Crea o modifica datos',
    className: 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-700',
  },
  high: {
    text: 'Impacto contable',
    className: 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-700',
  },
};

export default function ActionConfirmationForm({
  action,
  onConfirm,
  onReject,
  isExecuting = false,
}: ActionConfirmationFormProps) {
  const [fields, setFields] = useState<ActionFieldDef[]>(action.fields);
  const [isImprovingDescription, setIsImprovingDescription] = useState(false);

  const updateField = (name: string, value: unknown) => {
    setFields((prev) => prev.map((field) => (field.name === name ? { ...field, value } : field)));
  };

  const handleImproveDescription = async () => {
    const nameField = fields.find((f) => f.name === 'name');
    const descField = fields.find((f) => f.name === 'description');
    if (!nameField?.value) return;

    setIsImprovingDescription(true);
    try {
      const response = await fetch('/api/ai-assistant/improve-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productName: nameField.value,
          currentDescription: descField?.value || '',
          type: 'product_description',
        }),
      });

      if (response.ok) {
        const data = await response.json();
        updateField('description', data.improvedText);
      }
    } catch (error) {
      console.error('Error mejorando descripción:', error);
    } finally {
      setIsImprovingDescription(false);
    }
  };

  const handleConfirm = () => {
    onConfirm(fields.map((f) => ({ name: f.name, value: f.value })));
  };

  const asText = (value: unknown): string =>
    value === null || value === undefined ? '' : String(value);

  const renderField = (field: ActionFieldDef) => {
    const baseInputClass = 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600';
    const disabled = field.readonly || isExecuting;

    switch (field.type) {
      case 'number':
        return (
          <Input
            id={field.name}
            type="number"
            value={asText(field.value)}
            onChange={(e) => updateField(field.name, e.target.value === '' ? '' : parseFloat(e.target.value))}
            min={field.min}
            max={field.max}
            disabled={disabled}
            className={cn(baseInputClass, field.readonly && 'bg-gray-100 dark:bg-gray-700')}
          />
        );

      case 'textarea':
        return (
          <div className="space-y-2">
            <Textarea
              id={field.name}
              value={asText(field.value)}
              onChange={(e) => updateField(field.name, e.target.value)}
              placeholder={field.placeholder}
              disabled={disabled}
              className={cn(baseInputClass, 'min-h-[80px]', field.readonly && 'bg-gray-100 dark:bg-gray-700')}
            />
            {field.name === 'description' && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleImproveDescription}
                disabled={isImprovingDescription || isExecuting}
                className="text-xs h-7 text-purple-600 border-purple-200 hover:bg-purple-50 dark:text-purple-400 dark:border-purple-800 dark:hover:bg-purple-900/20"
              >
                {isImprovingDescription ? (
                  <>
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    Mejorando...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3 w-3 mr-1" />
                    Mejorar con IA
                  </>
                )}
              </Button>
            )}
          </div>
        );

      case 'select':
        return (
          <Select
            value={asText(field.value)}
            onValueChange={(value) => updateField(field.name, value)}
            disabled={disabled}
          >
            <SelectTrigger id={field.name} className={baseInputClass}>
              <SelectValue placeholder={field.placeholder || 'Seleccionar...'} />
            </SelectTrigger>
            <SelectContent>
              {(field.options ?? []).map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );

      case 'boolean':
        return (
          <div className="flex items-center space-x-2">
            <Switch
              id={field.name}
              checked={Boolean(field.value)}
              onCheckedChange={(checked) => updateField(field.name, checked)}
              disabled={disabled}
            />
            <span className="text-sm text-gray-600 dark:text-gray-400">{field.value ? 'Sí' : 'No'}</span>
          </div>
        );

      case 'date':
        return (
          <Input
            id={field.name}
            type="date"
            value={asText(field.value)}
            onChange={(e) => updateField(field.name, e.target.value)}
            disabled={disabled}
            className={baseInputClass}
          />
        );

      default:
        return (
          <Input
            id={field.name}
            value={asText(field.value)}
            onChange={(e) => updateField(field.name, e.target.value)}
            placeholder={field.placeholder}
            disabled={disabled}
            className={cn(baseInputClass, field.readonly && 'bg-gray-100 dark:bg-gray-700')}
          />
        );
    }
  };

  const requiredFieldsValid = fields
    .filter((f) => f.required)
    .every((f) => f.value !== undefined && f.value !== '' && f.value !== null);

  const risk = RISK_LABEL[action.risk] ?? RISK_LABEL.medium;

  return (
    <section
      aria-label={`Confirmar acción: ${action.title}`}
      className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm"
    >
      <div className="bg-gray-50 dark:bg-gray-900 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-blue-600 dark:text-blue-400" aria-hidden="true" />
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">{action.title}</h3>
        </div>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <Badge variant="outline" className={risk.className}>
            {risk.text}
          </Badge>
        </div>
      </div>

      {action.description && (
        <div className="px-4 py-3 bg-gray-50/50 dark:bg-gray-900/50 border-b border-gray-100 dark:border-gray-800">
          <p className="text-sm text-gray-600 dark:text-gray-400">{action.description}</p>
        </div>
      )}

      <div className="p-4 space-y-4">
        {fields.map((field) => (
          <div key={field.name} className="space-y-1.5">
            <Label htmlFor={field.name} className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {field.label}
              {field.required && (
                <span className="text-red-500 ml-1" aria-hidden="true">
                  *
                </span>
              )}
            </Label>
            {renderField(field)}
          </div>
        ))}
      </div>

      <div className="px-4 py-3 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between gap-3">
        <Button
          variant="outline"
          onClick={onReject}
          disabled={isExecuting}
          className="flex-1 border-red-300 text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20"
        >
          <X className="h-4 w-4 mr-2" aria-hidden="true" />
          Rechazar
        </Button>
        <Button
          onClick={handleConfirm}
          disabled={isExecuting || !requiredFieldsValid}
          className="flex-1 bg-green-600 hover:bg-green-700 text-white"
        >
          {isExecuting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
              Ejecutando...
            </>
          ) : (
            <>
              <Check className="h-4 w-4 mr-2" aria-hidden="true" />
              Confirmar
            </>
          )}
        </Button>
      </div>

      <div className="px-4 py-2 bg-gray-50 dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800">
        <p className="text-[10px] text-gray-500 dark:text-gray-400 flex items-center gap-1">
          <Shield className="h-3 w-3" aria-hidden="true" />
          Esta acción se ejecuta solo dentro de tu organización, con tus permisos.
        </p>
      </div>
    </section>
  );
}
