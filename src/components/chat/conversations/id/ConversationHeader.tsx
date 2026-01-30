'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { 
  ArrowLeft, 
  MoreVertical, 
  Phone, 
  Video, 
  User,
  Clock,
  AlertCircle,
  CheckCircle2,
  Bot,
  Paperclip,
  History,
  Radio
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ConversationDetail } from '@/lib/services/conversationDetailService';

interface ConversationHeaderProps {
  conversation: ConversationDetail | null;
  onStatusChange: (status: string) => void;
  onPriorityChange: (priority: string) => void;
}

export default function ConversationHeader({
  conversation,
  onStatusChange,
  onPriorityChange
}: ConversationHeaderProps) {
  const router = useRouter();

  if (!conversation) {
    return (
      <div className="h-16 border-b dark:border-gray-700 flex items-center px-4">
        <div className="animate-pulse flex items-center gap-3 flex-1">
          <div className="h-10 w-10 bg-gray-200 dark:bg-gray-700 rounded-full" />
          <div className="h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded" />
        </div>
      </div>
    );
  }

  const customerName = conversation.customer?.full_name || 
                       `${conversation.customer?.first_name || ''} ${conversation.customer?.last_name || ''}`.trim() ||
                       'Cliente sin nombre';
  const customerInitials = customerName
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open':
        return 'bg-green-500';
      case 'pending':
        return 'bg-yellow-500';
      case 'closed':
        return 'bg-gray-500';
      default:
        return 'bg-gray-500';
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
        return 'bg-gray-100 text-gray-800';
    }
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

  const isAIEnabled = conversation.channel?.ai_mode === 'auto' || conversation.channel?.ai_mode === 'hybrid';

  return (
    <div className="h-16 border-b dark:border-gray-700 flex items-center px-4 bg-white dark:bg-gray-900">
      {/* Botón volver */}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => router.push('/app/chat/inbox')}
        className="mr-3"
      >
        <ArrowLeft className="h-5 w-5" />
      </Button>

      {/* Info del cliente */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="relative">
          <Avatar className="h-10 w-10">
            <AvatarFallback className="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
              {customerInitials}
            </AvatarFallback>
          </Avatar>
          <div className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white dark:border-gray-900 ${getStatusColor(conversation.status)}`} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-gray-900 dark:text-white truncate">
              {customerName}
            </h2>
            {/* Badge de canal */}
            <Badge variant="outline" className="text-xs">
              {conversation.channel?.name || conversation.channel?.type}
            </Badge>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <span>{conversation.customer?.email || conversation.customer?.phone}</span>
          </div>
        </div>
      </div>

      {/* Indicadores */}
      <TooltipProvider>
        <div className="flex items-center gap-2 mr-4">
          {/* Estado */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge className={`cursor-pointer ${
                conversation.status === 'open' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                conversation.status === 'pending' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' :
                'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400'
              }`}>
                {conversation.status === 'open' && <CheckCircle2 className="h-3 w-3 mr-1" />}
                {conversation.status === 'pending' && <Clock className="h-3 w-3 mr-1" />}
                {getStatusLabel(conversation.status)}
              </Badge>
            </TooltipTrigger>
            <TooltipContent>Estado de la conversación</TooltipContent>
          </Tooltip>

          {/* Prioridad */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge className={`cursor-pointer ${getPriorityColor(conversation.priority)}`}>
                <AlertCircle className="h-3 w-3 mr-1" />
                {getPriorityLabel(conversation.priority)}
              </Badge>
            </TooltipTrigger>
            <TooltipContent>Prioridad</TooltipContent>
          </Tooltip>

          {/* IA Activa */}
          {isAIEnabled && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-800">
                  <Bot className="h-3 w-3 mr-1" />
                  IA {conversation.channel?.ai_mode === 'auto' ? 'Auto' : 'Híbrido'}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>Asistente IA activo</TooltipContent>
            </Tooltip>
          )}

          {/* Asignación */}
          {conversation.assigned_member_id ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="bg-blue-50 dark:bg-blue-900/20">
                  <User className="h-3 w-3 mr-1" />
                  Asignado
                </Badge>
              </TooltipTrigger>
              <TooltipContent>Conversación asignada</TooltipContent>
            </Tooltip>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="text-orange-600 dark:text-orange-400">
                  <User className="h-3 w-3 mr-1" />
                  Sin asignar
                </Badge>
              </TooltipTrigger>
              <TooltipContent>Sin asignación</TooltipContent>
            </Tooltip>
          )}
        </div>
      </TooltipProvider>

      {/* Acciones rápidas */}
      <div className="flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-9 w-9"
              onClick={() => router.push(`/app/chat/conversations/${conversation.id}/files`)}
            >
              <Paperclip className="h-5 w-5 text-gray-600 dark:text-gray-400" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Ver archivos</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-9 w-9"
              onClick={() => router.push(`/app/chat/conversations/${conversation.id}/activity`)}
            >
              <History className="h-5 w-5 text-gray-600 dark:text-gray-400" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Ver actividad</TooltipContent>
        </Tooltip>
        <Button variant="ghost" size="icon" className="h-9 w-9">
          <Phone className="h-5 w-5 text-gray-600 dark:text-gray-400" />
        </Button>
        <Button variant="ghost" size="icon" className="h-9 w-9">
          <Video className="h-5 w-5 text-gray-600 dark:text-gray-400" />
        </Button>

        {/* Menú de acciones */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-9 w-9">
              <MoreVertical className="h-5 w-5 text-gray-600 dark:text-gray-400" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel>Estado</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => onStatusChange('open')}>
              <CheckCircle2 className="h-4 w-4 mr-2 text-green-500" />
              Abierta
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onStatusChange('pending')}>
              <Clock className="h-4 w-4 mr-2 text-yellow-500" />
              Pendiente
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onStatusChange('closed')}>
              <CheckCircle2 className="h-4 w-4 mr-2 text-gray-500" />
              Cerrada
            </DropdownMenuItem>

            <DropdownMenuSeparator />
            <DropdownMenuLabel>Prioridad</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => onPriorityChange('low')}>
              Baja
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onPriorityChange('normal')}>
              Normal
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onPriorityChange('high')}>
              Alta
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onPriorityChange('urgent')}>
              <AlertCircle className="h-4 w-4 mr-2 text-red-500" />
              Urgente
            </DropdownMenuItem>

            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push(`/app/chat/conversations/${conversation.id}/files`)}>
              <Paperclip className="h-4 w-4 mr-2" />
              Ver archivos
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push(`/app/chat/conversations/${conversation.id}/activity`)}>
              <History className="h-4 w-4 mr-2" />
              Ver actividad
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push('/app/chat/channels')}>
              <Radio className="h-4 w-4 mr-2" />
              Gestionar canales
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
