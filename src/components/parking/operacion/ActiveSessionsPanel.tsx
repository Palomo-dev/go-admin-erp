'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Clock, Car, LogOut, AlertTriangle } from 'lucide-react';
import { cn, formatCurrency } from '@/utils/Utils';

export interface ActiveSession {
  id: string;
  vehicle_plate: string;
  vehicle_type: string;
  entry_at: string;
  parking_space_id?: string;
  space_label?: string;
  rate_id?: string;
  rate_name?: string;
  rate_price?: number;
  is_pass_holder?: boolean;
}

interface ActiveSessionsPanelProps {
  sessions: ActiveSession[];
  onSelectSession: (session: ActiveSession) => void;
  isLoading?: boolean;
}

function formatDuration(entryAt: string): string {
  const entry = new Date(entryAt);
  const now = new Date();
  const diffMs = now.getTime() - entry.getTime();
  
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  
  if (hours === 0) {
    return `${minutes}min`;
  }
  return `${hours}h ${minutes}min`;
}

function getDurationMinutes(entryAt: string): number {
  const entry = new Date(entryAt);
  const now = new Date();
  return Math.floor((now.getTime() - entry.getTime()) / (1000 * 60));
}

function SessionRow({ 
  session, 
  onSelect 
}: { 
  session: ActiveSession; 
  onSelect: () => void;
}) {
  const [duration, setDuration] = useState(formatDuration(session.entry_at));
  const durationMinutes = getDurationMinutes(session.entry_at);
  const isLongStay = durationMinutes > 240; // Más de 4 horas

  useEffect(() => {
    const interval = setInterval(() => {
      setDuration(formatDuration(session.entry_at));
    }, 60000); // Actualizar cada minuto

    return () => clearInterval(interval);
  }, [session.entry_at]);

  return (
    <div 
      className={cn(
        "p-3 rounded-lg border cursor-pointer transition-colors",
        "hover:bg-gray-50 dark:hover:bg-gray-700/50",
        isLongStay 
          ? "border-orange-200 dark:border-orange-800 bg-orange-50/50 dark:bg-orange-900/10" 
          : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
      )}
      onClick={onSelect}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={cn(
            "p-2 rounded-lg",
            session.is_pass_holder 
              ? "bg-green-100 dark:bg-green-900/30" 
              : "bg-blue-100 dark:bg-blue-900/30"
          )}>
            <Car className={cn(
              "h-4 w-4",
              session.is_pass_holder 
                ? "text-green-600 dark:text-green-400" 
                : "text-blue-600 dark:text-blue-400"
            )} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-900 dark:text-white">
                {session.vehicle_plate}
              </span>
              {session.is_pass_holder && (
                <Badge variant="outline" className="text-xs bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-700">
                  Abonado
                </Badge>
              )}
              {isLongStay && (
                <AlertTriangle className="h-4 w-4 text-orange-500" />
              )}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {session.vehicle_type} • {session.space_label || 'Sin espacio'}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="flex items-center gap-1 text-sm font-medium text-gray-900 dark:text-white">
              <Clock className="h-3 w-3" />
              {duration}
            </div>
            {session.rate_price && !session.is_pass_holder && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                ~{formatCurrency(session.rate_price * (durationMinutes / 60))}
              </p>
            )}
          </div>
          <Button 
            size="sm" 
            variant="outline"
            className="border-blue-200 dark:border-blue-700 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export function ActiveSessionsPanel({ 
  sessions, 
  onSelectSession,
  isLoading 
}: ActiveSessionsPanelProps) {
  return (
    <Card className="border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Clock className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            Sesiones Activas
          </CardTitle>
          <Badge variant="secondary" className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
            {sessions.length} vehículos
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px] pr-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
            </div>
          ) : sessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-gray-500 dark:text-gray-400">
              <Car className="h-8 w-8 mb-2 opacity-50" />
              <p className="text-sm">No hay sesiones activas</p>
            </div>
          ) : (
            <div className="space-y-2">
              {sessions.map((session) => (
                <SessionRow 
                  key={session.id} 
                  session={session} 
                  onSelect={() => onSelectSession(session)}
                />
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
