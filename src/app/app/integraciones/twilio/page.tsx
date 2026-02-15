'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import {
  Phone,
  MessageSquare,
  Mic,
  ArrowLeft,
  RefreshCw,
  MessageCircle,
  Activity,
  TrendingUp,
  Loader2,
} from 'lucide-react';
import Link from 'next/link';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { supabase } from '@/lib/supabase/config';
import type { CommCreditsStatus, CommUsageLog } from '@/lib/services/integrations/twilio/twilioTypes';

export default function TwilioConfigPage() {
  const { toast } = useToast();
  const organizationId = getOrganizationId();

  const [loading, setLoading] = useState(true);
  const [credits, setCredits] = useState<CommCreditsStatus | null>(null);
  const [monthlyUsage, setMonthlyUsage] = useState({ sms: 0, whatsapp: 0, voice: 0 });
  const [recentLogs, setRecentLogs] = useState<CommUsageLog[]>([]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);

      // Cargar créditos
      const { data: settings } = await supabase
        .from('comm_settings')
        .select('sms_remaining, whatsapp_remaining, voice_minutes_remaining, voice_agent_enabled, is_active, credits_reset_at, phone_number, whatsapp_number')
        .eq('organization_id', organizationId)
        .single();

      if (settings) {
        setCredits(settings as CommCreditsStatus);
      }

      // Cargar uso mensual
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const { data: usageLogs } = await supabase
        .from('comm_usage_logs')
        .select('channel, credits_used')
        .eq('organization_id', organizationId)
        .eq('direction', 'outbound')
        .gte('created_at', startOfMonth.toISOString());

      if (usageLogs) {
        const summary = usageLogs.reduce(
          (acc: { sms: number; whatsapp: number; voice: number }, log) => {
            const ch = log.channel as 'sms' | 'whatsapp' | 'voice';
            acc[ch] = (acc[ch] || 0) + (log.credits_used || 0);
            return acc;
          },
          { sms: 0, whatsapp: 0, voice: 0 }
        );
        setMonthlyUsage(summary);
      }

      // Cargar últimos 10 logs
      const { data: recent } = await supabase
        .from('comm_usage_logs')
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .limit(10);

      if (recent) {
        setRecentLogs(recent as CommUsageLog[]);
      }
    } catch (error) {
      console.error('Error cargando datos Twilio:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los datos de comunicaciones',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [organizationId, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const formatCredits = (value: number | null): string => {
    if (value === null) return '∞';
    return value.toLocaleString();
  };

  const getChannelIcon = (channel: string) => {
    switch (channel) {
      case 'sms': return <MessageSquare className="h-4 w-4" />;
      case 'whatsapp': return <MessageCircle className="h-4 w-4" />;
      case 'voice': return <Phone className="h-4 w-4" />;
      default: return <Activity className="h-4 w-4" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      sent: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
      delivered: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      failed: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
      received: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
      queued: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
    };
    return <Badge className={colors[status] || 'bg-gray-100 text-gray-800'}>{status}</Badge>;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10">
        <div className="px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <Link href="/app/integraciones">
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900/30">
                <Phone className="h-6 w-6 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
                  Twilio — Comunicaciones
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  SMS, WhatsApp y Voice Agent
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {credits?.is_active ? (
                <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                  Activo
                </Badge>
              ) : (
                <Badge className="bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400">
                  Inactivo
                </Badge>
              )}
              <Button variant="outline" size="sm" onClick={loadData}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Actualizar
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Créditos disponibles */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* SMS */}
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">SMS</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                    {formatCredits(credits?.sms_remaining ?? 0)}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    {monthlyUsage.sms} enviados este mes
                  </p>
                </div>
                <div className="p-3 rounded-full bg-blue-100 dark:bg-blue-900/30">
                  <MessageSquare className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* WhatsApp */}
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">WhatsApp</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                    {formatCredits(credits?.whatsapp_remaining ?? 0)}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    {monthlyUsage.whatsapp} enviados este mes
                  </p>
                </div>
                <div className="p-3 rounded-full bg-green-100 dark:bg-green-900/30">
                  <MessageCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Voz */}
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Voz (min)</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                    {formatCredits(credits?.voice_minutes_remaining ?? 0)}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    {monthlyUsage.voice} min usados este mes
                  </p>
                </div>
                <div className="p-3 rounded-full bg-purple-100 dark:bg-purple-900/30">
                  <Mic className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Voice Agent status */}
        {credits?.voice_agent_enabled && (
          <Card className="dark:bg-gray-800 dark:border-gray-700 border-purple-200 dark:border-purple-800">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                  <Mic className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">Voice Agent IA</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Agente de voz con IA habilitado. Las llamadas entrantes serán atendidas por el asistente virtual.
                  </p>
                </div>
                <Badge className="ml-auto bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400">
                  Habilitado
                </Badge>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Historial reciente */}
        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-white">
              <TrendingUp className="h-5 w-5" />
              Actividad Reciente
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentLogs.length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <Activity className="h-10 w-10 mx-auto mb-3 opacity-50" />
                <p>No hay actividad de comunicaciones aún</p>
                <p className="text-sm mt-1">Los mensajes enviados aparecerán aquí</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentLogs.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-900/50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-full bg-gray-100 dark:bg-gray-800">
                        {getChannelIcon(log.channel)}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {log.recipient}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {log.channel.toUpperCase()} · {log.direction === 'inbound' ? 'Entrante' : 'Saliente'}
                          {log.module && ` · ${log.module.toUpperCase()}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {getStatusBadge(log.status)}
                      <span className="text-xs text-gray-400">
                        {new Date(log.created_at).toLocaleString('es-CO', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Reset de créditos */}
        {credits?.credits_reset_at && (
          <p className="text-center text-sm text-gray-400">
            Los créditos se reinician el{' '}
            {new Date(credits.credits_reset_at).toLocaleDateString('es-CO', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </p>
        )}
      </div>
    </div>
  );
}
