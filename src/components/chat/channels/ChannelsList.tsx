'use client';

import React, { useState } from 'react';
import { Search, Filter, Loader2, Radio } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import ChannelCard from './ChannelCard';
import { ChatChannel, ChannelType, AIMode } from '@/lib/services/chatChannelsService';

interface ChannelsListProps {
  channels: ChatChannel[];
  loading: boolean;
  onToggleStatus: (channel: ChatChannel) => Promise<void>;
  onChangeAIMode: (channel: ChatChannel, mode: AIMode) => Promise<void>;
  onConfigure: (channel: ChatChannel) => void;
  onInstallWidget: (channel: ChatChannel) => void;
  onConnect: (channel: ChatChannel) => void;
}

export default function ChannelsList({
  channels,
  loading,
  onToggleStatus,
  onChangeAIMode,
  onConfigure,
  onInstallWidget,
  onConnect
}: ChannelsListProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const filteredChannels = channels.filter(channel => {
    const matchesSearch = channel.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = typeFilter === 'all' || channel.type === typeFilter;
    const matchesStatus = statusFilter === 'all' || channel.status === statusFilter;
    return matchesSearch && matchesType && matchesStatus;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Buscar canales..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los tipos</SelectItem>
            <SelectItem value="website">Sitio Web</SelectItem>
            <SelectItem value="whatsapp">WhatsApp</SelectItem>
            <SelectItem value="facebook">Facebook</SelectItem>
            <SelectItem value="instagram">Instagram</SelectItem>
            <SelectItem value="telegram">Telegram</SelectItem>
            <SelectItem value="email">Email</SelectItem>
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-36">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="active">Activos</SelectItem>
            <SelectItem value="inactive">Inactivos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Channels List */}
      {filteredChannels.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <Radio className="h-16 w-16 text-gray-300 dark:text-gray-600 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">
            {channels.length === 0 ? 'No hay canales' : 'No se encontraron canales'}
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {channels.length === 0 
              ? 'Crea tu primer canal para empezar a recibir mensajes'
              : 'Intenta ajustar los filtros de búsqueda'
            }
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredChannels.map((channel) => (
            <ChannelCard
              key={channel.id}
              channel={channel}
              onToggleStatus={onToggleStatus}
              onChangeAIMode={onChangeAIMode}
              onConfigure={onConfigure}
              onInstallWidget={onInstallWidget}
              onConnect={onConnect}
            />
          ))}
        </div>
      )}

      {/* Results count */}
      {channels.length > 0 && (
        <div className="mt-4 text-sm text-gray-500 dark:text-gray-400 text-center">
          Mostrando {filteredChannels.length} de {channels.length} canales
        </div>
      )}
    </div>
  );
}
