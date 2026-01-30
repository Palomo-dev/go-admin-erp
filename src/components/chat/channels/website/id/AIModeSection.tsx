'use client';

import React from 'react';
import { Bot, Loader2, Check } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AIMode } from '@/lib/services/chatChannelsService';

interface AIModeSectionProps {
  aiMode: AIMode;
  onUpdate: (mode: AIMode) => Promise<void>;
  isUpdating: boolean;
}

export default function AIModeSection({
  aiMode,
  onUpdate,
  isUpdating
}: AIModeSectionProps) {
  const modes = [
    {
      value: 'off' as AIMode,
      label: 'Desactivado',
      description: 'Solo agentes humanos responden. La IA no interviene.',
      icon: '🚫'
    },
    {
      value: 'hybrid' as AIMode,
      label: 'Híbrido (Recomendado)',
      description: 'La IA sugiere respuestas y el agente las aprueba o modifica antes de enviar.',
      icon: '🤝'
    },
    {
      value: 'auto' as AIMode,
      label: 'Automático',
      description: 'La IA responde automáticamente. Los agentes supervisan y pueden intervenir.',
      icon: '🤖'
    }
  ];

  return (
    <Card className="dark:bg-gray-800 dark:border-gray-700">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Bot className="h-5 w-5 text-blue-600" />
          Modo de Inteligencia Artificial
        </CardTitle>
        <CardDescription>
          Configura cómo la IA participa en las conversaciones de este canal
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {modes.map((mode) => (
            <div
              key={mode.value}
              className={`flex items-start space-x-3 p-4 rounded-lg border-2 transition-colors cursor-pointer ${
                aiMode === mode.value
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
              onClick={() => !isUpdating && onUpdate(mode.value)}
            >
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center mt-0.5 ${
                aiMode === mode.value 
                  ? 'border-blue-500 bg-blue-500' 
                  : 'border-gray-300 dark:border-gray-600'
              }`}>
                {aiMode === mode.value && <Check className="h-3 w-3 text-white" />}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{mode.icon}</span>
                  <span className="font-medium text-gray-900 dark:text-white">{mode.label}</span>
                  {isUpdating && aiMode === mode.value && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {mode.description}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Extra info based on mode */}
        {aiMode === 'auto' && (
          <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg text-sm text-yellow-700 dark:text-yellow-300">
            <p className="font-medium mb-1">⚠️ Modo Automático Activo</p>
            <p className="text-xs">
              En este modo, la IA responderá automáticamente a los clientes. 
              Asegúrate de que tu base de conocimiento esté actualizada.
            </p>
          </div>
        )}

        {aiMode === 'hybrid' && (
          <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-sm text-blue-700 dark:text-blue-300">
            <p className="font-medium mb-1">💡 Modo Híbrido</p>
            <p className="text-xs">
              Los agentes verán las sugerencias de IA y podrán aprobarlas, editarlas o escribir sus propias respuestas.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
