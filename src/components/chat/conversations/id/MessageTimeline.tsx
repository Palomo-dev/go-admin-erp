'use client';

import React, { useRef, useEffect } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { 
  Check, 
  CheckCheck, 
  Clock, 
  AlertCircle, 
  Bot, 
  User, 
  Headphones,
  Settings,
  FileText,
  Image as ImageIcon,
  Video,
  Mic,
  MapPin,
  Download
} from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Message, MessageAttachment, MessageEvent } from '@/lib/services/conversationDetailService';

interface MessageTimelineProps {
  messages: Message[];
  customerName?: string;
  loading?: boolean;
}

export default function MessageTimeline({ messages, customerName = 'Cliente', loading }: MessageTimelineProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'customer':
        return User;
      case 'agent':
        return Headphones;
      case 'ai':
        return Bot;
      case 'system':
        return Settings;
      default:
        return User;
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'customer':
        return 'bg-gray-100 dark:bg-gray-800';
      case 'agent':
        return 'bg-blue-600 text-white';
      case 'ai':
        return 'bg-purple-600 text-white';
      case 'system':
        return 'bg-gray-500 text-white';
      default:
        return 'bg-gray-100 dark:bg-gray-800';
    }
  };

  const getEventIcon = (eventType: string) => {
    switch (eventType) {
      case 'delivered':
        return <CheckCheck className="h-3 w-3 text-blue-500" />;
      case 'read':
        return <CheckCheck className="h-3 w-3 text-green-500" />;
      case 'failed':
        return <AlertCircle className="h-3 w-3 text-red-500" />;
      default:
        return <Check className="h-3 w-3 text-gray-400" />;
    }
  };

  const getContentTypeIcon = (contentType: string) => {
    switch (contentType) {
      case 'image':
        return <ImageIcon className="h-4 w-4" />;
      case 'video':
        return <Video className="h-4 w-4" />;
      case 'audio':
        return <Mic className="h-4 w-4" />;
      case 'document':
        return <FileText className="h-4 w-4" />;
      case 'location':
        return <MapPin className="h-4 w-4" />;
      default:
        return null;
    }
  };

  const renderAttachment = (attachment: MessageAttachment) => {
    const isImage = attachment.mime_type.startsWith('image/');
    const isVideo = attachment.mime_type.startsWith('video/');
    const isAudio = attachment.mime_type.startsWith('audio/');

    if (isImage) {
      return (
        <div className="mt-2 max-w-xs">
          <img
            src={`/api/storage/${attachment.storage_bucket}/${attachment.storage_path}`}
            alt={attachment.file_name}
            className="rounded-lg max-h-48 object-cover"
          />
        </div>
      );
    }

    if (isVideo) {
      return (
        <div className="mt-2 max-w-xs">
          <video
            src={`/api/storage/${attachment.storage_bucket}/${attachment.storage_path}`}
            controls
            className="rounded-lg max-h-48"
          />
        </div>
      );
    }

    if (isAudio) {
      return (
        <div className="mt-2">
          <audio
            src={`/api/storage/${attachment.storage_bucket}/${attachment.storage_path}`}
            controls
            className="w-full max-w-xs"
          />
        </div>
      );
    }

    return (
      <div className="mt-2 flex items-center gap-2 p-2 bg-gray-100 dark:bg-gray-700 rounded-lg">
        <FileText className="h-5 w-5 text-gray-500" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{attachment.file_name}</p>
          <p className="text-xs text-gray-500">
            {(attachment.size_bytes / 1024).toFixed(1)} KB
          </p>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <Download className="h-4 w-4" />
        </Button>
      </div>
    );
  };

  const renderMessageEvents = (events: MessageEvent[]) => {
    if (!events || events.length === 0) return null;
    
    const latestEvent = events[events.length - 1];
    return (
      <div className="flex items-center gap-1 mt-1">
        {getEventIcon(latestEvent.event_type)}
        <span className="text-xs text-gray-500 capitalize">
          {latestEvent.event_type === 'delivered' ? 'Entregado' :
           latestEvent.event_type === 'read' ? 'Leído' :
           latestEvent.event_type === 'failed' ? 'Fallido' : latestEvent.event_type}
        </span>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <Clock className="h-12 w-12 text-gray-300 dark:text-gray-600 mb-4" />
        <p className="text-gray-500 dark:text-gray-400">
          No hay mensajes en esta conversación
        </p>
      </div>
    );
  }

  let currentDate = '';

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {messages.map((message, index) => {
        const messageDate = new Date(message.created_at).toLocaleDateString('es-ES', {
          day: 'numeric',
          month: 'long',
          year: 'numeric'
        });
        const showDateSeparator = messageDate !== currentDate;
        currentDate = messageDate;

        const isOutbound = message.direction === 'outbound';
        const RoleIcon = getRoleIcon(message.role);
        const senderName = message.role === 'customer' ? customerName :
                          message.role === 'agent' ? 'Agente' :
                          message.role === 'ai' ? 'Asistente IA' : 'Sistema';

        return (
          <React.Fragment key={message.id}>
            {showDateSeparator && (
              <div className="flex items-center justify-center my-4">
                <div className="bg-gray-200 dark:bg-gray-700 px-3 py-1 rounded-full">
                  <span className="text-xs text-gray-600 dark:text-gray-300">
                    {messageDate}
                  </span>
                </div>
              </div>
            )}

            <div className={cn(
              'flex items-end gap-2',
              isOutbound ? 'justify-end' : 'justify-start'
            )}>
              {!isOutbound && (
                <Avatar className="h-8 w-8 flex-shrink-0">
                  <AvatarFallback className="bg-gray-200 dark:bg-gray-700">
                    <RoleIcon className="h-4 w-4 text-gray-600 dark:text-gray-300" />
                  </AvatarFallback>
                </Avatar>
              )}

              <div className={cn(
                'max-w-[70%] sm:max-w-[60%]',
                isOutbound ? 'items-end' : 'items-start'
              )}>
                {/* Nombre del remitente */}
                <div className={cn(
                  'flex items-center gap-2 mb-1',
                  isOutbound ? 'justify-end' : 'justify-start'
                )}>
                  <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                    {senderName}
                  </span>
                  {message.role === 'ai' && (
                    <Badge variant="outline" className="text-[10px] h-4 px-1 bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400">
                      IA
                    </Badge>
                  )}
                  {message.role === 'system' && (
                    <Badge variant="outline" className="text-[10px] h-4 px-1 bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                      Sistema
                    </Badge>
                  )}
                </div>

                {/* Burbuja de mensaje */}
                <div className={cn(
                  'rounded-2xl px-4 py-2 shadow-sm',
                  isOutbound
                    ? 'bg-blue-600 text-white rounded-br-sm'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white rounded-bl-sm',
                  message.role === 'ai' && 'bg-purple-600 text-white',
                  message.role === 'system' && 'bg-gray-500 text-white text-center italic'
                )}>
                  {/* Indicador de tipo de contenido */}
                  {message.content_type !== 'text' && (
                    <div className="flex items-center gap-1 mb-1 opacity-75">
                      {getContentTypeIcon(message.content_type)}
                      <span className="text-xs capitalize">{message.content_type}</span>
                    </div>
                  )}

                  {/* Contenido del mensaje */}
                  <p className="text-[15px] leading-relaxed whitespace-pre-wrap break-words">
                    {message.content}
                  </p>

                  {/* Adjuntos */}
                  {message.attachments && message.attachments.length > 0 && (
                    <div className="mt-2 space-y-2">
                      {message.attachments.map((attachment) => (
                        <div key={attachment.id}>
                          {renderAttachment(attachment)}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Timestamp */}
                  <div className={cn(
                    'flex items-center justify-end gap-1 mt-1 text-[11px]',
                    isOutbound || message.role === 'ai' || message.role === 'system'
                      ? 'text-white/70'
                      : 'text-gray-500 dark:text-gray-400'
                  )}>
                    <span>
                      {new Date(message.created_at).toLocaleTimeString('es-ES', {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                    {isOutbound && message.is_read ? (
                      <CheckCheck className="h-3 w-3" />
                    ) : isOutbound ? (
                      <Check className="h-3 w-3" />
                    ) : null}
                  </div>
                </div>

                {/* Eventos del mensaje */}
                {isOutbound && renderMessageEvents(message.events || [])}
              </div>

              {isOutbound && (
                <Avatar className="h-8 w-8 flex-shrink-0">
                  <AvatarFallback className={cn(
                    message.role === 'ai' ? 'bg-purple-600' : 'bg-blue-600',
                    'text-white'
                  )}>
                    <RoleIcon className="h-4 w-4" />
                  </AvatarFallback>
                </Avatar>
              )}
            </div>
          </React.Fragment>
        );
      })}
      <div ref={messagesEndRef} />
    </div>
  );
}
