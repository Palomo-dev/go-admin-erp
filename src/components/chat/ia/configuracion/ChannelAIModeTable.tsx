'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { 
  MessageCircle, 
  Bot, 
  Users, 
  Shuffle,
  Globe,
  Instagram,
  Facebook,
  MessageSquare
} from 'lucide-react';
import { Channel, AI_MODE_OPTIONS } from '@/lib/services/aiSettingsService';

interface ChannelAIModeTableProps {
  channels: Channel[];
  loading: boolean;
  onModeChange: (channelId: string, mode: 'ai_only' | 'hybrid' | 'manual') => void;
  onApplyToAll: (mode: 'ai_only' | 'hybrid' | 'manual') => void;
}

const channelIcons: Record<string, React.ReactNode> = {
  whatsapp: <MessageCircle className="h-4 w-4 text-green-500" />,
  website: <Globe className="h-4 w-4 text-blue-500" />,
  instagram: <Instagram className="h-4 w-4 text-pink-500" />,
  facebook: <Facebook className="h-4 w-4 text-blue-600" />,
  default: <MessageSquare className="h-4 w-4 text-gray-500" />
};

const modeIcons: Record<string, React.ReactNode> = {
  ai_only: <Bot className="h-4 w-4 text-blue-500" />,
  hybrid: <Shuffle className="h-4 w-4 text-purple-500" />,
  manual: <Users className="h-4 w-4 text-green-500" />
};

const modeColors: Record<string, string> = {
  ai_only: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  hybrid: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  manual: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
};

export default function ChannelAIModeTable({
  channels,
  loading,
  onModeChange,
  onApplyToAll
}: ChannelAIModeTableProps) {
  const getChannelIcon = (type: string) => {
    return channelIcons[type.toLowerCase()] || channelIcons.default;
  };

  const getModeLabel = (mode: string) => {
    return AI_MODE_OPTIONS.find(m => m.value === mode)?.label || mode;
  };

  return (
    <Card className="border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium text-gray-900 dark:text-white flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            Modo IA por Canal
          </CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500 dark:text-gray-400">Aplicar a todos:</span>
            <Select onValueChange={(value) => onApplyToAll(value as 'ai_only' | 'hybrid' | 'manual')}>
              <SelectTrigger className="w-[140px] bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700">
                <SelectValue placeholder="Seleccionar" />
              </SelectTrigger>
              <SelectContent>
                {AI_MODE_OPTIONS.map((mode) => (
                  <SelectItem key={mode.value} value={mode.value}>
                    <div className="flex items-center gap-2">
                      {modeIcons[mode.value]}
                      {mode.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {channels.length === 0 ? (
          <div className="py-8 text-center">
            <MessageCircle className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <p className="text-gray-600 dark:text-gray-400">
              No hay canales configurados
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">
              Configura canales de comunicación para gestionar el modo de IA
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-gray-200 dark:border-gray-700">
                <TableHead className="text-gray-600 dark:text-gray-400">Canal</TableHead>
                <TableHead className="text-gray-600 dark:text-gray-400">Tipo</TableHead>
                <TableHead className="text-gray-600 dark:text-gray-400">Estado</TableHead>
                <TableHead className="text-gray-600 dark:text-gray-400">Modo IA</TableHead>
                <TableHead className="text-gray-600 dark:text-gray-400 w-[180px]">Cambiar</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {channels.map((channel) => (
                <TableRow 
                  key={channel.id}
                  className="border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                >
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
                        {getChannelIcon(channel.type)}
                      </div>
                      <span className="font-medium text-gray-900 dark:text-white">
                        {channel.name}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-gray-600 dark:text-gray-400 capitalize">
                    {channel.type}
                  </TableCell>
                  <TableCell>
                    <Badge 
                      variant={channel.status === 'active' ? 'default' : 'secondary'}
                      className={channel.status === 'active' 
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' 
                        : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                      }
                    >
                      {channel.status === 'active' ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge className={modeColors[channel.ai_mode] || modeColors.hybrid}>
                      <span className="flex items-center gap-1">
                        {modeIcons[channel.ai_mode]}
                        {getModeLabel(channel.ai_mode)}
                      </span>
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Select 
                      value={channel.ai_mode} 
                      onValueChange={(value) => onModeChange(channel.id, value as 'ai_only' | 'hybrid' | 'manual')}
                    >
                      <SelectTrigger className="bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {AI_MODE_OPTIONS.map((mode) => (
                          <SelectItem key={mode.value} value={mode.value}>
                            <div className="flex items-center gap-2">
                              {modeIcons[mode.value]}
                              {mode.label}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Modos disponibles:</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {AI_MODE_OPTIONS.map((mode) => (
              <div key={mode.value} className="flex items-start gap-3">
                <div className={`p-2 rounded-lg ${modeColors[mode.value]?.split(' ')[0]} bg-opacity-50`}>
                  {modeIcons[mode.value]}
                </div>
                <div>
                  <p className="font-medium text-gray-900 dark:text-white text-sm">{mode.label}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{mode.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
