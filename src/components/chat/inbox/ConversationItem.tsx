'use client';

import React from 'react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  MessageSquare,
  Mail,
  Phone,
  AlertCircle,
  Clock,
  User,
  Hash
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Conversation } from '@/lib/services/conversationsService';

interface ConversationItemProps {
  conversation: Conversation;
  onClick: (conversation: Conversation) => void;
}

export default function ConversationItem({ conversation, onClick }: ConversationItemProps) {
  const getChannelIcon = (type: string) => {
    switch (type) {
      case 'whatsapp':
        return MessageSquare;
      case 'email':
        return Mail;
      case 'phone':
        return Phone;
      default:
        return MessageSquare;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open':
        return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
      case 'closed':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
      case 'high':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400';
      case 'normal':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
      case 'low':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400';
    }
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      open: 'Abierta',
      pending: 'Pendiente',
      closed: 'Cerrada'
    };
    return labels[status] || status;
  };

  const getPriorityLabel = (priority: string) => {
    const labels: Record<string, string> = {
      urgent: 'Urgente',
      high: 'Alta',
      normal: 'Normal',
      low: 'Baja'
    };
    return labels[priority] || priority;
  };

  const ChannelIcon = getChannelIcon(conversation.channel?.type || 'message');
  const customerName = conversation.customer?.full_name || 
                       `${conversation.customer?.first_name || ''} ${conversation.customer?.last_name || ''}`.trim() ||
                       'Cliente sin nombre';
  const customerInitials = customerName
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <Card
      className="p-4 cursor-pointer hover:shadow-md transition-shadow border-l-4 hover:border-l-blue-500"
      onClick={() => onClick(conversation)}
      style={{
        borderLeftColor: conversation.unread_count > 0 ? '#3b82f6' : 'transparent'
      }}
    >
      <div className="flex items-start space-x-3">
        {/* Avatar */}
        <Avatar className="h-10 w-10">
          <AvatarFallback className="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
            {customerInitials}
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0">
          {/* Header: Nombre y timestamp */}
          <div className="flex items-start justify-between mb-1">
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                {customerName}
              </h3>
              <div className="flex items-center space-x-2 text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {conversation.customer?.email && (
                  <span className="flex items-center">
                    <Mail className="h-3 w-3 mr-1" />
                    {conversation.customer.email}
                  </span>
                )}
                {conversation.customer?.phone && (
                  <span className="flex items-center">
                    <Phone className="h-3 w-3 mr-1" />
                    {conversation.customer.phone}
                  </span>
                )}
              </div>
            </div>
            <div className="flex flex-col items-end ml-2 space-y-1">
              <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                {formatDistanceToNow(new Date(conversation.last_message_at), {
                  addSuffix: true,
                  locale: es
                })}
              </span>
              {conversation.unread_count > 0 && (
                <Badge variant="default" className="bg-blue-600 text-white text-xs px-1.5 py-0">
                  {conversation.unread_count}
                </Badge>
              )}
            </div>
          </div>

          {/* Último mensaje */}
          {conversation.last_message && (
            <p className="text-sm text-gray-600 dark:text-gray-300 truncate mb-2">
              {conversation.last_message.content}
            </p>
          )}

          {/* Badges y metadata */}
          <div className="flex flex-wrap gap-1.5 items-center">
            {/* Canal */}
            <Badge variant="outline" className="text-xs">
              <ChannelIcon className="h-3 w-3 mr-1" />
              {conversation.channel?.name || 'Canal'}
            </Badge>

            {/* Estado */}
            <Badge className={`text-xs ${getStatusColor(conversation.status)}`}>
              {getStatusLabel(conversation.status)}
            </Badge>

            {/* Prioridad */}
            <Badge className={`text-xs ${getPriorityColor(conversation.priority)}`}>
              <AlertCircle className="h-3 w-3 mr-1" />
              {getPriorityLabel(conversation.priority)}
            </Badge>

            {/* Asignado */}
            {conversation.assigned_member_id ? (
              <Badge variant="outline" className="text-xs">
                <User className="h-3 w-3 mr-1" />
                Asignado
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs text-orange-600 dark:text-orange-400">
                <User className="h-3 w-3 mr-1" />
                Sin asignar
              </Badge>
            )}

            {/* Sin responder */}
            {!conversation.last_agent_message_at && conversation.status !== 'closed' && (
              <Badge variant="outline" className="text-xs text-red-600 dark:text-red-400">
                <Clock className="h-3 w-3 mr-1" />
                Sin responder
              </Badge>
            )}

            {/* Etiquetas */}
            {conversation.tags?.map((tag) => (
              <Badge
                key={tag.id}
                variant="outline"
                className="text-xs"
                style={{
                  borderColor: tag.color,
                  color: tag.color
                }}
              >
                <Hash className="h-3 w-3 mr-1" />
                {tag.name}
              </Badge>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}
