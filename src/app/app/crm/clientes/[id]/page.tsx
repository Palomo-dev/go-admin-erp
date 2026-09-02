'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  ArrowLeft,
  User,
  Mail,
  Phone,
  MapPin,
  FileText,
  HeartPulse,
  Wallet,
  FolderOpen,
  Activity,
  Target,
  TrendingUp,
  Building2,
  Calendar,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/config';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { CustomerFoliosSection } from '@/components/crm/clientes/CustomerFoliosSection';
import { ClientHealthCard } from '@/components/crm/health/ClientHealthCard';
import { DocumentUploader } from '@/components/crm/documents/DocumentUploader';
import { DetailSkeleton } from '@/components/common/PageSkeletons';
import { formatCurrency } from '@/utils/Utils';

interface CustomerData {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  doc_type: string | null;
  doc_number: string | null;
  customer_type: string | null;
  lifecycle_stage: string | null;
  health_score: number | null;
  health_score_updated_at: string | null;
  created_at: string | null;
}

interface OpportunitySummary {
  id: string;
  name: string;
  amount: number;
  status: string;
  stage_name: string | null;
  stage_color: string | null;
  expected_close_date: string | null;
}

interface ActivitySummary {
  id: string;
  activity_type: string;
  title: string | null;
  occurred_at: string;
}

