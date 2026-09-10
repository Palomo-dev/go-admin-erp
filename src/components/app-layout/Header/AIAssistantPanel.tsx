'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Bot, Sparkles, Trash2, PanelRightClose, X, Wrench, Undo2, History } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import * as VisuallyHidden from '@radix-ui/react-visually-hidden';
import { cn } from '@/utils/Utils';
import type { AssistantMessage, AssistantContext } from '@/lib/services/aiAssistantService';
import {
  EMPTY_DYNAMIC_OPTIONS,
  FIELD_OPTION_SOURCE,
  type DynamicOptions,
  type PendingAction,
} from '@/lib/ai/assistant/clientTypes';
import { streamAssistant, type ToolStep } from '@/lib/ai/assistant/streamClient';
import Composer, { type ComposerAttachment } from './assistant/Composer';
import ConversationHistory from './assistant/ConversationHistory';
import ActionConfirmationForm from './ActionConfirmationForm';
import MarkdownRenderer from './MarkdownRenderer';

interface AIAssistantPanelProps {
  isOpen: boolean;
  onToggle: () => void;
  context: AssistantContext;
}

export default function AIAssistantPanel({
  isOpen,
  onToggle,
  context
}: AIAssistantPanelProps) {
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  /** Texto que se va escribiendo mientras el modelo responde. */
  const [streamingText, setStreamingText] = useState('');
  /** Pasos de herramienta del turno en curso: "Buscando en el catálogo… → 6". */
  const [toolSteps, setToolSteps] = useState<ToolStep[]>([]);
  /** Hilo persistido: sobrevive a cerrar el panel y a recargar la página. */
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  /**
   * Última acción ejecutada que todavía se puede deshacer. Se limpia al enviar
   * otro mensaje: ofrecer "deshacer" tres turnos después confunde sobre QUÉ se
   * va a deshacer.
   */
  const [undoable, setUndoable] = useState<{ actionId: string; label: string } | null>(null);
  const [isUndoing, setIsUndoing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  /** Cambiar este número hace que el historial se recargue. */
  const [historyToken, setHistoryToken] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  /** Permite cortar la respuesta en curso desde el boton de detener. */
  const abortRef = useRef<AbortController | null>(null);
  const [isExecutingAction, setIsExecutingAction] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)');
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadSuggestions();
    }
  }, [isOpen]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const loadSuggestions = async () => {
    try {
      const response = await fetch('/api/ai-assistant/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (response.ok) {
        const data = await response.json();
        setSuggestions(data.suggestions || []);
      }
    } catch (error) {
      console.error('Error loading suggestions:', error);
      setSuggestions([
        '¿Cómo puedo crear un nuevo producto?',
        '¿Cómo genero un reporte de ventas?',
        '¿Cómo registro un nuevo cliente?',
      ]);
    }
  };

  /**
   * Rellena los `select` de la tarjeta con las opciones reales de la
   * organización. Son datos de presentación; el endpoint los filtra por la
   * organización de la sesión.
   */
  const withDynamicOptions = useCallback(async (proposed: PendingAction): Promise<PendingAction> => {
    let dynamicOptions: DynamicOptions = EMPTY_DYNAMIC_OPTIONS;
    try {
      const optionsRes = await fetch('/api/ai-assistant/dynamic-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (optionsRes.ok) {
        dynamicOptions = { ...EMPTY_DYNAMIC_OPTIONS, ...(await optionsRes.json()) };
      }
    } catch (optionsError) {
      console.error('Error cargando opciones del formulario:', optionsError);
    }

    return {
      ...proposed,
      fields: proposed.fields.map((field) => {
        const source = FIELD_OPTION_SOURCE[field.name];
        return source ? { ...field, options: dynamicOptions[source] } : field;
      }),
    };
  }, []);

  const clientContext = useCallback(
    () => ({
      userName: context.userName,
      branchName: context.branchName,
      currentPath: typeof window !== 'undefined' ? window.location.pathname : undefined,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }),
    [context.userName, context.branchName]
  );

  /**
   * Camino de respaldo (§3.1): si el stream no funciona —proxy que bufferiza,
   * navegador sin soporte, error del motor nuevo—, se responde por el endpoint
   * de siempre antes que devolver un error. El asistente nunca deja de
   * responder.
   */
  const sendViaFallback = useCallback(
    async (content: string) => {
      const response = await fetch('/api/ai-assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: content, conversationHistory: messages, context: clientContext() }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Error en la respuesta');
      }

      const data = await response.json();
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: data.content,
          timestamp: new Date(),
        },
      ]);

      if (data.action) {
        setPendingAction(await withDynamicOptions(data.action as PendingAction));
      }
    },
    [messages, clientContext, withDynamicOptions]
  );

  const sendMessage = async (content: string) => {
    if (!content.trim() || isLoading) return;

    const userMessage: AssistantMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: content.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);
    setStreamingText('');
    setToolSteps([]);
    setUndoable(null);

    // Contenedor en vez de dos `let`: TypeScript no ve que los callbacks del
    // stream se ejecuten, asi que estrecha las variables sueltas a `never` y
    // luego se queja al leerlas. El acceso por propiedad no sufre eso.
    const captured: { action: PendingAction | null; error: { message: string } | null } = {
      action: null,
      error: null,
    };

    try {
      const controller = new AbortController();
      abortRef.current = controller;

      const result = await streamAssistant(
        { message: content, conversationId, context: clientContext() },
        {
          onToken: (delta) => setStreamingText((prev) => prev + delta),
          // Los pasos de herramienta no son adorno: convierten la espera en
          // trabajo visible, que es lo que sostiene la confianza cuando la IA
          // va a tocar el catálogo.
          onToolStart: (step) => setToolSteps((prev) => [...prev, step]),
          onToolEnd: (step) =>
            setToolSteps((prev) =>
              prev.map((s) => (s.name === step.name && !s.summary ? { ...s, ...step, label: s.label } : s))
            ),
          onAction: (action) => {
            captured.action = action;
          },
          onUsage: () => {},
          onMeta: (meta) => setConversationId(meta.conversationId),
          onError: (err) => {
            captured.error = err;
          },
        },
        controller.signal
      );

      if (!result.ok) {
        // El stream no llegó a ninguna parte: se intenta por el camino viejo.
        await sendViaFallback(content);
        return;
      }

      const finalText = result.content || captured.error?.message || '';
      if (finalText) {
        setMessages((prev) => [
          ...prev,
          { id: `assistant-${Date.now()}`, role: 'assistant', content: finalText, timestamp: new Date() },
        ]);
      }

      if (captured.action) {
        setPendingAction(await withDynamicOptions(captured.action));
      }
    } catch (error) {
      console.error('Error sending message:', error);
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: 'assistant',
          content: 'Lo siento, hubo un error al procesar tu mensaje. Por favor, intenta de nuevo.',
          timestamp: new Date(),
        },
      ]);
    } finally {
      abortRef.current = null;
      setStreamingText('');
      setToolSteps([]);
      setIsLoading(false);
      // El hilo acaba de cambiar de título o de contador: que el historial lo
      // refleje sin que el usuario tenga que reabrirlo.
      setHistoryToken((t) => t + 1);
    }
  };

  // Confirmar: se manda el id de la propuesta y las correcciones del usuario.
  // Nunca la organización, el rol ni el estado "confirmed" (C1).
  const handleConfirmAction = async (fields: Array<{ name: string; value: unknown }>) => {
    if (!pendingAction) return;
    setIsExecutingAction(true);

    try {
      const response = await fetch('/api/ai-assistant/execute-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionId: pendingAction.id, fields }),
      });

      const result = await response.json();

      // Los caminos de 401/403 (sesión caducada, sin permiso) responden
      // `{ error, code }`, no `{ message }`: leer solo `message` pintaba
      // "Error: undefined" justo cuando el usuario más necesita entender qué
      // pasó. Lo señaló el tester de F0 (fallo 10).
      const detalle =
        result.message ||
        result.error ||
        'No se pudo ejecutar la acción. Vuelve a intentarlo.';

      const resultMessage: AssistantMessage = {
        id: `result-${Date.now()}`,
        role: 'assistant',
        content: result.success
          ? `✅ **Acción completada:** ${detalle}`
          : `❌ **Error:** ${detalle}`,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, resultMessage]);
      setPendingAction(null);

      // El servidor decide si algo es reversible (guardó o no `undo_payload`).
      // El cliente solo pregunta; si no lo es, el endpoint responde que no y el
      // botón no se ofrece.
      if (result.success) {
        setUndoable({ actionId: pendingAction.id, label: pendingAction.title });
      }
    } catch (error) {
      console.error('Error ejecutando acción:', error);
      const errorMessage: AssistantMessage = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: '❌ **Error:** No se pudo ejecutar la acción. Por favor, intenta de nuevo.',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsExecutingAction(false);
    }
  };

  // Rechazar: hay que decírselo al SERVIDOR. Cerrar la tarjeta en el navegador
  // dejaba la propuesta viva y ejecutable 30 minutos con solo reenviar su id, y
  // la auditoría nunca registraba que el usuario había dicho que no.
  const handleRejectAction = () => {
    const actionId = pendingAction?.id;
    if (actionId) {
      void fetch('/api/ai-assistant/reject-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionId }),
      }).catch((error) => console.error('Error rechazando acción:', error));
    }

    const rejectMessage: AssistantMessage = {
      id: `reject-${Date.now()}`,
      role: 'assistant',
      content: '🚫 Acción cancelada. ¿Hay algo más en lo que pueda ayudarte?',
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, rejectMessage]);
    setPendingAction(null);
  };

  /**
   * Retomar un hilo guardado. Cierra la deuda que quedó de F1: la conversación
   * SÍ se persistía, pero el panel arrancaba siempre en blanco, así que para el
   * usuario seguía perdiéndose al cerrar.
   */
  const handleSelectConversation = useCallback(async (id: string) => {
    setShowHistory(false);
    setPendingAction(null);
    setUndoable(null);
    setIsLoading(true);
    try {
      const response = await fetch(`/api/ai-assistant/conversations/${id}`);
      if (!response.ok) throw new Error('No se pudo abrir la conversación');
      const data = await response.json();
      const mensajes = Array.isArray(data.messages) ? data.messages : [];
      setMessages(
        mensajes.map((m: { id: string; role: string; content: string; created_at: string }) => ({
          id: m.id,
          role: m.role === 'user' ? 'user' : 'assistant',
          content: m.content ?? '',
          timestamp: new Date(m.created_at),
        }))
      );
      setConversationId(id);
    } catch (error) {
      console.error('Error abriendo la conversación:', error);
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: 'assistant',
          content: 'No pude abrir esa conversación. Inténtalo otra vez.',
          timestamp: new Date(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  /** Deshacer la última acción, dentro de su ventana de tiempo. */
  const handleUndo = useCallback(async () => {
    if (!undoable || isUndoing) return;
    setIsUndoing(true);
    try {
      const response = await fetch('/api/ai-assistant/undo-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionId: undoable.actionId }),
      });
      const result = await response.json();
      const detalle = result.message || result.error || 'No se pudo deshacer.';

      setMessages((prev) => [
        ...prev,
        {
          id: `undo-${Date.now()}`,
          role: 'assistant',
          content: result.success ? `↩️ **Deshecho:** ${detalle}` : `⚠️ ${detalle}`,
          timestamp: new Date(),
        },
      ]);

      // El botón desaparece pase lo que pase: si se deshizo, ya no hay nada que
      // deshacer; si no se pudo, insistir no va a cambiar el resultado y el
      // mensaje ya explica por qué.
      setUndoable(null);
    } catch (error) {
      console.error('Error deshaciendo:', error);
      setUndoable(null);
    } finally {
      setIsUndoing(false);
    }
  }, [undoable, isUndoing]);

  /** Adjuntar: por boton, por arrastrar y soltar, o pegando una captura. */
  const handleAttach = useCallback((files: File[]) => {
    const MAX_BYTES = 20 * 1024 * 1024;
    const nuevos = files
      .filter((f) => f.size <= MAX_BYTES)
      .map((file) => ({
        id: `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        file,
        previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
      }));
    if (nuevos.length < files.length) {
      console.warn('[GO Assistant] Se descartaron archivos de mas de 20 MB');
    }
    setAttachments((prev) => [...prev, ...nuevos]);
  }, []);

  const handleRemoveAttachment = useCallback((id: string) => {
    setAttachments((prev) => {
      const found = prev.find((a) => a.id === id);
      // Los `blob:` de la vista previa hay que liberarlos a mano o quedan
      // retenidos mientras viva la pestana.
      if (found?.previewUrl) URL.revokeObjectURL(found.previewUrl);
      return prev.filter((a) => a.id !== id);
    });
  }, []);

  /** Cortar la respuesta en curso. Lo que ya llego se conserva. */
  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) handleAttach(files);
    },
    [handleAttach]
  );

  const handleSuggestionClick = (suggestion: string) => {
    sendMessage(suggestion);
  };

  const clearConversation = () => {
    setMessages([]);
    setPendingAction(null);
    // Se abre un hilo NUEVO en vez de seguir escribiendo en el anterior: el
    // historial queda intacto y recuperable desde la base.
    setConversationId(null);
    setStreamingText('');
    setToolSteps([]);
  };

  // Contenido compartido del asistente (header + mensajes + input)
  const renderAssistantContent = () => (
    <div
      className="relative flex flex-col h-full bg-white dark:bg-gray-900"
      onDragOver={(e) => {
        e.preventDefault();
        if (!isDragging) setIsDragging(true);
      }}
      onDragLeave={(e) => {
        // Solo cuando el puntero sale del panel entero, no al pasar por encima
        // de un hijo: si no, la superposicion parpadea.
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false);
      }}
      onDrop={handleDrop}
    >
      {showHistory && (
        <div className="absolute inset-x-0 top-[60px] bottom-0 z-10 bg-white dark:bg-gray-900">
          <ConversationHistory
            activeId={conversationId}
            onSelect={handleSelectConversation}
            onClose={() => setShowHistory(false)}
            refreshToken={historyToken}
            className="h-full"
          />
        </div>
      )}

      {isDragging && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-blue-50/95 dark:bg-blue-950/95 border-2 border-dashed border-blue-400 rounded-lg pointer-events-none">
          <p className="text-sm font-medium text-blue-700 dark:text-blue-300">
            Suelta aquí la foto o el archivo
          </p>
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between p-4 min-h-[60px] bg-blue-600 flex-shrink-0">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-white flex-shrink-0">
            <Bot size={18} />
          </span>
          <h2 className="text-lg font-bold text-white truncate">
            GO Assistant
          </h2>
        </div>
        
        <div className="flex items-center gap-1 flex-shrink-0 ml-2">
          <button
            onClick={() => setShowHistory((v) => !v)}
            className="flex items-center justify-center h-8 w-8 rounded-full bg-blue-700 text-white hover:bg-blue-800 transition-colors"
            title="Conversaciones anteriores"
            aria-label="Conversaciones anteriores"
            aria-pressed={showHistory}
          >
            <History size={14} />
          </button>
          {messages.length > 0 && (
            <button
              onClick={clearConversation}
              className="flex items-center justify-center h-8 w-8 rounded-full bg-blue-700 text-white hover:bg-blue-800 transition-colors"
              title="Limpiar conversación"
            >
              <Trash2 size={14} />
            </button>
          )}
          <button
            onClick={onToggle}
            className="flex items-center justify-center h-8 w-8 rounded-full bg-blue-700 text-white hover:bg-blue-800 transition-colors"
            aria-label="Cerrar panel de asistente"
          >
            {isMobile ? <X size={16} /> : <PanelRightClose size={16} />}
          </button>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-full mb-4">
              <Sparkles size={32} className="text-blue-500" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              ¡Hola, {context.userName}!
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              Soy tu asistente de IA. Puedo ayudarte con tareas del sistema, responder preguntas y guiarte en procesos.
            </p>

            {/* Suggestions */}
            {suggestions.length > 0 && (
              <div className="w-full space-y-2">
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">
                  Sugerencias
                </p>
                {suggestions.map((suggestion, index) => (
                  <button
                    key={index}
                    onClick={() => handleSuggestionClick(suggestion)}
                    className="w-full p-3 text-left text-sm bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-700 transition-colors"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  'flex gap-3',
                  message.role === 'user' ? 'flex-row-reverse' : 'flex-row'
                )}
              >
                <Avatar className="h-8 w-8 flex-shrink-0">
                  <AvatarFallback
                    className={cn(
                      message.role === 'user'
                        ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                        : 'bg-gradient-to-br from-blue-500 to-purple-500 text-white'
                    )}
                  >
                    {message.role === 'user' ? context.userName.charAt(0).toUpperCase() : <Bot size={16} />}
                  </AvatarFallback>
                </Avatar>
                <div
                  className={cn(
                    'max-w-[80%] rounded-2xl px-4 py-2.5',
                    message.role === 'user'
                      ? 'bg-blue-600 text-white rounded-tr-sm'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white rounded-tl-sm'
                  )}
                >
                  {message.role === 'assistant' ? (
                    <MarkdownRenderer content={message.content} />
                  ) : (
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  )}
                </div>
              </div>
            ))}
            {/* Deshacer la última acción, mientras la ventana siga abierta. */}
            {undoable && !isLoading && (
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={handleUndo}
                  disabled={isUndoing}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-full border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
                >
                  <Undo2 size={12} aria-hidden="true" />
                  {isUndoing ? 'Deshaciendo…' : `Deshacer «${undoable.label}»`}
                </button>
              </div>
            )}

            {/*
              Turno en curso. Antes eran tres puntitos rebotando entre 5 y 20
              segundos; ahora se ve el texto según llega y qué está haciendo el
              asistente. Solo se cae a los puntitos mientras no haya llegado
              nada todavía.
            */}
            {isLoading && (
              <div className="flex gap-3">
                <Avatar className="h-8 w-8 flex-shrink-0">
                  <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-500 text-white">
                    <Bot size={16} />
                  </AvatarFallback>
                </Avatar>
                <div className="max-w-[80%] bg-gray-100 dark:bg-gray-800 rounded-2xl rounded-tl-sm px-4 py-2.5 space-y-2">
                  {toolSteps.length > 0 && (
                    <ul className="space-y-1" aria-label="Pasos en curso">
                      {toolSteps.map((step, index) => (
                        <li
                          key={`${step.name}-${index}`}
                          className="flex items-start gap-1.5 text-xs text-gray-500 dark:text-gray-400"
                        >
                          <Wrench size={12} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
                          <span>
                            {step.label || step.name}
                            {step.summary ? ` → ${step.summary}` : ''}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {streamingText ? (
                    <div className="text-gray-900 dark:text-white">
                      <MarkdownRenderer content={streamingText} />
                    </div>
                  ) : (
                    toolSteps.length === 0 && (
                      <div className="flex items-center gap-1 py-1" aria-label="Escribiendo">
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    )
                  )}
                </div>
              </div>
            )}
            
            {/* Formulario de Confirmación de Acción - Dentro del chat */}
            {pendingAction && (
              <div className="flex gap-3">
                <Avatar className="h-8 w-8 flex-shrink-0">
                  <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-500 text-white">
                    <Bot size={16} />
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 max-w-[90%]">
                  <ActionConfirmationForm
                    action={pendingAction}
                    onConfirm={handleConfirmAction}
                    onReject={handleRejectAction}
                    isExecuting={isExecutingAction}
                  />
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      <Composer
        value={inputValue}
        onChange={setInputValue}
        onSubmit={() => sendMessage(inputValue)}
        onStop={stopStreaming}
        isLoading={isLoading}
        attachments={attachments}
        onAttach={handleAttach}
        onRemoveAttachment={handleRemoveAttachment}
        // Los adjuntos se recogen pero todavia no se leen: la extraccion de
        // facturas es la Fase 4. Se avisa en vez de aceptarlos en silencio.
        attachmentsEnabled={false}
      />

      <div className="px-4 pb-2 bg-white dark:bg-gray-900 flex-shrink-0">
        <p className="text-[10px] text-gray-400 text-center">
          GO Assistant puede cometer errores. Verifica la información importante.
        </p>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop: Panel lateral */}
      <div
        className={cn(
          'hidden lg:flex flex-col h-full',
          isOpen ? 'w-80 xl:w-96' : 'w-0',
          'bg-white dark:bg-gray-900',
          'border-l border-gray-200 dark:border-gray-700',
          'transition-all duration-300 ease-in-out',
          'overflow-hidden flex-shrink-0'
        )}
      >
        {renderAssistantContent()}
      </div>

      {/* Móvil: Sheet fullscreen desde la derecha */}
      {isMobile && (
        <Sheet open={isOpen} onOpenChange={(open) => { if (!open) onToggle(); }}>
          <SheetContent
            side="right"
            className="w-full sm:w-full sm:max-w-full p-0 border-0 [&>button:last-child]:hidden"
          >
            <VisuallyHidden.Root>
              <SheetTitle>GO Assistant</SheetTitle>
            </VisuallyHidden.Root>
            {renderAssistantContent()}
          </SheetContent>
        </Sheet>
      )}
    </>
  );
}
