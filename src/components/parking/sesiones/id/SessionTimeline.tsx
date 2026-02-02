'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Clock,
  LogIn,
  LogOut,
  CreditCard,
  AlertTriangle,
  Edit,
  CheckCircle,
  XCircle,
} from 'lucide-react';

export interface TimelineEvent {
  id: string;
  type: 'entry' | 'exit' | 'payment' | 'edit' | 'incident' | 'note' | 'status_change';
  description: string;
  timestamp: string;
  user?: string;
  metadata?: Record<string, unknown>;
}

interface SessionTimelineProps {
  events: TimelineEvent[];
  isLoading: boolean;
}

const getEventIcon = (type: string) => {
  const icons: Record<string, React.ReactNode> = {
    entry: <LogIn className="h-4 w-4 text-green-600" />,
    exit: <LogOut className="h-4 w-4 text-red-600" />,
    payment: <CreditCard className="h-4 w-4 text-blue-600" />,
    edit: <Edit className="h-4 w-4 text-orange-600" />,
    incident: <AlertTriangle className="h-4 w-4 text-yellow-600" />,
    note: <Edit className="h-4 w-4 text-gray-600" />,
    status_change: <CheckCircle className="h-4 w-4 text-purple-600" />,
  };
  return icons[type] || <Clock className="h-4 w-4 text-gray-600" />;
};

const getEventColor = (type: string) => {
  const colors: Record<string, string> = {
    entry: 'bg-green-100 dark:bg-green-900/30 border-green-500',
    exit: 'bg-red-100 dark:bg-red-900/30 border-red-500',
    payment: 'bg-blue-100 dark:bg-blue-900/30 border-blue-500',
    edit: 'bg-orange-100 dark:bg-orange-900/30 border-orange-500',
    incident: 'bg-yellow-100 dark:bg-yellow-900/30 border-yellow-500',
    note: 'bg-gray-100 dark:bg-gray-900/30 border-gray-500',
    status_change: 'bg-purple-100 dark:bg-purple-900/30 border-purple-500',
  };
  return colors[type] || 'bg-gray-100 dark:bg-gray-900/30 border-gray-500';
};

export function SessionTimeline({ events, isLoading }: SessionTimelineProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            Línea de Tiempo
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex gap-4">
                <div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Clock className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          Línea de Tiempo
        </CardTitle>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="text-center text-gray-500 dark:text-gray-400 py-4">
            No hay eventos registrados
          </p>
        ) : (
          <div className="relative">
            <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200 dark:bg-gray-700" />
            <div className="space-y-4">
              {events.map((event, index) => (
                <div key={event.id} className="relative flex gap-4 pl-2">
                  <div
                    className={`relative z-10 flex items-center justify-center w-8 h-8 rounded-full border-2 ${getEventColor(
                      event.type
                    )}`}
                  >
                    {getEventIcon(event.type)}
                  </div>
                  <div className="flex-1 pb-4">
                    <p className="font-medium text-gray-900 dark:text-white">
                      {event.description}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {new Date(event.timestamp).toLocaleString('es-ES', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                      </span>
                      {event.user && (
                        <>
                          <span className="text-gray-300 dark:text-gray-600">•</span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {event.user}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
