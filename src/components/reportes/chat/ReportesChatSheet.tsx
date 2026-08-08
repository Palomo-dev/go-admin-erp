'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Sparkles } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ChatMessage, type ChatMessageData } from './ChatMessage';
import type { PeriodoCierre } from '@/lib/services/reportes/types';

interface ReportesChatSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: number;
  organizationName?: string;
  userName: string;
  userRole: string;
  periodoActual: PeriodoCierre;
  modulosActivos: string[];
}

const SUGERENCIAS_DEFAULT = [
  'Cierre de caja de hoy',
  'CxC vencidas del mes',
  'Top productos más vendidos',
  'Resumen de ventas del período',
];

export function ReportesChatSheet({
  open,
  onOpenChange,
  organizationId,
  organizationName,
  userName,
  userRole,
  periodoActual,
  modulosActivos,
}: ReportesChatSheetProps) {
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll al final
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;

    const userMsg: ChatMessageData = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text.trim(),
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/ai-assistant/reportes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text.trim(),
          conversationHistory: messages.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            timestamp: m.timestamp,
          })),
          context: {
            organizationId,
            organizationName,
            userName,
            userRole,
          },
          periodoActual,
          modulosActivos,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Error en la respuesta del agente');
      }

      const assistantMsg: ChatMessageData = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.content,
        timestamp: new Date().toISOString(),
        reportData: data.reportData,
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      const errorMsg: ChatMessageData = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `⚠️ ${err instanceof Error ? err.message : 'Error desconocido'}`,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  }, [loading, messages, organizationId, organizationName, userName, userRole, periodoActual, modulosActivos]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const handleSuggestion = (suggestion: string) => {
    sendMessage(suggestion);
  };

  const handleClear = () => {
    setMessages([]);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-[480px] p-0 flex flex-col bg-white dark:bg-gray-900">
        <SheetHeader className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-blue-600" />
            <div>
              <SheetTitle className="text-base">Agente IA de Reportes</SheetTitle>
              <SheetDescription className="text-xs">
                Pregunta en lenguaje natural y obtén reportes al instante
              </SheetDescription>
            </div>
          </div>
          {messages.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClear}
              className="absolute right-10 top-3 h-7 text-xs"
            >
              Limpiar
            </Button>
          )}
        </SheetHeader>

        {/* Mensajes */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {messages.length === 0 && (
            <div className="space-y-4">
              <div className="text-center py-6">
                <Sparkles className="w-10 h-10 mx-auto text-blue-500 mb-2" />
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Hola {userName}, soy tu asistente de reportes.
                  <br />
                  Pregúntame algo como:
                </p>
              </div>
              <div className="space-y-2">
                {SUGERENCIAS_DEFAULT.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleSuggestion(s)}
                    className="w-full text-left px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <ChatMessage key={msg.id} message={msg} />
          ))}

          {loading && (
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-gray-500" />
              </div>
              <div className="flex-1 space-y-2 px-4 py-3 rounded-lg bg-gray-100 dark:bg-gray-800">
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="border-t border-gray-200 dark:border-gray-700 p-3">
          <div className="flex gap-2 items-end">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Escribe tu consulta..."
              disabled={loading}
              rows={1}
              className="resize-none min-h-[40px] max-h-[120px] text-sm"
            />
            <Button
              size="icon"
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || loading}
              className="flex-shrink-0"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
          <p className="text-xs text-gray-400 mt-1.5 px-1">
            Enter para enviar · Shift+Enter para salto de línea
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
