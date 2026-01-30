'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Send, Paperclip, Smile, Mic, MicOff, X, Zap, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase/config';

interface QuickReply {
  id: string;
  title: string;
  content: string;
  shortcut: string;
}

const EMOJI_LIST = [
  '😀', '😃', '😄', '😁', '😅', '😂', '🤣', '😊', '😇', '🙂',
  '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛',
  '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐', '🤨',
  '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '🤥', '😌', '😔',
  '😪', '🤤', '😴', '😷', '🤒', '🤕', '🤢', '🤮', '🤧', '🥵',
  '👍', '👎', '👌', '✌️', '🤞', '🤟', '🤘', '🤙', '👋', '🙏',
  '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '💯', '✅',
  '⭐', '🌟', '💫', '🎉', '🎊', '🔥', '💪', '👀', '📦', '🚚'
];

interface ChatInputProps {
  onSendMessage: (content: string, type?: 'text' | 'audio' | 'file', file?: File) => void;
  disabled?: boolean;
  placeholder?: string;
  organizationId?: number;
}

export default function ChatInput({ 
  onSendMessage, 
  disabled = false,
  placeholder = 'Escribe un mensaje...',
  organizationId
}: ChatInputProps) {
  const [message, setMessage] = useState('');
  const [showEmojis, setShowEmojis] = useState(false);
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
  const [filteredReplies, setFilteredReplies] = useState<QuickReply[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Cargar respuestas rápidas
  useEffect(() => {
    if (organizationId) {
      loadQuickReplies();
    }
  }, [organizationId]);

  const loadQuickReplies = async () => {
    if (!organizationId) return;
    const { data } = await supabase
      .from('quick_replies')
      .select('id, title, content, shortcut')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .order('usage_count', { ascending: false });
    if (data) {
      setQuickReplies(data);
      setFilteredReplies(data);
    }
  };

  // Detectar / para respuestas rápidas
  useEffect(() => {
    if (message.startsWith('/')) {
      const search = message.slice(1).toLowerCase();
      const filtered = quickReplies.filter(qr => 
        qr.title.toLowerCase().includes(search) || 
        qr.shortcut.toLowerCase().includes(search)
      );
      setFilteredReplies(filtered);
      setShowQuickReplies(true);
    } else {
      setShowQuickReplies(false);
    }
  }, [message, quickReplies]);

  const handleSend = () => {
    if (message.trim() && !disabled) {
      onSendMessage(message.trim());
      setMessage('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);
    
    // Auto-resize textarea
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`;
    }
  };

  const handleEmojiSelect = (emoji: string) => {
    setMessage(prev => prev + emoji);
    setShowEmojis(false);
    textareaRef.current?.focus();
  };

  const handleQuickReplySelect = (qr: QuickReply) => {
    setMessage(qr.content);
    setShowQuickReplies(false);
    // Incrementar uso
    supabase
      .from('quick_replies')
      .update({ usage_count: (qr as any).usage_count + 1 || 1 })
      .eq('id', qr.id)
      .then();
  };

  const handleFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onSendMessage(file.name, 'file', file);
      e.target.value = '';
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const audioFile = new File([audioBlob], `audio_${Date.now()}.webm`, { type: 'audio/webm' });
        onSendMessage('Mensaje de voz', 'audio', audioFile);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      
      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (error) {
      console.error('Error accessing microphone:', error);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
      }
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      audioChunksRef.current = [];
      setIsRecording(false);
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
      }
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // UI de grabación
  if (isRecording) {
    return (
      <div className="border-t dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
        <div className="flex items-center justify-between gap-4 bg-red-50 dark:bg-red-900/20 rounded-2xl p-4">
          <div className="flex items-center gap-3">
            <div className="h-3 w-3 bg-red-500 rounded-full animate-pulse" />
            <span className="text-red-600 dark:text-red-400 font-medium">
              Grabando... {formatTime(recordingTime)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={cancelRecording}
              className="h-10 w-10 text-gray-500 hover:text-red-600"
            >
              <X className="h-5 w-5" />
            </Button>
            <Button
              onClick={stopRecording}
              className="h-10 w-10 rounded-full bg-red-600 hover:bg-red-700"
              size="icon"
            >
              <Square className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="border-t dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
      {/* Respuestas rápidas popup */}
      {showQuickReplies && filteredReplies.length > 0 && (
        <div className="mb-2 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {filteredReplies.map((qr) => (
            <button
              key={qr.id}
              onClick={() => handleQuickReplySelect(qr)}
              className="w-full px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 border-b dark:border-gray-700 last:border-b-0"
            >
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-yellow-500" />
                <span className="font-medium text-sm text-gray-900 dark:text-white">{qr.title}</span>
                <span className="text-xs text-gray-400">/{qr.shortcut}</span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-1">
                {qr.content}
              </p>
            </button>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        {/* Input oculto para archivos */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          className="hidden"
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
        />

        {/* Botones izquierdos */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            disabled={disabled}
            onClick={handleFileSelect}
            title="Adjuntar archivo"
          >
            <Paperclip className="h-5 w-5" />
          </Button>
          
          {/* Respuestas rápidas */}
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-gray-500 hover:text-yellow-600 dark:text-gray-400 dark:hover:text-yellow-400"
            disabled={disabled}
            onClick={() => setMessage('/')}
            title="Respuestas rápidas (escribe /)"
          >
            <Zap className="h-5 w-5" />
          </Button>
        </div>

        {/* Input de texto */}
        <div className="flex-1 relative">
          <Textarea
            ref={textareaRef}
            value={message}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            className={cn(
              'min-h-[44px] max-h-[150px] resize-none rounded-2xl pr-12',
              'focus-visible:ring-1 focus-visible:ring-blue-500',
              'dark:bg-gray-800 dark:border-gray-700'
            )}
            rows={1}
          />
          
          {/* Emoji picker */}
          <Popover open={showEmojis} onOpenChange={setShowEmojis}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-2 bottom-2 h-7 w-7 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                disabled={disabled}
              >
                <Smile className="h-5 w-5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-2" align="end">
              <div className="grid grid-cols-10 gap-1">
                {EMOJI_LIST.map((emoji, i) => (
                  <button
                    key={i}
                    onClick={() => handleEmojiSelect(emoji)}
                    className="h-8 w-8 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-lg"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Botón de enviar o micrófono */}
        {message.trim() ? (
          <Button
            onClick={handleSend}
            disabled={disabled}
            className="h-11 w-11 rounded-full bg-blue-600 hover:bg-blue-700 flex-shrink-0"
            size="icon"
          >
            <Send className="h-5 w-5" />
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            className="h-11 w-11 text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 flex-shrink-0"
            disabled={disabled}
            onClick={startRecording}
            title="Grabar audio"
          >
            <Mic className="h-5 w-5" />
          </Button>
        )}
      </div>

      {/* Hint */}
      <p className="text-xs text-gray-400 dark:text-gray-500 mt-2 text-center">
        Presiona Enter para enviar, Shift + Enter para nueva línea
      </p>
    </div>
  );
}
