'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Bot, Send, Loader2, Sparkles, Trash2, PanelRightClose, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/utils/Utils';
import type { AssistantMessage, AssistantContext, ProposedAction } from '@/lib/services/aiAssistantService';
import type { AIAction, UserRole } from '@/lib/services/aiActionsService';
import { aiActionsService } from '@/lib/services/aiActionsService';
import ActionConfirmationForm from './ActionConfirmationForm';

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
  const [pendingAction, setPendingAction] = useState<AIAction | null>(null);
  const [isExecutingAction, setIsExecutingAction] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
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
        body: JSON.stringify({ context }),
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

  const sendMessage = async (content: string) => {
    if (!content.trim() || isLoading) return;

    const userMessage: AssistantMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: content.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/ai-assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: content,
          conversationHistory: messages,
          context,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('API Error:', response.status, errorData);
        throw new Error(errorData.error || 'Error en la respuesta');
      }

      const data = await response.json();

      const assistantMessage: AssistantMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: data.content,
        timestamp: new Date(),
        action: data.action,
      };

      setMessages(prev => [...prev, assistantMessage]);

      // Si hay una acción propuesta, crear el objeto AIAction para confirmación
      if (data.action) {
        const proposedAction = data.action as ProposedAction;
        const actionSchema = aiActionsService.getActionSchema(proposedAction.type);
        
        // Cargar opciones dinámicas (categorías, proveedores, clientes) via API
        let dynamicOptions = { categories: [], suppliers: [], customers: [] };
        if (context.organizationId && context.organizationId > 0) {
          console.log('Loading dynamic options for org:', context.organizationId);
          const optionsRes = await fetch('/api/ai-assistant/dynamic-options', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ organizationId: context.organizationId }),
          });
          if (optionsRes.ok) {
            dynamicOptions = await optionsRes.json();
            console.log('Dynamic options loaded:', dynamicOptions);
          } else {
            const errData = await optionsRes.json();
            console.error('Error loading dynamic options:', errData);
          }
        } else {
          console.warn('No organizationId available, skipping dynamic options');
        }
        
        // Combinar el esquema con los valores propuestos y opciones dinámicas
        const fieldsWithValues = actionSchema.map(field => {
          const proposedField = proposedAction.fields.find(f => f.name === field.name);
          let options = field.options;
          
          // Asignar opciones dinámicas según el campo
          if (field.name === 'category_id') {
            options = dynamicOptions.categories;
          } else if (field.name === 'supplier_id') {
            options = dynamicOptions.suppliers;
          } else if (field.name === 'customer_id') {
            options = dynamicOptions.customers;
          }
          
          return {
            ...field,
            value: proposedField?.value ?? field.value,
            options,
          };
        });

        const newAction: AIAction = {
          id: `action-${Date.now()}`,
          type: proposedAction.type,
          title: proposedAction.title,
          description: proposedAction.description,
          fields: fieldsWithValues,
          status: 'pending',
          createdAt: new Date(),
          organizationId: context.organizationId,
          userId: '',
          userRole: (context.userRole.toLowerCase().includes('admin') ? 'admin' : 'employee') as UserRole,
        };

        setPendingAction(newAction);
      }
    } catch (error) {
      console.error('Error sending message:', error);
      const errorMessage: AssistantMessage = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: 'Lo siento, hubo un error al procesar tu mensaje. Por favor, intenta de nuevo.',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  // Manejar confirmación de acción
  const handleConfirmAction = async (action: AIAction) => {
    setIsExecutingAction(true);
    
    try {
      const response = await fetch('/api/ai-assistant/execute-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });

      const result = await response.json();

      // Agregar mensaje con el resultado
      const resultMessage: AssistantMessage = {
        id: `result-${Date.now()}`,
        role: 'assistant',
        content: result.success 
          ? `✅ **Acción completada:** ${result.message}`
          : `❌ **Error:** ${result.message}`,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, resultMessage]);
      setPendingAction(null);
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

  // Manejar rechazo de acción
  const handleRejectAction = (action: AIAction) => {
    const rejectMessage: AssistantMessage = {
      id: `reject-${Date.now()}`,
      role: 'assistant',
      content: '🚫 Acción cancelada. ¿Hay algo más en lo que pueda ayudarte?',
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, rejectMessage]);
    setPendingAction(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(inputValue);
  };

  const handleSuggestionClick = (suggestion: string) => {
    sendMessage(suggestion);
  };

  const clearConversation = () => {
    setMessages([]);
    setPendingAction(null);
  };

  return (
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
      {/* Header - misma altura que el sidebar principal */}
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
            <PanelRightClose size={16} />
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
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex gap-3">
                <Avatar className="h-8 w-8 flex-shrink-0">
                  <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-500 text-white">
                    <Bot size={16} />
                  </AvatarFallback>
                </Avatar>
                <div className="bg-gray-100 dark:bg-gray-800 rounded-2xl rounded-tl-sm px-4 py-3">
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
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

      {/* Input Area */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex-shrink-0">
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <Input
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Escribe tu mensaje..."
            disabled={isLoading}
            className="flex-1"
          />
          <Button
            type="submit"
            size="icon"
            disabled={!inputValue.trim() || isLoading}
            className="bg-blue-600 hover:bg-blue-700 text-white h-10 w-10"
          >
            {isLoading ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <Send size={18} />
            )}
          </Button>
        </form>
        <p className="text-[10px] text-gray-400 text-center mt-2">
          GO Assistant puede cometer errores. Verifica la información importante.
        </p>
      </div>
    </div>
  );
}
