'use client';

import React from 'react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { Pin, Volume2, Check, CheckCheck, Flag } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Conversation } from '@/lib/services/conversationsService';

interface ConversationItemCompactProps {
  conversation: Conversation;
  isActive?: boolean;
  onClick: (conversation: Conversation) => void;
}

export default function ConversationItemCompact({ 
  conversation, 
  isActive = false,
  onClick 
}: ConversationItemCompactProps) {
  const customerName = conversation.customer?.full_name || 
                       `${conversation.customer?.first_name || ''} ${conversation.customer?.last_name || ''}`.trim() ||
                       'Cliente sin nombre';
  const customerInitials = customerName
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  // Determinar si el visitante está en línea basándose SOLO en last_seen_at
  // Un visitante se considera online si su last_seen_at es de los últimos 2 minutos
  const isCustomerOnline = () => {
    if (!conversation.customer?.last_seen_at) return false;
    const lastSeen = new Date(conversation.customer.last_seen_at);
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
    return lastSeen > twoMinutesAgo;
  };

  const getOnlineStatusColor = () => {
    return isCustomerOnline() ? 'bg-green-500' : 'bg-gray-400';
  };

  const lastMessageTime = formatDistanceToNow(new Date(conversation.last_message_at), {
    addSuffix: false,
    locale: es
  });

  const isUnread = conversation.unread_count > 0;
  const rawContent = conversation.last_message?.content || 'Sin mensajes';
  const lastMessageContent = rawContent
    .replace(/\[IMG:[^\]]+\]/g, '📷 Imagen')
    .replace(/\*\*([^*]+)\*\*/g, '$1');

  const getPriorityDotClass = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'bg-rose-500';
      case 'high': return 'bg-amber-500';
      case 'normal': return 'bg-sky-500';
      case 'low': return 'bg-slate-400';
      default: return 'bg-slate-400';
    }
  };

  const getPriorityLabel = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'Urgente';
      case 'high': return 'Alta';
      case 'normal': return 'Normal';
      case 'low': return 'Baja';
      default: return '';
    }
  };

  const getPriorityBorderClass = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'border-l-rose-500';
      case 'high': return 'border-l-amber-500';
      case 'normal': return 'border-l-sky-500';
      case 'low': return 'border-l-slate-400';
      default: return 'border-l-transparent';
    }
  };

  const hasPriority = conversation.priority && conversation.priority !== 'normal';

  return (
    <div
      onClick={() => onClick(conversation)}
      className={cn(
        'flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors border-b dark:border-gray-800 border-l-4',
        isActive 
          ? 'bg-blue-50 dark:bg-blue-950/30 border-l-blue-600' 
          : hasPriority
            ? cn('hover:bg-gray-50 dark:hover:bg-gray-800/50', getPriorityBorderClass(conversation.priority))
            : 'hover:bg-gray-50 dark:hover:bg-gray-800/50 border-l-transparent',
        isUnread && 'bg-blue-50/50 dark:bg-blue-950/10'
      )}
    >
      {/* Avatar con estado */}
      <div className="relative flex-shrink-0">
        <Avatar className="h-12 w-12">
          <AvatarFallback className="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 font-semibold">
            {customerInitials}
          </AvatarFallback>
        </Avatar>
        <div 
          className={cn(
            'absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white dark:border-gray-900',
            getOnlineStatusColor()
          )} 
        />
      </div>

      {/* Contenido */}
      <div className="flex-1 min-w-0">
        {/* Nombre y hora */}
        <div className="flex items-baseline justify-between gap-2 mb-1">
          <h3 className={cn(
            'text-[15px] truncate',
            isUnread 
              ? 'font-semibold text-gray-900 dark:text-white' 
              : 'font-medium text-gray-700 dark:text-gray-300'
          )}>
            {customerName}
          </h3>
          <span className={cn(
            'text-xs flex-shrink-0',
            isUnread 
              ? 'text-blue-600 dark:text-blue-400 font-semibold' 
              : 'text-gray-500 dark:text-gray-400'
          )}>
            {lastMessageTime}
          </span>
        </div>

        {/* Último mensaje y badges */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 flex-1 min-w-0">
            {/* Checks si es mensaje del agente */}
            {conversation.last_message?.role === 'agent' && (
              <span className="flex-shrink-0">
                {conversation.last_message?.is_read ? (
                  <CheckCheck className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                ) : (
                  <Check className="h-3.5 w-3.5 text-gray-400" />
                )}
              </span>
            )}
            
            <p className={cn(
              'text-sm truncate',
              isUnread 
                ? 'text-gray-900 dark:text-white font-medium' 
                : 'text-gray-500 dark:text-gray-400'
            )}>
              {lastMessageContent}
            </p>
          </div>

          {/* Contador de no leídos */}
          {isUnread && (
            <Badge 
              variant="default" 
              className="bg-blue-600 text-white text-xs h-5 min-w-[20px] flex items-center justify-center rounded-full px-1.5"
            >
              {conversation.unread_count}
            </Badge>
          )}

          {/* Indicador de prioridad */}
          {hasPriority && (
            <span className={cn(
              'inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0',
              conversation.priority === 'urgent' && 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300',
              conversation.priority === 'high' && 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300',
              conversation.priority === 'low' && 'bg-slate-100 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400'
            )}>
              <span className={cn('h-1.5 w-1.5 rounded-full', getPriorityDotClass(conversation.priority))} />
              {getPriorityLabel(conversation.priority)}
            </span>
          )}
        </div>

        {/* Etiquetas (mostrar máximo 2) */}
        {conversation.tags && conversation.tags.length > 0 && (
          <div className="flex items-center gap-1 mt-1">
            {conversation.tags.slice(0, 2).map((tag) => (
              <span
                key={tag.id}
                className="text-xs px-1.5 py-0.5 rounded"
                style={{
                  backgroundColor: `${tag.color}15`,
                  color: tag.color
                }}
              >
                {tag.name}
              </span>
            ))}
            {conversation.tags.length > 2 && (
              <span className="text-xs text-gray-400">
                +{conversation.tags.length - 2}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
