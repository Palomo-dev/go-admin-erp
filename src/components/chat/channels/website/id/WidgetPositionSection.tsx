'use client';

import React, { useState, useEffect } from 'react';
import { Move, Loader2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { WidgetPosition } from '@/lib/services/chatChannelsService';

interface WidgetPositionSectionProps {
  position: WidgetPosition;
  onUpdate: (position: WidgetPosition) => Promise<void>;
}

const defaultPosition: WidgetPosition = {
  side: 'right',
  vertical: 'bottom',
  offsetX: 20,
  offsetY: 20
};

export default function WidgetPositionSection({
  position,
  onUpdate
}: WidgetPositionSectionProps) {
  const [localPosition, setLocalPosition] = useState<WidgetPosition>({
    ...defaultPosition,
    ...position
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setLocalPosition({ ...defaultPosition, ...position });
  }, [position]);

  const hasChanges = 
    localPosition.side !== (position?.side || defaultPosition.side) ||
    localPosition.vertical !== (position?.vertical || defaultPosition.vertical) ||
    localPosition.offsetX !== (position?.offsetX ?? defaultPosition.offsetX) ||
    localPosition.offsetY !== (position?.offsetY ?? defaultPosition.offsetY);

  const handleSave = async () => {
    try {
      setIsSaving(true);
      await onUpdate(localPosition);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setIsSaving(false);
    }
  };


  return (
    <Card className="dark:bg-gray-800 dark:border-gray-700">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Move className="h-5 w-5 text-blue-600" />
          Posición del Widget
        </CardTitle>
        <CardDescription>
          Configura dónde aparecerá el widget en tu sitio web
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Visual Position Selector */}
        <div className="space-y-2">
          <Label>Ubicación en Pantalla</Label>
          <div className="grid grid-cols-2 gap-3">
            {[
              { side: 'left' as const, vertical: 'top' as const, label: 'Arriba Izquierda' },
              { side: 'right' as const, vertical: 'top' as const, label: 'Arriba Derecha' },
              { side: 'left' as const, vertical: 'bottom' as const, label: 'Abajo Izquierda' },
              { side: 'right' as const, vertical: 'bottom' as const, label: 'Abajo Derecha' },
            ].map((pos) => (
              <button
                key={`${pos.vertical}-${pos.side}`}
                onClick={() => setLocalPosition({ ...localPosition, side: pos.side, vertical: pos.vertical })}
                className={`p-4 rounded-lg border-2 transition-all text-sm font-medium ${
                  localPosition.side === pos.side && localPosition.vertical === pos.vertical
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <div className={`w-full h-12 bg-gray-100 dark:bg-gray-700 rounded relative mb-2`}>
                  <div 
                    className={`absolute w-3 h-3 rounded-full bg-blue-500 ${
                      pos.vertical === 'top' ? 'top-1' : 'bottom-1'
                    } ${pos.side === 'left' ? 'left-1' : 'right-1'}`}
                  />
                </div>
                {pos.label}
              </button>
            ))}
          </div>
        </div>

        {/* Offset Controls */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Margen Horizontal (px)</Label>
            <Input
              type="number"
              min={0}
              max={100}
              value={localPosition.offsetX}
              onChange={(e) => setLocalPosition({ 
                ...localPosition, 
                offsetX: Math.max(0, Math.min(100, parseInt(e.target.value) || 0))
              })}
              className="w-full"
            />
            <p className="text-xs text-gray-500">Distancia desde el borde {localPosition.side === 'left' ? 'izquierdo' : 'derecho'}</p>
          </div>
          <div className="space-y-2">
            <Label>Margen Vertical (px)</Label>
            <Input
              type="number"
              min={0}
              max={100}
              value={localPosition.offsetY}
              onChange={(e) => setLocalPosition({ 
                ...localPosition, 
                offsetY: Math.max(0, Math.min(100, parseInt(e.target.value) || 0))
              })}
              className="w-full"
            />
            <p className="text-xs text-gray-500">Distancia desde {localPosition.vertical === 'top' ? 'arriba' : 'abajo'}</p>
          </div>
        </div>

        {/* Mini Preview */}
        <div className="p-4 bg-gray-100 dark:bg-gray-900 rounded-lg">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Vista previa de posición:</p>
          <div className="relative w-full h-32 bg-white dark:bg-gray-800 rounded border dark:border-gray-700">
            <div 
              className={`absolute w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs transition-all`}
              style={{
                [localPosition.vertical]: `${localPosition.offsetY}px`,
                [localPosition.side]: `${localPosition.offsetX}px`
              }}
            >
              💬
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end">
          <Button 
            onClick={handleSave} 
            disabled={!hasChanges || isSaving}
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Guardando...
              </>
            ) : saved ? (
              <>
                <Check className="h-4 w-4 mr-2 text-green-500" />
                Guardado
              </>
            ) : (
              'Guardar Posición'
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
