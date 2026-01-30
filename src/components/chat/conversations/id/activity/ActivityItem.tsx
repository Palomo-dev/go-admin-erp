'use client';

import React from 'react';
import {
  GitBranch,
  UserCheck,
  Tag,
  Bot,
  FileText,
  User,
  Settings,
  CheckCircle,
  XCircle,
  Clock
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ActivityItem as ActivityItemType, ActivityType } from '@/lib/services/conversationActivityService';
import { formatDate } from '@/utils/Utils';

interface ActivityItemProps {
  activity: ActivityItemType;
}

export default function ActivityItem({ activity }: ActivityItemProps) {
  const getIcon = (type: ActivityType) => {
    switch (type) {
      case 'status_change':
        return <GitBranch className="h-4 w-4" />;
      case 'assignment':
        return <UserCheck className="h-4 w-4" />;
      case 'tag_added':
      case 'tag_removed':
        return <Tag className="h-4 w-4" />;
      case 'ai_job':
        return <Bot className="h-4 w-4" />;
      case 'audit':
        return <FileText className="h-4 w-4" />;
      default:
        return <Settings className="h-4 w-4" />;
    }
  };

  const getActorIcon = (actorType?: string) => {
    switch (actorType) {
      case 'ai':
        return <Bot className="h-3 w-3" />;
      case 'system':
        return <Settings className="h-3 w-3" />;
      default:
        return <User className="h-3 w-3" />;
    }
  };

  const getTypeColor = (type: ActivityType) => {
    switch (type) {
      case 'status_change':
        return 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200 dark:border-blue-800';
      case 'assignment':
        return 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800';
      case 'tag_added':
        return 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400 border-purple-200 dark:border-purple-800';
      case 'tag_removed':
        return 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400 border-orange-200 dark:border-orange-800';
      case 'ai_job':
        return 'bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400 border-violet-200 dark:border-violet-800';
      case 'audit':
        return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 border-gray-200 dark:border-gray-700';
      default:
        return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
    }
  };

  const getTypeLabel = (type: ActivityType) => {
    const labels: Record<ActivityType, string> = {
      status_change: 'Estado',
      assignment: 'Asignación',
      tag_added: 'Etiqueta',
      tag_removed: 'Etiqueta',
      ai_job: 'IA',
      audit: 'Auditoría'
    };
    return labels[type] || type;
  };

  const getActorLabel = () => {
    if (!activity.actor) return 'Sistema';
    switch (activity.actor.type) {
      case 'ai':
        return 'Asistente IA';
      case 'system':
        return 'Sistema';
      default:
        return activity.actor.name || `Miembro #${activity.actor.id}`;
    }
  };

  const renderAIJobDetails = () => {
    if (activity.type !== 'ai_job') return null;
    
    const data = activity.data;
    return (
      <div className="mt-2 space-y-1">
        {data.status && (
          <div className="flex items-center gap-2 text-xs">
            {data.status === 'completed' ? (
              <CheckCircle className="h-3 w-3 text-green-500" />
            ) : data.status === 'failed' ? (
              <XCircle className="h-3 w-3 text-red-500" />
            ) : (
              <Clock className="h-3 w-3 text-yellow-500" />
            )}
            <span className="text-gray-600 dark:text-gray-400">
              Estado: {data.status === 'completed' ? 'Completado' : 
                       data.status === 'failed' ? 'Fallido' : data.status}
            </span>
          </div>
        )}
        {data.confidence_score && (
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Confianza: {Math.round(data.confidence_score * 100)}%
          </div>
        )}
        {data.total_cost && (
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Costo: ${data.total_cost.toFixed(4)}
          </div>
        )}
        {data.error_message && (
          <div className="text-xs text-red-500 dark:text-red-400">
            Error: {data.error_message}
          </div>
        )}
      </div>
    );
  };

  const renderStatusChangeDetails = () => {
    if (activity.type !== 'status_change') return null;
    
    const data = activity.data;
    const statusColors: Record<string, string> = {
      open: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
      pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
      closed: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'
    };
    const statusLabels: Record<string, string> = {
      open: 'Abierta',
      pending: 'Pendiente',
      closed: 'Cerrada'
    };

    return (
      <div className="mt-2 flex items-center gap-2 text-xs">
        {data.from_status && (
          <>
            <Badge className={statusColors[data.from_status] || 'bg-gray-100'}>
              {statusLabels[data.from_status] || data.from_status}
            </Badge>
            <span className="text-gray-400">→</span>
          </>
        )}
        <Badge className={statusColors[data.to_status] || 'bg-gray-100'}>
          {statusLabels[data.to_status] || data.to_status}
        </Badge>
      </div>
    );
  };

  const renderTagDetails = () => {
    if (activity.type !== 'tag_added' && activity.type !== 'tag_removed') return null;
    
    const data = activity.data;
    if (data.tag) {
      return (
        <div className="mt-2">
          <Badge 
            style={{ backgroundColor: data.tag.color + '20', color: data.tag.color }}
            className="border"
          >
            {data.tag.name}
          </Badge>
        </div>
      );
    }
    return null;
  };

  return (
    <Card className="hover:shadow-md transition-shadow dark:bg-gray-800 dark:border-gray-700">
      <CardContent className="p-4">
        <div className="flex gap-4">
          {/* Icon */}
          <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${getTypeColor(activity.type)}`}>
            {getIcon(activity.type)}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className={`text-xs ${getTypeColor(activity.type)}`}>
                    {getTypeLabel(activity.type)}
                  </Badge>
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    {formatDate(activity.timestamp)}
                  </span>
                </div>
                <p className="mt-1 text-sm text-gray-900 dark:text-white">
                  {activity.description}
                </p>
              </div>
            </div>

            {/* Actor */}
            <div className="mt-2 flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
              {getActorIcon(activity.actor?.type)}
              <span>{getActorLabel()}</span>
            </div>

            {/* Details by type */}
            {renderStatusChangeDetails()}
            {renderAIJobDetails()}
            {renderTagDetails()}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
