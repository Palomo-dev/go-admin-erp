'use client';

import React, { useState } from 'react';
import {
  Globe,
  MessageCircle,
  Facebook,
  Instagram,
  Send,
  Mail,
  MoreVertical,
  Settings,
  Code,
  Power,
  PowerOff,
  Bot,
  CheckCircle,
  XCircle,
  Loader2,
  Link as LinkIcon
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ChatChannel, ChannelType, AIMode } from '@/lib/services/chatChannelsService';
import { formatDate } from '@/utils/Utils';

interface ChannelCardProps {
  channel: ChatChannel;
  onToggleStatus: (channel: ChatChannel) => Promise<void>;
  onChangeAIMode: (channel: ChatChannel, mode: AIMode) => Promise<void>;
  onConfigure: (channel: ChatChannel) => void;
  onInstallWidget: (channel: ChatChannel) => void;
  onConnect: (channel: ChatChannel) => void;
}

export default function ChannelCard({
  channel,
  onToggleStatus,
  onChangeAIMode,
  onConfigure,
  onInstallWidget,
  onConnect
}: ChannelCardProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [isChangingAI, setIsChangingAI] = useState(false);

  const getIcon = (type: ChannelType) => {
    const icons: Record<ChannelType, React.ReactNode> = {
      website: <Globe className="h-6 w-6" />,
      whatsapp: <MessageCircle className="h-6 w-6" />,
      facebook: <Facebook className="h-6 w-6" />,
      instagram: <Instagram className="h-6 w-6" />,
      telegram: <Send className="h-6 w-6" />,
      email: <Mail className="h-6 w-6" />
    };
    return icons[type] || <MessageCircle className="h-6 w-6" />;
  };

  const getTypeLabel = (type: ChannelType): string => {
    const labels: Record<ChannelType, string> = {
      website: 'Sitio Web',
      whatsapp: 'WhatsApp',
      facebook: 'Facebook Messenger',
      instagram: 'Instagram',
      telegram: 'Telegram',
      email: 'Email'
    };
    return labels[type] || type;
  };

  const getTypeColor = (type: ChannelType): string => {
    const colors: Record<ChannelType, string> = {
      website: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
      whatsapp: 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400',
      facebook: 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400',
      instagram: 'bg-pink-100 text-pink-600 dark:bg-pink-900/30 dark:text-pink-400',
      telegram: 'bg-cyan-100 text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-400',
      email: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
    };
    return colors[type] || 'bg-gray-100 text-gray-600';
  };

  const getAIModeLabel = (mode: AIMode): string => {
    const labels: Record<AIMode, string> = {
      off: 'Desactivado',
      hybrid: 'Híbrido',
      auto: 'Automático'
    };
    return labels[mode] || mode;
  };

  const isConnected = (): boolean => {
    if (channel.type === 'website') {
      return !!channel.public_key;
    }
    return channel.credentials?.is_valid === true;
  };

  const handleToggleStatus = async () => {
    try {
      setIsUpdating(true);
      await onToggleStatus(channel);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleAIModeChange = async (value: string) => {
    try {
      setIsChangingAI(true);
      await onChangeAIMode(channel, value as AIMode);
    } finally {
      setIsChangingAI(false);
    }
  };

  return (
    <Card className="hover:shadow-md transition-shadow dark:bg-gray-800 dark:border-gray-700">
      <CardContent className="p-4">
        <div className="flex gap-4">
          {/* Icon */}
          <div className={`flex-shrink-0 w-14 h-14 rounded-xl flex items-center justify-center ${getTypeColor(channel.type)}`}>
            {getIcon(channel.type)}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold text-gray-900 dark:text-white">
                    {channel.name}
                  </h3>
                  <Badge variant="outline" className="text-xs">
                    {getTypeLabel(channel.type)}
                  </Badge>
                </div>
                
                <div className="flex items-center gap-3 mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {/* Status */}
                  <div className="flex items-center gap-1">
                    {channel.status === 'active' ? (
                      <>
                        <CheckCircle className="h-3 w-3 text-green-500" />
                        <span className="text-green-600 dark:text-green-400">Activo</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="h-3 w-3 text-gray-400" />
                        <span>Inactivo</span>
                      </>
                    )}
                  </div>
                  
                  <span>•</span>
                  
                  {/* Connected */}
                  <div className="flex items-center gap-1">
                    {isConnected() ? (
                      <>
                        <LinkIcon className="h-3 w-3 text-blue-500" />
                        <span className="text-blue-600 dark:text-blue-400">Conectado</span>
                      </>
                    ) : (
                      <>
                        <LinkIcon className="h-3 w-3 text-orange-400" />
                        <span className="text-orange-600 dark:text-orange-400">Sin conectar</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Toggle & Actions */}
              <div className="flex items-center gap-2">
                <Switch
                  checked={channel.status === 'active'}
                  onCheckedChange={handleToggleStatus}
                  disabled={isUpdating}
                />
                
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Acciones</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => onConfigure(channel)}>
                      <Settings className="h-4 w-4 mr-2" />
                      Configurar
                    </DropdownMenuItem>
                    {channel.type === 'website' && (
                      <DropdownMenuItem onClick={() => onInstallWidget(channel)}>
                        <Code className="h-4 w-4 mr-2" />
                        Instalar Widget
                      </DropdownMenuItem>
                    )}
                    {['whatsapp', 'facebook', 'instagram'].includes(channel.type) && (
                      <DropdownMenuItem onClick={() => onConnect(channel)}>
                        <LinkIcon className="h-4 w-4 mr-2" />
                        {isConnected() ? 'Reconectar' : 'Conectar'}
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem 
                      onClick={handleToggleStatus}
                      disabled={isUpdating}
                    >
                      {channel.status === 'active' ? (
                        <>
                          <PowerOff className="h-4 w-4 mr-2 text-red-500" />
                          Desactivar
                        </>
                      ) : (
                        <>
                          <Power className="h-4 w-4 mr-2 text-green-500" />
                          Activar
                        </>
                      )}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* AI Mode selector */}
            <div className="mt-3 flex items-center gap-3">
              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                <Bot className="h-4 w-4" />
                <span>Modo IA:</span>
              </div>
              <Select 
                value={channel.ai_mode} 
                onValueChange={handleAIModeChange}
                disabled={isChangingAI}
              >
                <SelectTrigger className="w-36 h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="off">Desactivado</SelectItem>
                  <SelectItem value="hybrid">Híbrido</SelectItem>
                  <SelectItem value="auto">Automático</SelectItem>
                </SelectContent>
              </Select>
              {isChangingAI && <Loader2 className="h-4 w-4 animate-spin" />}
            </div>

            {/* Footer */}
            <div className="mt-3 text-xs text-gray-400 dark:text-gray-500">
              Creado {formatDate(channel.created_at)}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
