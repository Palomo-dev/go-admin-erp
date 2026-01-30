'use client';

import React, { useRef, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { Check, CheckCheck, Play, Pause, FileText, Download } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Message {
  id: string;
  content: string;
  content_type?: 'text' | 'image' | 'audio' | 'file';
  direction: 'inbound' | 'outbound';
  role: 'customer' | 'agent' | 'ai';
  created_at: string;
  is_read: boolean;
  sender_customer_id?: string;
  sender_member_id?: number;
  metadata?: {
    file_name?: string;
    file_type?: string;
    file_size?: number;
  };
}

interface MessageBubbleProps {
  message: Message;
  showAvatar?: boolean;
  senderName?: string;
}

export default function MessageBubble({ message, showAvatar = false, senderName }: MessageBubbleProps) {
  const isAgent = message.role === 'agent' || message.role === 'ai' || message.direction === 'outbound';
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioDuration, setAudioDuration] = useState(0);
  const [audioProgress, setAudioProgress] = useState(0);

  const toggleAudio = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleAudioTimeUpdate = () => {
    if (audioRef.current) {
      setAudioProgress((audioRef.current.currentTime / audioRef.current.duration) * 100);
    }
  };

  const handleAudioLoadedMetadata = () => {
    if (audioRef.current) {
      setAudioDuration(audioRef.current.duration);
    }
  };

  const handleAudioEnded = () => {
    setIsPlaying(false);
    setAudioProgress(0);
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const renderContent = () => {
    const contentType = message.content_type || 'text';

    switch (contentType) {
      case 'image':
        return (
          <div className="max-w-xs">
            <img
              src={message.content}
              alt={message.metadata?.file_name || 'Imagen'}
              className="rounded-lg max-w-full h-auto cursor-pointer hover:opacity-90"
              onClick={() => window.open(message.content, '_blank')}
            />
            {message.metadata?.file_name && (
              <p className="text-xs mt-1 opacity-75">{message.metadata.file_name}</p>
            )}
          </div>
        );

      case 'audio':
        return (
          <div className="flex items-center gap-3 min-w-[200px]">
            <audio
              ref={audioRef}
              src={message.content}
              onTimeUpdate={handleAudioTimeUpdate}
              onLoadedMetadata={handleAudioLoadedMetadata}
              onEnded={handleAudioEnded}
              preload="metadata"
            />
            <button
              onClick={toggleAudio}
              className={cn(
                'h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0',
                isAgent ? 'bg-blue-500 hover:bg-blue-400' : 'bg-gray-300 hover:bg-gray-400'
              )}
            >
              {isPlaying ? (
                <Pause className="h-5 w-5 text-white" />
              ) : (
                <Play className="h-5 w-5 text-white ml-0.5" />
              )}
            </button>
            <div className="flex-1">
              <div className={cn(
                'h-1 rounded-full overflow-hidden',
                isAgent ? 'bg-blue-400' : 'bg-gray-400'
              )}>
                <div
                  className={cn(
                    'h-full transition-all',
                    isAgent ? 'bg-white' : 'bg-gray-600'
                  )}
                  style={{ width: `${audioProgress}%` }}
                />
              </div>
              <p className="text-xs mt-1 opacity-75">
                {formatDuration(audioDuration || 0)}
              </p>
            </div>
          </div>
        );

      case 'file':
        return (
          <a
            href={message.content}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 hover:opacity-80"
          >
            <div className={cn(
              'h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0',
              isAgent ? 'bg-blue-500' : 'bg-gray-300'
            )}>
              <FileText className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {message.metadata?.file_name || 'Archivo'}
              </p>
              {message.metadata?.file_size && (
                <p className="text-xs opacity-75">
                  {(message.metadata.file_size / 1024).toFixed(1)} KB
                </p>
              )}
            </div>
            <Download className="h-4 w-4 opacity-75" />
          </a>
        );

      default:
        return (
          <p className="text-[15px] leading-relaxed whitespace-pre-wrap break-words">
            {message.content}
          </p>
        );
    }
  };

  return (
    <div
      className={cn(
        'flex items-end gap-2 mb-2 group',
        isAgent ? 'justify-end' : 'justify-start'
      )}
    >
      {/* Avatar izquierdo (cliente) */}
      {!isAgent && showAvatar && (
        <div className="w-8 h-8 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center text-xs font-semibold text-white flex-shrink-0">
          {senderName?.[0]?.toUpperCase() || 'C'}
        </div>
      )}

      {/* Burbuja de mensaje */}
      <div
        className={cn(
          'max-w-[70%] sm:max-w-[60%] rounded-2xl px-4 py-2 shadow-sm',
          isAgent
            ? 'bg-blue-600 text-white rounded-br-sm'
            : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white rounded-bl-sm'
        )}
      >
        {/* Nombre del remitente (opcional) */}
        {showAvatar && senderName && (
          <p
            className={cn(
              'text-xs font-semibold mb-1',
              isAgent ? 'text-blue-100' : 'text-blue-600 dark:text-blue-400'
            )}
          >
            {senderName}
          </p>
        )}

        {/* Contenido del mensaje */}
        {renderContent()}

        {/* Timestamp y estado */}
        <div
          className={cn(
            'flex items-center justify-end gap-1 mt-1 text-[11px]',
            isAgent ? 'text-blue-100' : 'text-gray-500 dark:text-gray-400'
          )}
        >
          <span>
            {new Date(message.created_at).toLocaleTimeString('es-ES', {
              hour: '2-digit',
              minute: '2-digit'
            })}
          </span>
          {/* Checks de lectura (solo mensajes del agente) */}
          {isAgent && (
            <span className="ml-1">
              {message.is_read ? (
                <CheckCheck className="h-3 w-3" />
              ) : (
                <Check className="h-3 w-3" />
              )}
            </span>
          )}
        </div>
      </div>

      {/* Avatar derecho (agente) */}
      {isAgent && showAvatar && (
        <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-xs font-semibold text-white flex-shrink-0">
          {senderName?.[0]?.toUpperCase() || 'A'}
        </div>
      )}
    </div>
  );
}
