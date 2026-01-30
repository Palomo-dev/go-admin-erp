'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn, formatCurrency } from '@/utils/Utils';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  User,
  Clock,
  CheckCircle,
  MessageSquare,
  Mail,
  Phone,
  Globe,
  MessageCircle,
  DollarSign,
  Calendar,
  TrendingUp,
} from 'lucide-react';
import { TopAgent, TopChannel, TopOpportunity } from './types';

interface TopAgentsListProps {
  data: TopAgent[];
  isLoading: boolean;
}

interface TopChannelsListProps {
  data: TopChannel[];
  isLoading: boolean;
}

interface TopOpportunitiesListProps {
  data: TopOpportunity[];
  isLoading: boolean;
}

function formatTime(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${Math.round(seconds / 3600)}h`;
}

function getChannelIcon(type: string) {
  switch (type?.toLowerCase()) {
    case 'whatsapp':
      return <MessageCircle className="h-4 w-4" />;
    case 'email':
      return <Mail className="h-4 w-4" />;
    case 'phone':
    case 'call':
      return <Phone className="h-4 w-4" />;
    case 'website':
    case 'webchat':
      return <Globe className="h-4 w-4" />;
    default:
      return <MessageSquare className="h-4 w-4" />;
  }
}

export function TopAgentsList({ data, isLoading }: TopAgentsListProps) {
  if (isLoading) {
    return (
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1">
                  <Skeleton className="h-4 w-32 mb-1" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-6 w-12" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <User className="h-5 w-5 text-blue-600" />
          Top Agentes
        </CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="text-center py-4 text-gray-500 dark:text-gray-400 text-sm">
            No hay datos de agentes
          </div>
        ) : (
          <div className="space-y-3">
            {data.map((agent, index) => (
              <div
                key={agent.memberId}
                className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
              >
                <div className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm',
                  index === 0 ? 'bg-yellow-500' :
                  index === 1 ? 'bg-gray-400' :
                  index === 2 ? 'bg-amber-600' :
                  'bg-blue-500'
                )}>
                  {index + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {agent.name}
                  </p>
                  <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                    <span className="flex items-center gap-1">
                      <MessageSquare className="h-3 w-3" />
                      {agent.conversationsCount}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatTime(agent.avgResponseTime)}
                    </span>
                    <span className="flex items-center gap-1">
                      <CheckCircle className="h-3 w-3 text-green-500" />
                      {agent.resolvedCount}
                    </span>
                  </div>
                </div>
                <Badge variant="secondary" className="text-xs">
                  {agent.conversationsCount} conv.
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function TopChannelsList({ data, isLoading }: TopChannelsListProps) {
  if (isLoading) {
    return (
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-lg" />
                <div className="flex-1">
                  <Skeleton className="h-4 w-24 mb-1" />
                  <Skeleton className="h-3 w-16" />
                </div>
                <Skeleton className="h-6 w-16" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-green-600" />
          Top Canales
        </CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="text-center py-4 text-gray-500 dark:text-gray-400 text-sm">
            No hay canales configurados
          </div>
        ) : (
          <div className="space-y-3">
            {data.map((channel, index) => (
              <div
                key={channel.channelId}
                className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
              >
                <div className={cn(
                  'w-10 h-10 rounded-lg flex items-center justify-center text-white',
                  channel.channelType?.toLowerCase() === 'whatsapp' ? 'bg-green-500' :
                  channel.channelType?.toLowerCase() === 'email' ? 'bg-blue-500' :
                  channel.channelType?.toLowerCase() === 'webchat' ? 'bg-orange-500' :
                  'bg-gray-500'
                )}>
                  {getChannelIcon(channel.channelType)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {channel.channelName}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {channel.conversationsCount} conversaciones
                  </p>
                </div>
                <Badge variant="secondary" className="text-xs">
                  {channel.messagesCount.toLocaleString()} msg
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function TopOpportunitiesList({ data, isLoading }: TopOpportunitiesListProps) {
  if (isLoading) {
    return (
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-lg" />
                <div className="flex-1">
                  <Skeleton className="h-4 w-32 mb-1" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-6 w-20" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-orange-600" />
          Próximas a Cerrar
        </CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="text-center py-4 text-gray-500 dark:text-gray-400 text-sm">
            No hay oportunidades próximas a cerrar
          </div>
        ) : (
          <div className="space-y-3">
            {data.map((opportunity) => (
              <div
                key={opportunity.id}
                className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
              >
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: opportunity.stageColor + '20' }}
                >
                  <DollarSign
                    className="h-5 w-5"
                    style={{ color: opportunity.stageColor }}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {opportunity.name}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <span className="truncate">{opportunity.customerName}</span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {format(parseISO(opportunity.expectedCloseDate), 'dd MMM', { locale: es })}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-gray-900 dark:text-white">
                    {formatCurrency(opportunity.amount, opportunity.currency)}
                  </p>
                  <Badge
                    variant="outline"
                    className="text-xs"
                    style={{
                      borderColor: opportunity.stageColor,
                      color: opportunity.stageColor,
                    }}
                  >
                    {opportunity.probability}%
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
