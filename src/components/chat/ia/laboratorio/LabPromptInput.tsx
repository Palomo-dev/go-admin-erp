'use client';

import { useState } from 'react';
import { Send, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface LabPromptInputProps {
  onSubmit: (query: string) => void;
  loading: boolean;
  disabled: boolean;
}

const EXAMPLE_PROMPTS = [
  '¿Cuáles son los horarios de atención?',
  '¿Cómo puedo hacer una reserva?',
  '¿Cuál es la política de cancelación?',
  '¿Tienen servicio de estacionamiento?',
  '¿Aceptan mascotas?'
];

export default function LabPromptInput({
  onSubmit,
  loading,
  disabled
}: LabPromptInputProps) {
  const [query, setQuery] = useState('');

  const handleSubmit = () => {
    if (query.trim() && !loading) {
      onSubmit(query.trim());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <Card className="border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-medium text-gray-900 dark:text-white flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          Probar Consulta
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Escribe una pregunta para probar cómo responde la IA..."
            className="min-h-[100px] bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 resize-none"
            disabled={loading || disabled}
          />
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Presiona Enter para enviar o Shift+Enter para nueva línea
            </p>
            <Button
              onClick={handleSubmit}
              disabled={!query.trim() || loading || disabled}
              className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Procesando...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Probar
                </>
              )}
            </Button>
          </div>
        </div>

        <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
            Ejemplos de consultas:
          </p>
          <div className="flex flex-wrap gap-2">
            {EXAMPLE_PROMPTS.map((prompt, index) => (
              <button
                key={index}
                onClick={() => setQuery(prompt)}
                disabled={loading || disabled}
                className="text-xs px-3 py-1.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-blue-100 dark:hover:bg-blue-900/30 hover:text-blue-700 dark:hover:text-blue-400 transition-colors disabled:opacity-50"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
