'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, CheckCheck, Eye, AlertTriangle, Clock } from 'lucide-react';
import type { MessageEvent } from '@/lib/services/facebookChannelService';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface FacebookEventsCardProps {
  events: MessageEvent[];
}

export default function FacebookEventsCard({ events }: FacebookEventsCardProps) {
  const getEventIcon = (type: string) => {
    switch (type) {
      case 'sent':
        return <Send className="h-4 w-4" />;
      case 'delivered':
        return <CheckCheck className="h-4 w-4" />;
      case 'read':
        return <Eye className="h-4 w-4" />;
      case 'failed':
        return <AlertTriangle className="h-4 w-4" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };

  const getEventBadge = (type: string) => {
    switch (type) {
      case 'sent':
        return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300">Enviado</Badge>;
      case 'delivered':
        return <Badge className="bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-300">Entregado</Badge>;
      case 'read':
        return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300">Leído</Badge>;
      case 'failed':
        return <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300">Fallido</Badge>;
      default:
        return <Badge className="bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300">{type}</Badge>;
    }
  };

  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardHeader>
        <CardTitle className="text-lg text-gray-900 dark:text-white">
          Eventos Recientes
        </CardTitle>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            <Clock className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No hay eventos recientes</p>
          </div>
        ) : (
          <ScrollArea className="h-[300px]">
            <div className="space-y-3">
              {events.map((event) => (
                <div
                  key={event.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700"
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-full ${
                      event.event_type === 'failed' 
                        ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                        : 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                    }`}>
                      {getEventIcon(event.event_type)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        {getEventBadge(event.event_type)}
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {event.message_id?.slice(0, 8)}...
                        </span>
                      </div>
                      {event.error_message && (
                        <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                          {event.error_message}
                        </p>
                      )}
                    </div>
                  </div>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {format(new Date(event.created_at), 'dd/MM HH:mm', { locale: es })}
                  </span>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
