'use client';

import React, { useState } from 'react';
import { Check, X, AlertTriangle, Loader2, Shield, Sparkles, ImagePlus } from 'lucide-react';
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
import type { AIAction, AIActionField } from '@/lib/services/aiActionsService';
import { aiActionsService } from '@/lib/services/aiActionsService';

interface ActionConfirmationFormProps {
  action: AIAction;
  onConfirm: (action: AIAction) => void;
  onReject: (action: AIAction) => void;
  isExecuting?: boolean;
}

export default function ActionConfirmationForm({
  action,
  onConfirm,
  onReject,
  isExecuting = false,
}: ActionConfirmationFormProps) {
  const [fields, setFields] = useState<AIActionField[]>(action.fields);
  const [isImprovingDescription, setIsImprovingDescription] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);

  const updateField = (name: string, value: any) => {
    setFields(prev => prev.map(field => 
      field.name === name ? { ...field, value } : field
    ));
  };

  // Mejorar descripción con IA
  const handleImproveDescription = async () => {
    const nameField = fields.find(f => f.name === 'name');
    const descField = fields.find(f => f.name === 'description');
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

  // Generar imagen con IA
  const handleGenerateImage = async () => {
    const nameField = fields.find(f => f.name === 'name');
    const descField = fields.find(f => f.name === 'description');
    if (!nameField?.value) {
      alert('Ingresa el nombre del producto primero');
      return;
    }

    setIsGeneratingImage(true);
    try {
      const response = await fetch('/api/ai-assistant/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productName: nameField.value,
          description: descField?.value || '',
          organizationId: action.organizationId,
        }),
      });
      
      const data = await response.json();
      
      if (response.ok && data.imageUrl) {
        setGeneratedImageUrl(data.imageUrl);
        updateField('image_url', data.imageUrl);
      } else {
        alert(data.error || 'Error generando imagen');
      }
    } catch (error: any) {
      console.error('Error generando imagen:', error);
      alert('Error de conexión al generar imagen');
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleConfirm = () => {
    const updatedAction: AIAction = {
      ...action,
      fields,
      status: 'confirmed',
    };
    onConfirm(updatedAction);
  };

  const handleReject = () => {
    const rejectedAction: AIAction = {
      ...action,
      status: 'rejected',
    };
    onReject(rejectedAction);
  };

  const renderField = (field: AIActionField) => {
    const baseInputClass = "bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600";
    
    switch (field.type) {
      case 'text':
        // Campo especial para imagen con generación IA
        if (field.name === 'image_url') {
          return (
            <div className="space-y-2">
              <div className="flex gap-2">
                <Input
                  value={field.value || ''}
                  onChange={(e) => updateField(field.name, e.target.value)}
                  placeholder={field.placeholder}
                  disabled={field.readonly || isExecuting}
                  className={cn(baseInputClass, 'flex-1', field.readonly && 'bg-gray-100 dark:bg-gray-700')}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleGenerateImage}
                  disabled={isGeneratingImage || isExecuting}
                  className="text-xs whitespace-nowrap text-purple-600 border-purple-200 hover:bg-purple-50 dark:text-purple-400 dark:border-purple-800 dark:hover:bg-purple-900/20"
                >
                  {isGeneratingImage ? (
                    <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Generando...</>
                  ) : (
                    <><ImagePlus className="h-3 w-3 mr-1" />Generar con IA</>
                  )}
                </Button>
              </div>
              {(field.value || generatedImageUrl) && (
                <div className="relative w-20 h-20 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                  <img 
                    src={field.value || generatedImageUrl || ''} 
                    alt="Vista previa" 
                    className="w-full h-full object-cover"
                    onError={(e) => (e.currentTarget.style.display = 'none')}
                  />
                </div>
              )}
            </div>
          );
        }
        return (
          <Input
            value={field.value || ''}
            onChange={(e) => updateField(field.name, e.target.value)}
            placeholder={field.placeholder}
            disabled={field.readonly || isExecuting}
            className={cn(baseInputClass, field.readonly && 'bg-gray-100 dark:bg-gray-700')}
          />
        );
      
      case 'number':
        return (
          <Input
            type="number"
            value={field.value || ''}
            onChange={(e) => updateField(field.name, parseFloat(e.target.value) || 0)}
            min={field.min}
            max={field.max}
            disabled={field.readonly || isExecuting}
            className={cn(baseInputClass, field.readonly && 'bg-gray-100 dark:bg-gray-700')}
          />
        );
      
      case 'textarea':
        return (
          <div className="space-y-2">
            <Textarea
              value={field.value || ''}
              onChange={(e) => updateField(field.name, e.target.value)}
              placeholder={field.placeholder}
              disabled={field.readonly || isExecuting}
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
                  <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Mejorando...</>
                ) : (
                  <><Sparkles className="h-3 w-3 mr-1" />Mejorar con IA</>
                )}
              </Button>
            )}
          </div>
        );
      
      case 'select':
        return (
          <Select
            value={field.value || ''}
            onValueChange={(value) => updateField(field.name, value)}
            disabled={field.readonly || isExecuting}
          >
            <SelectTrigger className={baseInputClass}>
              <SelectValue placeholder="Seleccionar..." />
            </SelectTrigger>
            <SelectContent>
              {field.options?.map((option) => (
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
              checked={field.value || false}
              onCheckedChange={(checked) => updateField(field.name, checked)}
              disabled={field.readonly || isExecuting}
            />
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {field.value ? 'Sí' : 'No'}
            </span>
          </div>
        );
      
      case 'date':
        return (
          <Input
            type="date"
            value={field.value || ''}
            onChange={(e) => updateField(field.name, e.target.value)}
            disabled={field.readonly || isExecuting}
            className={baseInputClass}
          />
        );
      
      default:
        return (
          <Input
            value={field.value || ''}
            onChange={(e) => updateField(field.name, e.target.value)}
            disabled={field.readonly || isExecuting}
            className={baseInputClass}
          />
        );
    }
  };

  const actionDescription = aiActionsService.getActionDescription(action.type);
  const requiredFieldsValid = fields
    .filter(f => f.required)
    .every(f => f.value !== undefined && f.value !== '' && f.value !== null);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
      {/* Header */}
      <div className="bg-gray-50 dark:bg-gray-900 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">
            Confirmar Acción
          </h3>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <Badge variant="outline" className="bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-700">
            {actionDescription}
          </Badge>
          <Badge variant="outline" className="bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600">
            <Shield className="h-3 w-3 mr-1" />
            {action.userRole === 'admin' ? 'Admin' : 'Empleado'}
          </Badge>
        </div>
      </div>

      {/* Description */}
      <div className="px-4 py-3 bg-gray-50/50 dark:bg-gray-900/50 border-b border-gray-100 dark:border-gray-800">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {action.description}
        </p>
      </div>

      {/* Form Fields */}
      <div className="p-4 space-y-4">
        {fields.map((field) => (
          <div key={field.name} className="space-y-1.5">
            <Label 
              htmlFor={field.name} 
              className="text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              {field.label}
              {field.required && <span className="text-red-500 ml-1">*</span>}
            </Label>
            {renderField(field)}
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="px-4 py-3 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between gap-3">
        <Button
          variant="outline"
          onClick={handleReject}
          disabled={isExecuting}
          className="flex-1 border-red-300 text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20"
        >
          <X className="h-4 w-4 mr-2" />
          Rechazar
        </Button>
        <Button
          onClick={handleConfirm}
          disabled={isExecuting || !requiredFieldsValid}
          className="flex-1 bg-green-600 hover:bg-green-700 text-white"
        >
          {isExecuting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Ejecutando...
            </>
          ) : (
            <>
              <Check className="h-4 w-4 mr-2" />
              Confirmar
            </>
          )}
        </Button>
      </div>

      {/* Security Notice */}
      <div className="px-4 py-2 bg-gray-50 dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800">
        <p className="text-[10px] text-gray-500 dark:text-gray-400 flex items-center gap-1">
          <Shield className="h-3 w-3" />
          Esta acción se ejecutará solo dentro de tu organización
        </p>
      </div>
    </div>
  );
}
