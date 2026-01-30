'use client';

import React from 'react';
import { 
  Globe, 
  MessageCircle, 
  Facebook, 
  Instagram, 
  Send, 
  Mail,
  CheckCircle2,
  Plus,
  ArrowRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChatChannel, ChannelType } from '@/lib/services/chatChannelsService';

interface AvailableChannelConfig {
  type: ChannelType;
  name: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  borderColor: string;
  available: boolean;
}

const AVAILABLE_CHANNELS: AvailableChannelConfig[] = [
  {
    type: 'website',
    name: 'Sitio Web',
    description: 'Widget de chat para tu sitio web',
    icon: <Globe className="h-6 w-6" />,
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    borderColor: 'border-blue-200 dark:border-blue-800',
    available: true
  },
  {
    type: 'whatsapp',
    name: 'WhatsApp',
    description: 'Conecta tu WhatsApp Business',
    icon: <MessageCircle className="h-6 w-6" />,
    color: 'text-green-600 dark:text-green-400',
    bgColor: 'bg-green-50 dark:bg-green-900/20',
    borderColor: 'border-green-200 dark:border-green-800',
    available: true
  },
  {
    type: 'facebook',
    name: 'Facebook Messenger',
    description: 'Mensajes de tu página de Facebook',
    icon: <Facebook className="h-6 w-6" />,
    color: 'text-blue-700 dark:text-blue-400',
    bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    borderColor: 'border-blue-200 dark:border-blue-800',
    available: true
  },
  {
    type: 'instagram',
    name: 'Instagram',
    description: 'Mensajes directos de Instagram',
    icon: <Instagram className="h-6 w-6" />,
    color: 'text-pink-600 dark:text-pink-400',
    bgColor: 'bg-pink-50 dark:bg-pink-900/20',
    borderColor: 'border-pink-200 dark:border-pink-800',
    available: true
  },
  {
    type: 'telegram',
    name: 'Telegram',
    description: 'Bot de Telegram para tu negocio',
    icon: <Send className="h-6 w-6" />,
    color: 'text-sky-600 dark:text-sky-400',
    bgColor: 'bg-sky-50 dark:bg-sky-900/20',
    borderColor: 'border-sky-200 dark:border-sky-800',
    available: false
  },
  {
    type: 'email',
    name: 'Email',
    description: 'Integración de correo electrónico',
    icon: <Mail className="h-6 w-6" />,
    color: 'text-orange-600 dark:text-orange-400',
    bgColor: 'bg-orange-50 dark:bg-orange-900/20',
    borderColor: 'border-orange-200 dark:border-orange-800',
    available: false
  }
];

interface AvailableChannelsProps {
  connectedChannels: ChatChannel[];
  onConnect: (type: ChannelType) => void;
}

export default function AvailableChannels({ 
  connectedChannels, 
  onConnect 
}: AvailableChannelsProps) {
  const getConnectedChannel = (type: ChannelType) => {
    return connectedChannels.find(ch => ch.type === type);
  };

  const getConnectionStatus = (type: ChannelType) => {
    const channel = getConnectedChannel(type);
    if (!channel) return 'not_connected';
    
    if (type === 'website') {
      return channel.public_key ? 'connected' : 'pending';
    }
    
    if (['whatsapp', 'facebook', 'instagram', 'telegram'].includes(type)) {
      return channel.credentials?.is_valid ? 'connected' : 'pending';
    }
    
    return channel.status === 'active' ? 'connected' : 'pending';
  };

  const getConnectedCount = (type: ChannelType) => {
    return connectedChannels.filter(ch => ch.type === type).length;
  };

  return (
    <div className="p-4">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Canales Disponibles
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Conecta tus canales de comunicación para centralizar todas las conversaciones
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {AVAILABLE_CHANNELS.map((channelConfig) => {
          const status = getConnectionStatus(channelConfig.type);
          const connectedCount = getConnectedCount(channelConfig.type);
          const isConnected = status === 'connected';
          const isPending = status === 'pending';

          return (
            <div
              key={channelConfig.type}
              className={`
                relative p-4 rounded-xl border-2 transition-all duration-200
                ${channelConfig.available 
                  ? `${channelConfig.bgColor} ${channelConfig.borderColor} hover:shadow-md cursor-pointer` 
                  : 'bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 opacity-60'
                }
              `}
              onClick={() => channelConfig.available && onConnect(channelConfig.type)}
            >
              {/* Status Badge */}
              {channelConfig.available && (
                <div className="absolute top-3 right-3">
                  {isConnected ? (
                    <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      Conectado {connectedCount > 1 ? `(${connectedCount})` : ''}
                    </Badge>
                  ) : isPending ? (
                    <Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
                      Pendiente
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-gray-500 dark:text-gray-400">
                      Disponible
                    </Badge>
                  )}
                </div>
              )}

              {!channelConfig.available && (
                <div className="absolute top-3 right-3">
                  <Badge variant="outline" className="text-gray-400 dark:text-gray-500">
                    Próximamente
                  </Badge>
                </div>
              )}

              {/* Icon */}
              <div className={`
                w-12 h-12 rounded-lg flex items-center justify-center mb-3
                ${channelConfig.available 
                  ? `bg-white dark:bg-gray-800 ${channelConfig.color}` 
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-400'
                }
              `}>
                {channelConfig.icon}
              </div>

              {/* Content */}
              <h4 className={`
                font-semibold mb-1
                ${channelConfig.available 
                  ? 'text-gray-900 dark:text-white' 
                  : 'text-gray-500 dark:text-gray-400'
                }
              `}>
                {channelConfig.name}
              </h4>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                {channelConfig.description}
              </p>

              {/* Action Button */}
              {channelConfig.available && (
                <Button
                  variant={isConnected ? "outline" : "default"}
                  size="sm"
                  className={`
                    w-full gap-2
                    ${isConnected 
                      ? 'border-gray-300 dark:border-gray-600' 
                      : 'bg-blue-600 hover:bg-blue-700 text-white'
                    }
                  `}
                  onClick={(e) => {
                    e.stopPropagation();
                    onConnect(channelConfig.type);
                  }}
                >
                  {isConnected ? (
                    <>
                      Configurar
                      <ArrowRight className="h-4 w-4" />
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4" />
                      Conectar
                    </>
                  )}
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
