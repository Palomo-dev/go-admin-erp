"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/config";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Calendar, DollarSign, User, Building2, Target, Clock } from "lucide-react";
import LoadingSpinner from "@/components/ui/loading-spinner";
import OpportunityHeader from "@/components/crm/pipeline/OpportunityHeader";
import OpportunityProducts from "@/components/crm/pipeline/OpportunityProducts";
import OpportunityTimeline from "@/components/crm/pipeline/OpportunityTimeline";
import OpportunityTasks from "@/components/crm/pipeline/OpportunityTasks";
import OpportunityQuotes from "@/components/crm/pipeline/OpportunityQuotes";
import OpportunityActions from "@/components/crm/pipeline/OpportunityActions";
import OpportunityAuditInfo from "@/components/crm/pipeline/OpportunityAuditInfo";
import { formatCurrency } from "@/utils/Utils";
import { toast } from "sonner";
import { getOrganizationId } from "@/components/crm/pipeline/utils/pipelineUtils";

interface OpportunityDetail {
  id: string;
  name: string;
  amount: number;
  currency: string;
  expected_close_date: string | null;
  status: string;
  loss_reason: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  customer: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
  };
  pipeline: {
    id: string;
    name: string;
  };
  stage: {
    id: string;
    name: string;
    probability: number;
  };
  organization_id: number;
}

