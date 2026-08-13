'use client';

import React, { useState, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { X, Plus, ScanLine, AlertCircle, Package } from 'lucide-react';
import { serialTrackingService } from '@/lib/services/serialTrackingService';

interface SerialCaptureSectionProps {
  productId: number;
  productName: string;
  productSku?: string;
  organizationId: number;
  branchId: number;
  quantity: number;
  serials: string[];
  onSerialsChange: (serials: string[]) => void;
  supplierId?: number;
  purchaseOrderId?: number;
  purchaseInvoiceId?: string;
  costAtPurchase?: number;
  warrantyMonths?: number;
  compact?: boolean;
}

export function SerialCaptureSection({
  productId,
  productName,
  productSku,
  organizationId,
  branchId,
  quantity,
  serials,
  onSerialsChange,
  compact = false,
}: SerialCaptureSectionProps) {
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState('');
  const [validating, setValidating] = useState(false);

  const handleAddSerial = useCallback(async () => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;

    if (serials.includes(trimmed)) {
      setError(`El serial "${trimmed}" ya fue agregado`);
      return;
    }

    if (serials.length >= quantity) {
      setError(`Ya se han capturado los ${quantity} seriales requeridos`);
      return;
    }

    setValidating(true);
    setError('');

    try {
      const exists = await serialTrackingService.validateSerialExists(trimmed, organizationId);
      if (exists) {
        setError(`El serial "${trimmed}" ya existe en el sistema`);
        setValidating(false);
        return;
      }
    } catch {
      // Si la validacion falla, permitir agregar de todas formas
    }

    onSerialsChange([...serials, trimmed]);
    setInputValue('');
    setValidating(false);
  }, [inputValue, serials, quantity, organizationId, onSerialsChange]);

  const handleRemoveSerial = (index: number) => {
    onSerialsChange(serials.filter((_, i) => i !== index));
    setError('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddSerial();
    }
  };

  const remaining = quantity - serials.length;
  const isComplete = serials.length === quantity;

  if (compact) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Escanear o escribir serial..."
            disabled={isComplete || validating}
            className="h-8 text-sm flex-1"
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleAddSerial}
            disabled={isComplete || validating || !inputValue.trim()}
            className="h-8 px-2"
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
        {error && <p className="text-xs text-red-500 flex items-center gap-1"><AlertCircle className="h-3 w-3" />{error}</p>}
        {serials.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {serials.map((s, i) => (
              <Badge key={i} variant="secondary" className="text-xs gap-1 pr-1">
                {s}
                <button onClick={() => handleRemoveSerial(i)} className="hover:text-red-500">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
        <p className="text-xs text-gray-500">
          {serials.length}/{quantity} seriales capturados
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 p-3 rounded-lg border border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-900/10">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Package className="h-4 w-4 text-blue-600" />
          <span className="text-sm font-medium text-gray-900 dark:text-white">
            Captura de Seriales
          </span>
        </div>
        <Badge variant={isComplete ? 'default' : 'outline'} className={isComplete ? 'bg-green-600' : ''}>
          {serials.length}/{quantity}
        </Badge>
      </div>

      <p className="text-xs text-gray-500 dark:text-gray-400">
        {productName} {productSku && `· SKU: ${productSku}`}
      </p>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <ScanLine className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Escanear o escribir numero de serial..."
            disabled={isComplete || validating}
            className="pl-8"
          />
        </div>
        <Button
          type="button"
          size="sm"
          onClick={handleAddSerial}
          disabled={isComplete || validating || !inputValue.trim()}
        >
          <Plus className="h-4 w-4 mr-1" />
          Agregar
        </Button>
      </div>

      {error && (
        <p className="text-sm text-red-500 flex items-center gap-1">
          <AlertCircle className="h-4 w-4" />
          {error}
        </p>
      )}

      {serials.length > 0 && (
        <div className="space-y-1.5">
          {serials.map((serial, i) => (
            <div
              key={i}
              className="flex items-center justify-between p-2 rounded-md bg-white dark:bg-gray-800 border dark:border-gray-700"
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-gray-400">#{i + 1}</span>
                <span className="text-sm font-mono text-gray-900 dark:text-white">{serial}</span>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => handleRemoveSerial(i)}
                className="h-6 w-6 p-0 text-gray-400 hover:text-red-500"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {isComplete && (
        <p className="text-xs text-green-600 dark:text-green-400 font-medium">
          ✓ Todos los seriales han sido capturados
        </p>
      )}

      {remaining > 0 && !isComplete && (
        <p className="text-xs text-gray-500">
          Faltan {remaining} serial{remaining !== 1 ? 'es' : ''} por capturar
        </p>
      )}
    </div>
  );
}

export default SerialCaptureSection;
