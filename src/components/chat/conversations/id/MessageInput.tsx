'use client';

import React, { useState, useRef } from 'react';
import { 
  Send, 
  Paperclip, 
  Smile, 
  Mic, 
  Image as ImageIcon,
  FileText,
  X,
  Loader2,
  Zap
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { QuickReply } from '@/lib/services/conversationDetailService';

interface MessageInputProps {
  onSendMessage: (content: string, contentType?: string) => Promise<void>;
  onAttachFile?: (file: File) => void;
  quickReplies?: QuickReply[];
  onSelectQuickReply?: (reply: QuickReply) => void;
  disabled?: boolean;
  placeholder?: string;
  suggestedResponse?: string;
  onClearSuggestion?: () => void;
}

export default function MessageInput({
  onSendMessage,
  onAttachFile,
  quickReplies = [],
  onSelectQuickReply,
  disabled = false,
  placeholder = 'Escribe un mensaje...',
  suggestedResponse,
  onClearSuggestion
}: MessageInputProps) {
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [quickReplySearch, setQuickReplySearch] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSend = async () => {
    const content = message.trim();
    if (!content || disabled || isSending) return;

    try {
      setIsSending(true);
      await onSendMessage(content);
      setMessage('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    } catch (error) {
      console.error('Error enviando mensaje:', error);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }

    // Atajo para respuestas rápidas: /
    if (e.key === '/' && message === '') {
      setShowQuickReplies(true);
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setMessage(value);

    // Buscar respuestas rápidas
    if (value.startsWith('/')) {
      setShowQuickReplies(true);
      setQuickReplySearch(value.slice(1));
    } else {
      setShowQuickReplies(false);
      setQuickReplySearch('');
    }

    // Auto-resize textarea
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`;
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onAttachFile) {
      onAttachFile(file);
    }
  };

  const handleQuickReplySelect = (reply: QuickReply) => {
    setMessage(reply.content);
    setShowQuickReplies(false);
    setQuickReplySearch('');
    textareaRef.current?.focus();
    if (onSelectQuickReply) {
      onSelectQuickReply(reply);
    }
  };

  const handleUseSuggestion = async () => {
    if (suggestedResponse) {
      try {
        setIsSending(true);
        await onSendMessage(suggestedResponse);
        if (onClearSuggestion) {
          onClearSuggestion();
        }
      } catch (error) {
        console.error('Error enviando sugerencia:', error);
      } finally {
        setIsSending(false);
      }
    }
  };

  const filteredQuickReplies = quickReplies.filter((reply) =>
    reply.title.toLowerCase().includes(quickReplySearch.toLowerCase()) ||
    reply.shortcut?.toLowerCase().includes(quickReplySearch.toLowerCase())
  );

  return (
    <div className="border-t dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
      {/* Sugerencia de IA */}
      {suggestedResponse && (
        <div className="mb-3 p-3 rounded-lg bg-purple-50 dark:bg-purple-900/10 border border-purple-200 dark:border-purple-800">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1 mb-1">
                <Zap className="h-3 w-3 text-purple-500" />
                <span className="text-xs font-medium text-purple-600 dark:text-purple-400">
                  Respuesta sugerida
                </span>
              </div>
              <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-2">
                {suggestedResponse}
              </p>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0"
                onClick={onClearSuggestion}
              >
                <X className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                onClick={handleUseSuggestion}
                disabled={isSending}
                className="h-7 bg-purple-600 hover:bg-purple-700"
              >
                {isSending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <>
                    <Send className="h-3 w-3 mr-1" />
                    Usar
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Input principal */}
      <div className="flex items-end gap-2">
        {/* Botón adjuntar */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 flex-shrink-0"
              disabled={disabled}
            >
              <Paperclip className="h-5 w-5 text-gray-500" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-2" align="start">
            <div className="space-y-1">
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start"
                onClick={() => fileInputRef.current?.click()}
              >
                <ImageIcon className="h-4 w-4 mr-2" />
                Imagen
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start"
                onClick={() => fileInputRef.current?.click()}
              >
                <FileText className="h-4 w-4 mr-2" />
                Documento
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileSelect}
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
        />

        {/* Textarea con popover de respuestas rápidas */}
        <div className="flex-1 relative">
          <Textarea
            ref={textareaRef}
            value={message}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder={disabled ? 'Conversación cerrada' : placeholder}
            disabled={disabled || isSending}
            className={cn(
              'min-h-[44px] max-h-[150px] resize-none rounded-2xl pr-12',
              'focus-visible:ring-1 focus-visible:ring-blue-500',
              'dark:bg-gray-800 dark:border-gray-700'
            )}
            rows={1}
          />

          {/* Botón emoji */}
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-2 bottom-2 h-7 w-7"
            disabled={disabled}
          >
            <Smile className="h-5 w-5 text-gray-500" />
          </Button>

          {/* Popover respuestas rápidas */}
          {showQuickReplies && filteredQuickReplies.length > 0 && (
            <div className="absolute bottom-full left-0 right-0 mb-2 bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 shadow-lg max-h-48 overflow-y-auto">
              {filteredQuickReplies.slice(0, 5).map((reply) => (
                <button
                  key={reply.id}
                  onClick={() => handleQuickReplySelect(reply)}
                  className="w-full p-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700 border-b dark:border-gray-700 last:border-b-0"
                >
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-yellow-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{reply.title}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {reply.content}
                      </p>
                    </div>
                    {reply.shortcut && (
                      <span className="text-xs text-gray-400">/{reply.shortcut}</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Botón enviar o micrófono */}
        {message.trim() ? (
          <Button
            onClick={handleSend}
            disabled={disabled || isSending}
            className="h-10 w-10 rounded-full bg-blue-600 hover:bg-blue-700 flex-shrink-0"
            size="icon"
          >
            {isSending ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 flex-shrink-0"
            disabled={disabled}
          >
            <Mic className="h-5 w-5 text-gray-500" />
          </Button>
        )}
      </div>

      {/* Hint */}
      <div className="flex items-center justify-between mt-2 text-xs text-gray-400 dark:text-gray-500">
        <span>Enter para enviar, Shift + Enter para nueva línea</span>
        <span>Escribe / para respuestas rápidas</span>
      </div>
    </div>
  );
}
