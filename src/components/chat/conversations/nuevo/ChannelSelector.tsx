'use client';

import React from 'react';
import { Globe, MessageSquare, Mail, Phone } from 'lucide-react';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Channel } from '@/lib/services/newConversationService';

interface ChannelSelectorProps {
  channels: Channel[];
  selectedChannelId: string;
  onSelect: (channelId: string) => void;
  isLoading?: boolean;
}

const channelIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  website: Globe,
  whatsapp: MessageSquare,
  email: Mail,
  phone: Phone,
};

export default function ChannelSelector({
  channels,
  selectedChannelId,
  onSelect,
  isLoading = false
}: ChannelSelectorProps) {
  const getChannelIcon = (type: string) => {
    const Icon = channelIcons[type] || MessageSquare;
    return <Icon className="h-4 w-4" />;
  };

  const getChannelTypeName = (type: string) => {
    const names: Record<string, string> = {
      website: 'Website',
      whatsapp: 'WhatsApp',
      email: 'Email',
      phone: 'Teléfono'
    };
    return names[type] || type;
  };

  return (
    <div className="space-y-2">
      <Label htmlFor="channel">Canal</Label>
      <Select
        value={selectedChannelId}
        onValueChange={onSelect}
        disabled={isLoading}
      >
        <SelectTrigger id="channel" className="w-full">
          <SelectValue placeholder="Selecciona un canal" />
        </SelectTrigger>
        <SelectContent>
          {channels.map((channel) => (
            <SelectItem key={channel.id} value={channel.id}>
              <div className="flex items-center gap-2">
                {getChannelIcon(channel.type)}
                <span>{channel.name}</span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  ({getChannelTypeName(channel.type)})
                </span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {channels.length === 0 && !isLoading && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          No hay canales activos. Crea uno primero en Configuración.
        </p>
      )}
    </div>
  );
}
