'use client';

import React, { useState, useEffect } from 'react';
import { Settings2, Loader2, Check, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { WidgetBehavior } from '@/lib/services/chatChannelsService';

interface WidgetBehaviorSectionProps {
  behavior: WidgetBehavior;
  onUpdate: (behavior: WidgetBehavior) => Promise<void>;
}

const defaultBehavior: WidgetBehavior = {
  title: 'Chat',
  welcomeMessage: '¡Hola! ¿En qué podemos ayudarte?',
  openDefaultView: 'chat',
  showQuickActions: false,
  quickActions: [],
  offlineMessage: 'No estamos disponibles en este momento. Déjanos tu mensaje y te responderemos pronto.',
  offlineCollectData: true
};

export default function WidgetBehaviorSection({
  behavior,
  onUpdate
}: WidgetBehaviorSectionProps) {
  const [localBehavior, setLocalBehavior] = useState<WidgetBehavior>({
    ...defaultBehavior,
    ...behavior
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [newAction, setNewAction] = useState({ label: '', action: '' });

  useEffect(() => {
    setLocalBehavior({ ...defaultBehavior, ...behavior });
  }, [behavior]);

  const hasChanges = JSON.stringify(localBehavior) !== JSON.stringify({ ...defaultBehavior, ...behavior });

  const handleSave = async () => {
    try {
      setIsSaving(true);
      await onUpdate(localBehavior);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setIsSaving(false);
    }
  };

  const addQuickAction = () => {
    if (newAction.label && newAction.action) {
      setLocalBehavior({
        ...localBehavior,
        quickActions: [...(localBehavior.quickActions || []), { ...newAction }]
      });
      setNewAction({ label: '', action: '' });
    }
  };

  const removeQuickAction = (index: number) => {
    const actions = [...(localBehavior.quickActions || [])];
    actions.splice(index, 1);
    setLocalBehavior({ ...localBehavior, quickActions: actions });
  };

  return (
    <Card className="dark:bg-gray-800 dark:border-gray-700">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Settings2 className="h-5 w-5 text-blue-600" />
          Comportamiento al Abrir
        </CardTitle>
        <CardDescription>
          Configura qué ve el usuario cuando abre el widget
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Título del Chat */}
        <div className="space-y-2">
          <Label>Título del Chat</Label>
          <Input
            value={localBehavior.title}
            onChange={(e) => setLocalBehavior({ ...localBehavior, title: e.target.value })}
            placeholder="Chat"
            maxLength={30}
          />
          <p className="text-xs text-gray-500">Aparece en el header del widget</p>
        </div>

        {/* Mensaje de Bienvenida */}
        <div className="space-y-2">
          <Label>Mensaje de Bienvenida</Label>
          <Textarea
            value={localBehavior.welcomeMessage}
            onChange={(e) => setLocalBehavior({ ...localBehavior, welcomeMessage: e.target.value })}
            placeholder="¡Hola! ¿En qué podemos ayudarte?"
            rows={3}
          />
          <p className="text-xs text-gray-500">Primer mensaje que ve el usuario al abrir el chat</p>
        </div>

        {/* Vista Inicial */}
        <div className="space-y-2">
          <Label>Vista Inicial al Abrir</Label>
          <Select
            value={localBehavior.openDefaultView}
            onValueChange={(value: 'chat' | 'faq' | 'form') => 
              setLocalBehavior({ ...localBehavior, openDefaultView: value })
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="chat">
                <div className="flex items-center gap-2">
                  <span>💬</span>
                  <div>
                    <p className="font-medium">Chat directo</p>
                    <p className="text-xs text-gray-500">El usuario puede escribir inmediatamente</p>
                  </div>
                </div>
              </SelectItem>
              <SelectItem value="form">
                <div className="flex items-center gap-2">
                  <span>📝</span>
                  <div>
                    <p className="font-medium">Formulario primero</p>
                    <p className="text-xs text-gray-500">Pedir datos antes de chatear</p>
                  </div>
                </div>
              </SelectItem>
              <SelectItem value="faq">
                <div className="flex items-center gap-2">
                  <span>❓</span>
                  <div>
                    <p className="font-medium">Preguntas frecuentes</p>
                    <p className="text-xs text-gray-500">Mostrar opciones rápidas primero</p>
                  </div>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Acciones Rápidas */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Acciones Rápidas</Label>
            <Switch
              checked={localBehavior.showQuickActions}
              onCheckedChange={(checked) => setLocalBehavior({ ...localBehavior, showQuickActions: checked })}
            />
          </div>
          
          {localBehavior.showQuickActions && (
            <div className="space-y-3 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
              {/* Lista de acciones */}
              {(localBehavior.quickActions || []).map((action, index) => (
                <div key={index} className="flex items-center gap-2 bg-white dark:bg-gray-800 p-2 rounded border dark:border-gray-700">
                  <span className="flex-1 text-sm">{action.label}</span>
                  <span className="text-xs text-gray-500 truncate max-w-[150px]">{action.action}</span>
                  <button 
                    onClick={() => removeQuickAction(index)}
                    className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                  >
                    <X className="h-4 w-4 text-gray-400" />
                  </button>
                </div>
              ))}
              
              {/* Agregar nueva acción */}
              <div className="flex gap-2">
                <Input
                  value={newAction.label}
                  onChange={(e) => setNewAction({ ...newAction, label: e.target.value })}
                  placeholder="Texto del botón"
                  className="flex-1"
                />
                <Input
                  value={newAction.action}
                  onChange={(e) => setNewAction({ ...newAction, action: e.target.value })}
                  placeholder="Mensaje o URL"
                  className="flex-1"
                />
                <Button 
                  size="icon" 
                  variant="outline"
                  onClick={addQuickAction}
                  disabled={!newAction.label || !newAction.action}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-gray-500">
                Ejemplo: &quot;Horarios&quot; → &quot;¿Cuáles son sus horarios de atención?&quot;
              </p>
            </div>
          )}
        </div>

        {/* Configuración Fuera de Horario */}
        <div className="space-y-3 pt-4 border-t dark:border-gray-700">
          <h4 className="font-medium text-sm flex items-center gap-2">
            🌙 Configuración Fuera de Horario
          </h4>
          
          <div className="space-y-2">
            <Label>Mensaje cuando no hay agentes disponibles</Label>
            <Textarea
              value={localBehavior.offlineMessage}
              onChange={(e) => setLocalBehavior({ ...localBehavior, offlineMessage: e.target.value })}
              placeholder="No estamos disponibles..."
              rows={2}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label>Capturar datos de contacto</Label>
              <p className="text-xs text-gray-500">Pedir email/teléfono para seguimiento</p>
            </div>
            <Switch
              checked={localBehavior.offlineCollectData}
              onCheckedChange={(checked) => setLocalBehavior({ ...localBehavior, offlineCollectData: checked })}
            />
          </div>
        </div>

        {/* Preview */}
        <div className="p-4 bg-gray-100 dark:bg-gray-900 rounded-lg">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Vista previa del mensaje inicial:</p>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 p-4 max-w-xs">
            <div className="text-sm font-medium mb-2">{localBehavior.title || 'Chat'}</div>
            <div className="text-sm p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-gray-700 dark:text-gray-300">
              {localBehavior.welcomeMessage || '¡Hola! ¿En qué podemos ayudarte?'}
            </div>
            {localBehavior.showQuickActions && (localBehavior.quickActions || []).length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {(localBehavior.quickActions || []).slice(0, 3).map((action, index) => (
                  <span 
                    key={index}
                    className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded-full"
                  >
                    {action.label}
                  </span>
                ))}
              </div>
            )}
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
              'Guardar Comportamiento'
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
