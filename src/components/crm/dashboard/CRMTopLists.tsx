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
        <CardHeader className="p-3 sm:p-4 pb-2">
          <Skeleton className="h-5 sm:h-6 w-28 sm:w-32 dark:bg-gray-700" />
        </CardHeader>
        <CardContent className="p-3 sm:p-4 pt-0">
          <div className="space-y-2 sm:space-y-3">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="flex items-center gap-2 sm:gap-3">
                <Skeleton className="h-8 w-8 sm:h-10 sm:w-10 rounded-full dark:bg-gray-700" />
                <div className="flex-1">
                  <Skeleton className="h-3 sm:h-4 w-24 sm:w-32 mb-1 dark:bg-gray-700" />
                  <Skeleton className="h-2.5 sm:h-3 w-20 sm:w-24 dark:bg-gray-700" />
                </div>
                <Skeleton className="h-5 sm:h-6 w-10 sm:w-12 dark:bg-gray-700" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardHeader className="p-3 sm:p-4 pb-2">
        <CardTitle className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <User className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600 dark:text-blue-400" />
          Top Agentes
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 sm:p-4 pt-0">
        {data.length === 0 ? (
          <div className="text-center py-4 text-gray-500 dark:text-gray-400 text-xs sm:text-sm">
            No hay datos de agentes
          </div>
        ) : (
          <div className="space-y-2 sm:space-y-3">
            {data.map((agent, index) => (
              <div
                key={agent.memberId}
                className="flex items-center gap-2 sm:gap-3 p-1.5 sm:p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
              >
                <div className={cn(
                  'w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-white font-bold text-xs sm:text-sm shrink-0',
                  index === 0 ? 'bg-yellow-500 dark:bg-yellow-600' :
                  index === 1 ? 'bg-gray-400 dark:bg-gray-500' :
                  index === 2 ? 'bg-amber-600 dark:bg-amber-700' :
                  'bg-blue-500 dark:bg-blue-600'
                )}>
                  {index + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs sm:text-sm font-medium text-gray-900 dark:text-white truncate">
                    {agent.name}
                  </p>
                  <div className="flex items-center gap-2 sm:gap-3 text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">
                    <span className="flex items-center gap-0.5 sm:gap-1">
                      <MessageSquare className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                      {agent.conversationsCount}
                    </span>
                    <span className="flex items-center gap-0.5 sm:gap-1">
                      <Clock className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                      {formatTime(agent.avgResponseTime)}
                    </span>
                    <span className="flex items-center gap-0.5 sm:gap-1">
                      <CheckCircle className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-green-500 dark:text-green-400" />
                      {agent.resolvedCount}
                    </span>
                  </div>
                </div>
                <Badge variant="secondary" className="text-[10px] sm:text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hidden xs:inline-flex">
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
        <CardHeader className="p-3 sm:p-4 pb-2">
          <Skeleton className="h-5 sm:h-6 w-28 sm:w-32 dark:bg-gray-700" />
        </CardHeader>
        <CardContent className="p-3 sm:p-4 pt-0">
          <div className="space-y-2 sm:space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex items-center gap-2 sm:gap-3">
                <Skeleton className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg dark:bg-gray-700" />
                <div className="flex-1">
                  <Skeleton className="h-3 sm:h-4 w-20 sm:w-24 mb-1 dark:bg-gray-700" />
                  <Skeleton className="h-2.5 sm:h-3 w-14 sm:w-16 dark:bg-gray-700" />
                </div>
                <Skeleton className="h-5 sm:h-6 w-12 sm:w-16 dark:bg-gray-700" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardHeader className="p-3 sm:p-4 pb-2">
        <CardTitle className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <MessageSquare className="h-4 w-4 sm:h-5 sm:w-5 text-green-600 dark:text-green-400" />
          Top Canales
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 sm:p-4 pt-0">
        {data.length === 0 ? (
          <div className="text-center py-4 text-gray-500 dark:text-gray-400 text-xs sm:text-sm">
            No hay canales configurados
          </div>
        ) : (
          <div className="space-y-2 sm:space-y-3">
            {data.map((channel, index) => (
              <div
                key={channel.channelId}
                className="flex items-center gap-2 sm:gap-3 p-1.5 sm:p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
              >
                <div className={cn(
                  'w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center text-white shrink-0',
                  channel.channelType?.toLowerCase() === 'whatsapp' ? 'bg-green-500 dark:bg-green-600' :
                  channel.channelType?.toLowerCase() === 'email' ? 'bg-blue-500 dark:bg-blue-600' :
                  channel.channelType?.toLowerCase() === 'webchat' ? 'bg-orange-500 dark:bg-orange-600' :
                  'bg-gray-500 dark:bg-gray-600'
                )}>
                  {getChannelIcon(channel.channelType)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs sm:text-sm font-medium text-gray-900 dark:text-white truncate">
                    {channel.channelName}
                  </p>
                  <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">
                    {channel.conversationsCount} conversaciones
                  </p>
                </div>
                <Badge variant="secondary" className="text-[10px] sm:text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
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
        <CardHeader className="p-3 sm:p-4 pb-2">
          <Skeleton className="h-5 sm:h-6 w-36 sm:w-48 dark:bg-gray-700" />
        </CardHeader>
        <CardContent className="p-3 sm:p-4 pt-0">
          <div className="space-y-2 sm:space-y-3">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="flex items-center gap-2 sm:gap-3">
                <Skeleton className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg dark:bg-gray-700" />
                <div className="flex-1">
                  <Skeleton className="h-3 sm:h-4 w-24 sm:w-32 mb-1 dark:bg-gray-700" />
                  <Skeleton className="h-2.5 sm:h-3 w-20 sm:w-24 dark:bg-gray-700" />
                </div>
                <Skeleton className="h-5 sm:h-6 w-16 sm:w-20 dark:bg-gray-700" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardHeader className="p-3 sm:p-4 pb-2">
        <CardTitle className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5 text-orange-600 dark:text-orange-400" />
          Próximas a Cerrar
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 sm:p-4 pt-0">
        {data.length === 0 ? (
          <div className="text-center py-4 text-gray-500 dark:text-gray-400 text-xs sm:text-sm">
            No hay oportunidades próximas a cerrar
          </div>
        ) : (
          <div className="space-y-2 sm:space-y-3">
            {data.map((opportunity) => (
              <div
                key={opportunity.id}
                className="flex items-center gap-2 sm:gap-3 p-1.5 sm:p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
              >
                <div
                  className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center shrink-0"
                  style={{ backgroundColor: opportunity.stageColor + '20' }}
                >
                  <DollarSign
                    className="h-4 w-4 sm:h-5 sm:w-5"
                    style={{ color: opportunity.stageColor }}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs sm:text-sm font-medium text-gray-900 dark:text-white truncate">
                    {opportunity.name}
                  </p>
                  <div className="flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">
                    <span className="truncate max-w-[80px] sm:max-w-none">{opportunity.customerName}</span>
                    <span className="hidden xs:inline">•</span>
                    <span className="hidden xs:flex items-center gap-0.5 sm:gap-1">
                      <Calendar className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                      {format(parseISO(opportunity.expectedCloseDate), 'dd MMM', { locale: es })}
                    </span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs sm:text-sm font-bold text-gray-900 dark:text-white">
                    {formatCurrency(opportunity.amount, opportunity.currency)}
                  </p>
                  <Badge
                    variant="outline"
                    className="text-[10px] sm:text-xs"
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