export default function OpportunityDetailPage() {
  const params = useParams();
  const router = useRouter();
  const opportunityId = params.id as string;
  
  const [opportunity, setOpportunity] = useState<OpportunityDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [organizationId, setOrganizationId] = useState<number | null>(null);

  const loadOpportunityDetail = useCallback(async () => {
    try {
      setLoading(true);
      
      const { data, error } = await supabase
        .from('opportunities')
        .select(`
          *,
          customer:customers(id, first_name, last_name, email, phone),
          pipeline:pipelines(id, name),
          stage:stages(id, name, probability)
        `)
        .eq('id', opportunityId)
        .eq('organization_id', organizationId)
        .single();

      if (error) {
        console.error('Error cargando oportunidad:', error);
        toast.error('Error al cargar la oportunidad');
        return;
      }

      if (!data) {
        toast.error('Oportunidad no encontrada');
        router.push('/app/crm/pipeline');
        return;
      }

      setOpportunity(data);
    } catch (error) {
      console.error('Error:', error);
      toast.error('Error al cargar la oportunidad');
    } finally {
      setLoading(false);
    }
  }, [opportunityId, organizationId, router]);

  useEffect(() => {
    // Obtener organización usando la función utilitaria
    const orgId = getOrganizationId();
    setOrganizationId(parseInt(orgId));
  }, []);

  useEffect(() => {
    if (opportunityId && organizationId) {
      loadOpportunityDetail();
    }
  }, [opportunityId, organizationId, loadOpportunityDetail]);

  const handleStatusChange = async (newStatus: string, reason?: string) => {
    if (!opportunity) return;

    try {
      const updateData: {
        status: string;
        updated_at: string;
        loss_reason?: string;
      } = {
        status: newStatus,
        updated_at: new Date().toISOString(),
      };

      if (newStatus === 'lost' && reason) {
        updateData.loss_reason = reason;
      }

      // Si se marca como perdida o ganada, buscar la etapa correspondiente
      if (newStatus === 'lost' || newStatus === 'won') {
        const stageNameToFind = newStatus === 'lost' ? 'Perdido' : 'Ganado';
        
        console.log(`🔍 [handleStatusChange] Buscando etapa "${stageNameToFind}" para pipeline ${opportunity.pipeline.id}`);
        
        const { data: stageData, error: stageError } = await supabase
          .from('stages')
          .select('id, name')
          .eq('pipeline_id', opportunity.pipeline.id)
          .ilike('name', `%${stageNameToFind}%`)
          .single();

        if (stageError) {
          console.error(`❌ [handleStatusChange] Error buscando etapa ${stageNameToFind}:`, stageError);
          // Continuar sin actualizar stage_id si no se encuentra la etapa
        } else if (stageData) {
          console.log(`✅ [handleStatusChange] Etapa encontrada:`, stageData);
          updateData.stage_id = stageData.id;
        } else {
          console.warn(`⚠️ [handleStatusChange] No se encontró etapa "${stageNameToFind}" en pipeline ${opportunity.pipeline.id}`);
        }
      }

      console.log('📝 [handleStatusChange] Datos a actualizar:', updateData);

      const { error } = await supabase
        .from('opportunities')
        .update(updateData)
        .eq('id', opportunity.id);

      if (error) {
        console.error('❌ [handleStatusChange] Error actualizando estado:', error);
        toast.error('Error al actualizar el estado');
        return;
      }

      console.log(`✅ [handleStatusChange] Oportunidad actualizada exitosamente a estado: ${newStatus}`);
      toast.success(`Oportunidad marcada como ${newStatus === 'won' ? 'ganada' : 'perdida'}`);
      loadOpportunityDetail(); // Recargar datos
    } catch (error) {
      console.error('❌ [handleStatusChange] Error:', error);
      toast.error('Error al actualizar el estado');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner />
      </div>
    );
  }

  if (!opportunity) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-2xl font-semibold mb-2">Oportunidad no encontrada</h2>
          <p className="text-muted-foreground mb-4">La oportunidad que buscas no existe o no tienes permisos para verla.</p>
          <Button onClick={() => router.push('/app/crm/pipeline')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver al Pipeline
          </Button>
        </div>
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'won':
        return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">Ganada</Badge>;
      case 'lost':
        return <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100">Perdida</Badge>;
      default:
        return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100">Abierta</Badge>;
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <OpportunityHeader 
        opportunity={opportunity}
        onBack={() => router.push('/app/crm/pipeline')}
        onEdit={() => router.push(`/app/crm/pipeline/edit-opportunity/${opportunity.id}`)}
      />

      {/* Información Principal */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Columna Principal */}
        <div className="lg:col-span-2 space-y-6">
          {/* Información General */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Información General
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Cliente</label>
                  <div className="flex items-center gap-2 mt-1">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span>{opportunity.customer.first_name} {opportunity.customer.last_name}</span>
                  </div>
                  {opportunity.customer.email && (
                    <p className="text-sm text-muted-foreground">{opportunity.customer.email}</p>
                  )}
                  {opportunity.customer.phone && (
                    <p className="text-sm text-muted-foreground">{opportunity.customer.phone}</p>
                  )}
                </div>
                
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Pipeline y Etapa</label>
                  <div className="mt-1">
                    <p className="font-medium">{opportunity.pipeline.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Target className="h-4 w-4 text-muted-foreground" />
                      <span>{opportunity.stage.name}</span>
                      <Badge variant="outline">{opportunity.stage.probability}% prob.</Badge>
                    </div>
                  </div>
                </div>
                
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Valor</label>
                  <div className="flex items-center gap-2 mt-1">
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                    <span className="text-lg font-semibold">
                      {formatCurrency(opportunity.amount)} {opportunity.currency}
                    </span>
                  </div>
                </div>
                
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Fecha Estimada de Cierre</label>
                  <div className="flex items-center gap-2 mt-1">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span>
                      {opportunity.expected_close_date 
                        ? new Date(opportunity.expected_close_date).toLocaleDateString()
                        : 'No definida'
                      }
                    </span>
                  </div>
                </div>
              </div>
              
              <Separator />
              
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Estado</label>
                  <div className="mt-1">
                    {getStatusBadge(opportunity.status)}
                  </div>
                </div>
                
                <div className="text-right">
                  <label className="text-sm font-medium text-muted-foreground">Última Actualización</label>
                  <div className="flex items-center gap-2 mt-1">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">
                      {new Date(opportunity.updated_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>
              
              {opportunity.loss_reason && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Motivo de Pérdida</label>
                  <p className="mt-1 text-sm bg-red-50 dark:bg-red-900/20 p-2 rounded">
                    {opportunity.loss_reason}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Productos/Servicios */}
          <OpportunityProducts opportunityId={opportunity.id} />

          {/* Cotizaciones */}
          <OpportunityQuotes opportunityId={opportunity.id} />

          {/* Línea de Tiempo */}
          <OpportunityTimeline opportunityId={opportunity.id} />
        </div>

        {/* Columna Lateral */}
        <div className="space-y-6">
          {/* Acciones */}
          <OpportunityActions 
            opportunity={opportunity}
            onStatusChange={handleStatusChange}
          />

          {/* Información de Auditoría */}
          <OpportunityAuditInfo opportunity={opportunity} />

          {/* Tareas y Recordatorios */}
          <OpportunityTasks opportunityId={opportunity.id} />
        </div>
      </div>
    </div>
  );
}
