'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/use-toast';
import { followupService } from '@/lib/services/crm/followupService';
import type {
  OverdueFollowup,
  StaleOpportunity,
  LeadWithoutContact,
} from '@/lib/services/crm/followupService';
import { formatCurrency } from '@/utils/Utils';
import {
  Phone,
  Mail,
  MessageCircle,
  CalendarClock,
  AlertTriangle,
  Clock,
  RefreshCw,
  Loader2,
  Flame,
} from 'lucide-react';

interface HoyViewProps {
  organizationId: number;
}

type TabType = 'overdue' | 'stale' | 'leads';

export function HoyView({ organizationId }: HoyViewProps) {
  // organizationId se valida en la página; followupService obtiene orgId internamente
  void organizationId;
  const [activeTab, setActiveTab] = useState<TabType>('overdue');
  const [loading, setLoading] = useState(true);
  const [overdue, setOverdue] = useState<OverdueFollowup[]>([]);
  const [stale, setStale] = useState<StaleOpportunity[]>([]);
  const [leads, setLeads] = useState<LeadWithoutContact[]>([]);
  const [schedulingId, setSchedulingId] = useState<string | null>(null);
  const [scheduleDate, setScheduleDate] = useState<string>('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [overdueData, staleData, leadsData] = await Promise.all([
        followupService.getOverdueFollowups(),
        followupService.getStaleOpportunities(),
        followupService.getLeadsWithoutContact(),
      ]);
      setOverdue(overdueData);
      setStale(staleData);
      setLeads(leadsData);
    } catch (err) {
      console.error('Error cargando datos de Hoy:', err);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las tareas de hoy',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleScheduleNextContact = async (opportunityId: string) => {
    if (!scheduleDate) {
      toast({ title: 'Selecciona una fecha', variant: 'destructive' });
      return;
    }
    setSchedulingId(opportunityId);
    try {
      const success = await followupService.scheduleNextContact({
        opportunityId,
        date: new Date(scheduleDate).toISOString(),
      });
      if (success) {
        toast({ title: 'Próximo contacto programado' });
        await loadData();
        setScheduleDate('');
      } else {
        toast({ title: 'Error al programar', variant: 'destructive' });
      }
    } finally {
      setSchedulingId(null);
    }
  };

  const handleWhatsApp = (phone: string | null | undefined, name: string) => {
    if (!phone) {
      toast({ title: 'Sin teléfono', description: `${name} no tiene teléfono`, variant: 'destructive' });
      return;
    }
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    window.open(`https://wa.me/${cleanPhone}`, '_blank');
  };

  const handleCall = (phone: string | null | undefined, name: string) => {
    if (!phone) {
      toast({ title: 'Sin teléfono', description: `${name} no tiene teléfono`, variant: 'destructive' });
      return;
    }
    window.open(`tel:${phone}`, '_self');
  };

  const handleEmail = (email: string | null | undefined, name: string) => {
    if (!email) {
      toast({ title: 'Sin email', description: `${name} no tiene email`, variant: 'destructive' });
      return;
    }
    window.open(`mailto:${email}`, '_self');
  };

  const tabs: { key: TabType; label: string; count: number; icon: typeof AlertTriangle }[] = [
    { key: 'overdue', label: 'Vencidos', count: overdue.length, icon: AlertTriangle },
    { key: 'stale', label: 'Estancadas', count: stale.length, icon: Clock },
    { key: 'leads', label: 'Sin contacto', count: leads.length, icon: Flame },
  ];

  return (
    <div className="space-y-4 p-4 sm:p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">
            Hoy
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {overdue.length + stale.length + leads.length} tareas accionables
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={loadData}
          disabled={loading}
          className="h-8"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          Actualizar
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                isActive
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
              {tab.count > 0 && (
                <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                  {tab.count}
                </Badge>
              )}
            </button>
          );
        })}
      </div>

      {/* Contenido */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : (
        <>
          {/* Tab: Vencidos */}
          {activeTab === 'overdue' && (
            <div className="space-y-2">
              {overdue.length === 0 ? (
                <EmptyState message="No hay contactos vencidos. ¡Todo al día!" />
              ) : (
                overdue.map((item) => (
                  <FollowupRow
                    key={item.opportunity_id}
                    name={item.customer_name}
                    stageName={item.stage_name}
                    stageColor={item.stage_color}
                    amount={item.amount}
                    currency={item.currency}
                    badge={
                      item.reason === 'overdue_contact'
                        ? { text: 'Contacto vencido', color: 'red' }
                        : { text: `SLA excedido (${item.days_in_stage}d / ${item.sla_days}d)`, color: 'orange' }
                    }
                    onWhatsApp={() => handleWhatsApp(item.customer_phone, item.customer_name)}
                    onCall={() => handleCall(item.customer_phone, item.customer_name)}
                    onEmail={() => handleEmail(item.customer_email, item.customer_name)}
                    schedulingId={schedulingId}
                    scheduleDate={scheduleDate}
                    onScheduleDateChange={setScheduleDate}
                    onSchedule={() => handleScheduleNextContact(item.opportunity_id)}
                  />
                ))
              )}
            </div>
          )}

          {/* Tab: Estancadas */}
          {activeTab === 'stale' && (
            <div className="space-y-2">
              {stale.length === 0 ? (
                <EmptyState message="No hay oportunidades estancadas." />
              ) : (
                stale.map((item) => (
                  <FollowupRow
                    key={item.opportunity_id}
                    name={item.customer_name}
                    stageName={item.stage_name}
                    stageColor={item.stage_color}
                    amount={item.amount}
                    currency={item.currency}
                    badge={{
                      text: `${item.days_without_activity}d sin actividad`,
                      color: 'orange',
                    }}
                    onWhatsApp={() => handleWhatsApp(item.customer_phone, item.customer_name)}
                    onCall={() => handleCall(item.customer_phone, item.customer_name)}
                    onEmail={() => handleEmail(item.customer_email, item.customer_name)}
                    schedulingId={schedulingId}
                    scheduleDate={scheduleDate}
                    onScheduleDateChange={setScheduleDate}
                    onSchedule={() => handleScheduleNextContact(item.opportunity_id)}
                  />
                ))
              )}
            </div>
          )}

          {/* Tab: Leads sin contacto */}
          {activeTab === 'leads' && (
            <div className="space-y-2">
              {leads.length === 0 ? (
                <EmptyState message="Todos los leads tienen primer contacto." />
              ) : (
                leads.map((item) => (
                  <FollowupRow
                    key={item.opportunity_id}
                    name={item.customer_name}
                    stageName={item.stage_name}
                    stageColor={item.stage_color}
                    amount={item.amount}
                    currency={item.currency}
                    badge={{
                      text: `${item.hours_since_creation}h sin contacto`,
                      color: 'red',
                    }}
                    onWhatsApp={() => handleWhatsApp(item.customer_phone, item.customer_name)}
                    onCall={() => handleCall(item.customer_phone, item.customer_name)}
                    onEmail={() => handleEmail(item.customer_email, item.customer_name)}
                    schedulingId={schedulingId}
                    scheduleDate={scheduleDate}
                    onScheduleDateChange={setScheduleDate}
                    onSchedule={() => handleScheduleNextContact(item.opportunity_id)}
                  />
                ))
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ============== Sub-componentes ==============

interface FollowupRowProps {
  name: string;
  stageName: string;
  stageColor: string;
  amount: number;
  currency: string;
  badge: { text: string; color: 'red' | 'orange' | 'blue' };
  onWhatsApp: () => void;
  onCall: () => void;
  onEmail: () => void;
  schedulingId: string | null;
  scheduleDate: string;
  onScheduleDateChange: (date: string) => void;
  onSchedule: () => void;
}

function FollowupRow({
  name,
  stageName,
  stageColor,
  amount,
  currency,
  badge,
  onWhatsApp,
  onCall,
  onEmail,
  schedulingId,
  scheduleDate,
  onScheduleDateChange,
  onSchedule,
}: FollowupRowProps) {
  const badgeColors = {
    red: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 border-red-200 dark:border-red-800',
    orange: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200 dark:border-amber-800',
    blue: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200 dark:border-blue-800',
  };

  return (
    <Card className="p-3 sm:p-4 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
              {name}
            </span>
            <Badge className={`text-[10px] border ${badgeColors[badge.color]}`}>
              {badge.text}
            </Badge>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span
              className="inline-block h-2 w-2 rounded-full shrink-0"
              style={{ backgroundColor: stageColor }}
            />
            <span className="text-xs text-gray-500 dark:text-gray-400">{stageName}</span>
            <span className="text-xs text-gray-400">·</span>
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
              {formatCurrency(amount, currency)}
            </span>
          </div>
        </div>
      </div>

      {/* Botones de acción */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <Button
          size="sm"
          variant="outline"
          onClick={onWhatsApp}
          className="h-7 px-2 text-xs border-gray-200 dark:border-gray-700 text-green-600 hover:text-green-700"
          title="WhatsApp"
        >
          <MessageCircle className="h-3.5 w-3.5" />
          WhatsApp
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onCall}
          className="h-7 px-2 text-xs border-gray-200 dark:border-gray-700"
          title="Llamar"
        >
          <Phone className="h-3.5 w-3.5" />
          Llamar
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onEmail}
          className="h-7 px-2 text-xs border-gray-200 dark:border-gray-700"
          title="Email"
        >
          <Mail className="h-3.5 w-3.5" />
          Email
        </Button>

        {/* Programar próximo contacto */}
        <div className="flex items-center gap-1 ml-auto">
          <Input
            type="datetime-local"
            value={scheduleDate}
            onChange={(e) => onScheduleDateChange(e.target.value)}
            className="h-7 w-auto text-xs"
            title="Programar próximo contacto"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={onSchedule}
            disabled={schedulingId !== null || !scheduleDate}
            className="h-7 px-2 text-xs border-gray-200 dark:border-gray-700"
          >
            {schedulingId !== null ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CalendarClock className="h-3.5 w-3.5" />
            )}
            Programar
          </Button>
        </div>
      </div>
    </Card>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-3">
        <Clock className="h-6 w-6 text-green-600 dark:text-green-400" />
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400">{message}</p>
    </div>
  );
}