export default function ClienteDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { organization } = useOrganization();
  const [customer, setCustomer] = useState<CustomerData | null>(null);
  const [opportunities, setOpportunities] = useState<OpportunitySummary[]>([]);
  const [activities, setActivities] = useState<ActivitySummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('info');

  const loadAllData = useCallback(async () => {
    if (!params?.id || !organization?.id) return;
    const customerId = params.id as string;
    const orgId = organization.id;

    try {
      const [custResult, oppResult, actResult] = await Promise.all([
        supabase
          .from('customers')
          .select('id, full_name, email, phone, address, doc_type, doc_number, customer_type, lifecycle_stage, health_score, health_score_updated_at, created_at')
          .eq('id', customerId)
          .eq('organization_id', orgId)
          .single(),
        supabase
          .from('opportunities')
          .select(`
            id, name, amount, status, expected_close_date,
            stage:stages(name, color)
          `)
          .eq('customer_id', customerId)
          .eq('organization_id', orgId)
          .order('created_at', { ascending: false })
          .limit(20),
        supabase
          .from('activities')
          .select('id, activity_type, title, occurred_at')
          .eq('related_id', customerId)
          .eq('related_type', 'customer')
          .eq('organization_id', orgId)
          .order('occurred_at', { ascending: false })
          .limit(20),
      ]);

      if (custResult.error) throw custResult.error;
      setCustomer(custResult.data as CustomerData);

      if (oppResult.data) {
        setOpportunities(oppResult.data.map((o: Record<string, unknown>) => {
          const stage = o.stage as { name: string; color: string } | null;
          return {
            id: o.id as string,
            name: o.name as string,
            amount: Number(o.amount) || 0,
            status: o.status as string,
            stage_name: stage?.name || null,
            stage_color: stage?.color || null,
            expected_close_date: o.expected_close_date as string | null,
          };
        }));
      }

      if (actResult.data) {
        setActivities(actResult.data.map((a: Record<string, unknown>) => ({
          id: a.id as string,
          activity_type: a.activity_type as string,
          title: a.title as string | null,
          occurred_at: a.occurred_at as string,
        })));
      }
    } catch (error) {
      console.error('Error cargando cliente:', error);
    } finally {
      setIsLoading(false);
    }
  }, [params?.id, organization?.id]);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
        <DetailSkeleton />
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-4rem)] gap-4">
        <p className="text-gray-600 dark:text-gray-400">Cliente no encontrado</p>
        <Button variant="outline" onClick={() => router.back()}>
          Volver
        </Button>
      </div>
    );
  }

  const lifecycleLabels: Record<string, string> = {
    lead: 'Lead',
    opportunity: 'Oportunidad',
    customer: 'Cliente',
    churned: 'Inactivo',
  };

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.back()} className="shrink-0">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30 shrink-0">
            <User className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white truncate">
              {customer.full_name}
            </h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {customer.customer_type && (
                <Badge variant="outline" className="text-[10px]">
                  {customer.customer_type === 'company' ? <><Building2 className="h-3 w-3 mr-1" />Empresa</> : 'Persona'}
                </Badge>
              )}
              {customer.lifecycle_stage && (
                <Badge variant="secondary" className="text-[10px]">
                  {lifecycleLabels[customer.lifecycle_stage] || customer.lifecycle_stage}
                </Badge>
              )}
              {customer.health_score != null && (
                <Badge className={`text-[10px] ${
                  customer.health_score >= 70 ? 'text-green-600 dark:text-green-400 border-current' :
                  customer.health_score >= 40 ? 'text-amber-600 dark:text-amber-400 border-current' :
                  'text-red-600 dark:text-red-400 border-current'
                }`}>
                  <HeartPulse className="h-3 w-3 mr-1" />
                  {customer.health_score}
                </Badge>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Stats rapidas */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                <Target className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="min-w-0">
                <div className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">
                  {opportunities.length}
                </div>
                <p className="text-[10px] text-gray-500">Oportunidades</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center shrink-0">
                <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />
              </div>
              <div className="min-w-0">
                <div className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">
                  {opportunities.filter(o => o.status === 'won').length}
                </div>
                <p className="text-[10px] text-gray-500">Ganadas</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center shrink-0">
                <Activity className="h-4 w-4 text-purple-600 dark:text-purple-400" />
              </div>
              <div className="min-w-0">
                <div className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">
                  {activities.length}
                </div>
                <p className="text-[10px] text-gray-500">Actividades</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center shrink-0">
                <HeartPulse className="h-4 w-4 text-rose-600 dark:text-rose-400" />
              </div>
              <div className="min-w-0">
                <div className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">
                  {customer.health_score ?? '—'}
                </div>
                <p className="text-[10px] text-gray-500">Health Score</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full justify-start overflow-x-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
          <TabsTrigger value="info" className="text-xs sm:text-sm">
            <User className="h-3.5 w-3.5 mr-1.5" />
            Info
          </TabsTrigger>
          <TabsTrigger value="salud" className="text-xs sm:text-sm">
            <HeartPulse className="h-3.5 w-3.5 mr-1.5" />
            Salud
          </TabsTrigger>
          <TabsTrigger value="finanzas" className="text-xs sm:text-sm">
            <Wallet className="h-3.5 w-3.5 mr-1.5" />
            Finanzas
          </TabsTrigger>
          <TabsTrigger value="documentos" className="text-xs sm:text-sm">
            <FolderOpen className="h-3.5 w-3.5 mr-1.5" />
            Documentos
          </TabsTrigger>
          <TabsTrigger value="oportunidades" className="text-xs sm:text-sm">
            <Target className="h-3.5 w-3.5 mr-1.5" />
            Oportunidades
          </TabsTrigger>
          <TabsTrigger value="actividades" className="text-xs sm:text-sm">
            <Activity className="h-3.5 w-3.5 mr-1.5" />
            Actividades
          </TabsTrigger>
        </TabsList>

        {/* Tab: Info */}
        <TabsContent value="info" className="space-y-4">
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader className="pb-2 px-4">
              <CardTitle className="text-sm text-gray-900 dark:text-white">
                Informacion de Contacto
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                {customer.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-gray-400 shrink-0" />
                    <span className="text-gray-600 dark:text-gray-400 truncate">{customer.email}</span>
                  </div>
                )}
                {customer.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-gray-400 shrink-0" />
                    <span className="text-gray-600 dark:text-gray-400">{customer.phone}</span>
                  </div>
                )}
                {customer.address && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-gray-400 shrink-0" />
                    <span className="text-gray-600 dark:text-gray-400 truncate">{customer.address}</span>
                  </div>
                )}
                {customer.doc_number && (
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-gray-400 shrink-0" />
                    <span className="text-gray-600 dark:text-gray-400">
                      {customer.doc_type || 'Doc'}: {customer.doc_number}
                    </span>
                  </div>
                )}
                {customer.created_at && (
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-gray-400 shrink-0" />
                    <span className="text-gray-600 dark:text-gray-400">
                      Cliente desde {new Date(customer.created_at).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Salud */}
        <TabsContent value="salud" className="space-y-4">
          <ClientHealthCard customerId={customer.id} customerName={customer.full_name} />
        </TabsContent>

        {/* Tab: Finanzas */}
        <TabsContent value="finanzas" className="space-y-4">
          <CustomerFoliosSection customerId={customer.id} />
        </TabsContent>

        {/* Tab: Documentos */}
        <TabsContent value="documentos" className="space-y-4">
          {organization?.id && (
            <DocumentUploader
              organizationId={organization.id}
              relatedType="customer"
              relatedId={customer.id}
              title="Documentos del cliente"
            />
          )}
        </TabsContent>

        {/* Tab: Oportunidades */}
        <TabsContent value="oportunidades" className="space-y-4">
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader className="pb-2 px-4">
              <CardTitle className="text-sm text-gray-900 dark:text-white">
                Oportunidades ({opportunities.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="px-2 sm:px-4 pb-4">
              {opportunities.length === 0 ? (
                <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-6">
                  Este cliente no tiene oportunidades asociadas
                </p>
              ) : (
                <div className="space-y-1">
                  {opportunities.map((opp) => (
                    <div
                      key={opp.id}
                      className="flex items-center gap-3 p-2.5 rounded-md border border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30"
                    >
                      <div
                        className="h-2 w-2 rounded-full shrink-0"
                        style={{ backgroundColor: opp.stage_color || '#3b82f6' }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate">
                          {opp.name}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-gray-500">{opp.stage_name || 'Sin etapa'}</span>
                          {opp.expected_close_date && (
                            <span className="text-[10px] text-gray-400">
                              {new Date(opp.expected_close_date).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-semibold text-gray-900 dark:text-white">
                          {formatCurrency(opp.amount, 'COP')}
                        </p>
                        <Badge
                          variant="secondary"
                          className={`text-[9px] mt-0.5 ${
                            opp.status === 'won' ? 'text-green-600' :
                            opp.status === 'lost' ? 'text-red-600' :
                            'text-blue-600'
                          }`}
                        >
                          {opp.status === 'won' ? 'Ganada' : opp.status === 'lost' ? 'Perdida' : 'Abierta'}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Actividades */}
        <TabsContent value="actividades" className="space-y-4">
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader className="pb-2 px-4">
              <CardTitle className="text-sm text-gray-900 dark:text-white">
                Historial de Actividades ({activities.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="px-2 sm:px-4 pb-4">
              {activities.length === 0 ? (
                <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-6">
                  Sin actividades registradas
                </p>
              ) : (
                <div className="space-y-1">
                  {activities.map((act) => {
                    const iconMap: Record<string, React.ReactNode> = {
                      call: <Phone className="h-3.5 w-3.5" />,
                      email: <Mail className="h-3.5 w-3.5" />,
                      meeting: <User className="h-3.5 w-3.5" />,
                      note: <FileText className="h-3.5 w-3.5" />,
                      visit: <MapPin className="h-3.5 w-3.5" />,
                    };
                    return (
                      <div
                        key={act.id}
                        className="flex items-center gap-3 p-2.5 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700/30"
                      >
                        <div className="h-7 w-7 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center shrink-0 text-gray-500">
                          {iconMap[act.activity_type] || <Activity className="h-3.5 w-3.5" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate">
                            {act.title || act.activity_type}
                          </p>
                          <span className="text-[10px] text-gray-400">
                            {new Date(act.occurred_at).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <Badge variant="outline" className="text-[9px] capitalize shrink-0">
                          {act.activity_type}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
