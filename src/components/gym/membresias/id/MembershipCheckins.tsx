'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  LogIn, 
  Clock, 
  MapPin,
  Smartphone,
  CreditCard,
  Fingerprint,
  QrCode,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  User
} from 'lucide-react';
import { cn } from '@/utils/Utils';
import { MemberCheckin } from '@/lib/services/gymService';

interface MembershipCheckinsProps {
  checkins: MemberCheckin[];
  isLoading?: boolean;
  maxVisible?: number;
}

const METHOD_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  qr: QrCode,
  fingerprint: Fingerprint,
  card: CreditCard,
  manual: User,
  app: Smartphone,
  default: LogIn,
};

const METHOD_LABELS: Record<string, string> = {
  qr: 'Código QR',
  fingerprint: 'Huella dactilar',
  card: 'Tarjeta RFID',
  manual: 'Manual',
  app: 'App móvil',
};

export function MembershipCheckins({ 
  checkins, 
  isLoading,
  maxVisible = 10
}: MembershipCheckinsProps) {
  const [showAll, setShowAll] = useState(false);
  
  const visibleCheckins = showAll ? checkins : checkins.slice(0, maxVisible);
  const hasMore = checkins.length > maxVisible;

  const todayCheckins = checkins.filter(c => {
    const checkinDate = new Date(c.checkin_at);
    const today = new Date();
    return checkinDate.toDateString() === today.toDateString();
  }).length;

  const weekCheckins = checkins.filter(c => {
    const checkinDate = new Date(c.checkin_at);
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    return checkinDate >= weekAgo;
  }).length;

  if (isLoading) {
    return (
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader>
          <div className="animate-pulse h-6 bg-gray-200 dark:bg-gray-700 rounded w-40" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="animate-pulse flex gap-4">
                <div className="w-10 h-10 bg-gray-200 dark:bg-gray-700 rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
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
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <LogIn className="h-5 w-5 text-blue-600" />
            Historial de Check-ins
          </CardTitle>
          <Badge variant="outline" className="text-xs">
            {checkins.length} total
          </Badge>
        </div>
        
        {/* Mini estadísticas */}
        <div className="flex items-center gap-4 mt-2 text-xs">
          <div className="flex items-center gap-1 text-gray-500 dark:text-gray-400">
            <Clock className="h-3 w-3" />
            <span>Hoy: <strong className="text-gray-900 dark:text-white">{todayCheckins}</strong></span>
          </div>
          <div className="flex items-center gap-1 text-gray-500 dark:text-gray-400">
            <span>Esta semana: <strong className="text-gray-900 dark:text-white">{weekCheckins}</strong></span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {checkins.length === 0 ? (
          <div className="text-center py-6">
            <LogIn className="h-10 w-10 mx-auto text-gray-300 dark:text-gray-600 mb-2" />
            <p className="text-gray-500 dark:text-gray-400 text-sm">
              No hay check-ins registrados
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {visibleCheckins.map((checkin) => {
              const methodKey: string = checkin.method || 'default';
              const MethodIcon = METHOD_ICONS[methodKey] || METHOD_ICONS.default;
              const isSuccess = !checkin.denied_reason;
              const date = new Date(checkin.checkin_at);

              return (
                <div 
                  key={checkin.id}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-lg transition-colors",
                    isSuccess 
                      ? "bg-gray-50 dark:bg-gray-900/50 hover:bg-gray-100 dark:hover:bg-gray-900"
                      : "bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800"
                  )}
                >
                  <div className={cn(
                    "p-2 rounded-full",
                    isSuccess 
                      ? "bg-green-100 dark:bg-green-900/30"
                      : "bg-red-100 dark:bg-red-900/30"
                  )}>
                    {isSuccess ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                    )}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={cn(
                        "font-medium text-sm",
                        isSuccess 
                          ? "text-gray-900 dark:text-white"
                          : "text-red-700 dark:text-red-400"
                      )}>
                        {isSuccess ? 'Acceso permitido' : 'Acceso denegado'}
                      </p>
                      <Badge variant="outline" className="text-xs">
                        <MethodIcon className="h-3 w-3 mr-1" />
                        {METHOD_LABELS[methodKey] || methodKey}
                      </Badge>
                    </div>
                    {checkin.denied_reason && (
                      <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                        Motivo: {checkin.denied_reason}
                      </p>
                    )}
                  </div>

                  <div className="text-right text-xs text-gray-500 dark:text-gray-400">
                    <p>{date.toLocaleDateString('es-CO')}</p>
                    <p>{date.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                </div>
              );
            })}

            {hasMore && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAll(!showAll)}
                className="w-full mt-2 text-gray-600 dark:text-gray-400"
              >
                {showAll ? (
                  <>
                    <ChevronUp className="h-4 w-4 mr-1" />
                    Ver menos
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-4 w-4 mr-1" />
                    Ver {checkins.length - maxVisible} más
                  </>
                )}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default MembershipCheckins;
