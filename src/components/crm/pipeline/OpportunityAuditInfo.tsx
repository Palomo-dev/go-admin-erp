"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/config";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { 
  Clock, 
  User, 
  Calendar, 
  History, 
  ChevronDown, 
  ChevronRight,
  Edit,
  Eye,
  Shield
} from "lucide-react";
import { toast } from "sonner";
import { getOrganizationId } from "./utils/pipelineUtils";

interface OpportunityAuditInfoProps {
  opportunity: {
    id: string;
    name: string;
    status: string;
    created_at: string;
    updated_at: string;
    created_by: string | null;
    loss_reason: string | null;
  };
}

interface AuditEntry {
  id: string;
  activity_type: string;
  notes: string;
  occurred_at: string;
  created_at: string;
  user_id: string | null;
  metadata: Record<string, unknown> | null;
}

interface UserInfo {
  id: string;
  email: string;
  full_name?: string;
}

export default function OpportunityAuditInfo({ opportunity }: OpportunityAuditInfoProps) {
  const [auditHistory, setAuditHistory] = useState<AuditEntry[]>([]);
  const [users, setUsers] = useState<Record<string, UserInfo>>({});
  const [loading, setLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  // Cargar historial de auditoría desde la tabla activities
  const loadAuditHistory = useCallback(async () => {
    try {
      setLoading(true);
      const organizationId = getOrganizationId();
      
      if (!organizationId) {
        toast.error('No se encontró la organización');
        return;
      }

      // Cargar actividades relacionadas con la oportunidad
      const { data: activities, error } = await supabase
        .from('activities')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('related_type', 'opportunity')
        .eq('related_id', opportunity.id)
        .order('occurred_at', { ascending: false });

      if (error) {
        console.error('Error cargando historial de auditoría:', error);
        return;
      }

      setAuditHistory(activities || []);

      // Cargar información de usuarios únicos
      const userIds = [...new Set([
        opportunity.created_by,
        ...(activities || []).map(a => a.user_id).filter(Boolean)
      ].filter(Boolean))];

      if (userIds.length > 0) {
        const { data: usersData, error: usersError } = await supabase
          .from('users')
          .select('id, email, full_name')
          .in('id', userIds);

        if (!usersError && usersData) {
          const usersMap = usersData.reduce((acc, user) => {
            acc[user.id] = user;
            return acc;
          }, {} as Record<string, UserInfo>);
          setUsers(usersMap);
        }
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  }, [opportunity.id, opportunity.created_by]);

  useEffect(() => {
    if (isExpanded) {
      loadAuditHistory();
    }
  }, [isExpanded, loadAuditHistory]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return {
      date: date.toLocaleDateString('es-ES'),
      time: date.toLocaleTimeString('es-ES', { 
        hour: '2-digit', 
        minute: '2-digit' 
      })
    };
  };

  const getUserName = (userId: string | null) => {
    if (!userId) return 'Sistema';
    const user = users[userId];
    return user?.full_name || user?.email || 'Usuario desconocido';
  };

  const getActivityIcon = (activityType: string) => {
    switch (activityType) {
      case 'system':
        return <Shield className="h-4 w-4 text-blue-500" />;
      case 'edit':
        return <Edit className="h-4 w-4 text-orange-500" />;
      case 'view':
        return <Eye className="h-4 w-4 text-gray-500" />;
      default:
        return <History className="h-4 w-4 text-gray-500" />;
    }
  };

  const getActivityTitle = (activityType: string, notes: string) => {
    switch (activityType) {
      case 'system':
        return 'Cambio del sistema';
      case 'status_change':
        return 'Cambio de estado';
      case 'stage_change':
        return 'Cambio de etapa';
      case 'amount_change':
        return 'Cambio de monto';
      case 'edit':
        return 'Edición manual';
      default:
        return notes || 'Actividad registrada';
    }
  };

  const createdDate = formatDate(opportunity.created_at);
  const updatedDate = formatDate(opportunity.updated_at);
  const createdBy = getUserName(opportunity.created_by);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="h-5 w-5" />
          Información de Auditoría
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Información básica de auditoría */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-muted-foreground">Creado por</label>
            <div className="flex items-center gap-2 mt-1">
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">{createdBy}</span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                {createdDate.date} a las {createdDate.time}
              </span>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-muted-foreground">Última modificación</label>
            <div className="flex items-center gap-2 mt-1">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">
                {updatedDate.date} a las {updatedDate.time}
              </span>
            </div>
            {opportunity.created_at !== opportunity.updated_at && (
              <Badge variant="outline" className="mt-1">
                Modificado
              </Badge>
            )}
          </div>
        </div>

        {/* Estado actual */}
        <div>
          <label className="text-sm font-medium text-muted-foreground">Estado actual</label>
          <div className="mt-1">
            <Badge variant={
              opportunity.status === 'won' ? 'default' :
              opportunity.status === 'lost' ? 'destructive' :
              'secondary'
            }>
              {opportunity.status === 'won' ? 'Ganada' :
               opportunity.status === 'lost' ? 'Perdida' :
               opportunity.status === 'active' ? 'Activa' : 
               opportunity.status}
            </Badge>
          </div>
        </div>

        {/* Motivo de pérdida si aplica */}
        {opportunity.loss_reason && (
          <div>
            <label className="text-sm font-medium text-muted-foreground">Motivo registrado</label>
            <p className="mt-1 text-sm bg-red-50 dark:bg-red-900/20 p-2 rounded border-l-4 border-red-500">
              {opportunity.loss_reason}
            </p>
          </div>
        )}

        <Separator />

        {/* Historial detallado (colapsible) */}
        <div>
          <Button 
            variant="ghost" 
            className="w-full justify-between p-0 h-auto"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            <span className="text-sm font-medium">Historial detallado de cambios</span>
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </Button>
          
          {isExpanded && (
            <div className="space-y-3 mt-3">
              {loading ? (
                <div className="text-center py-4">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto"></div>
                  <p className="text-sm text-muted-foreground mt-2">Cargando historial...</p>
                </div>
              ) : auditHistory.length > 0 ? (
                <div className="space-y-3 max-h-60 overflow-y-auto">
                  {auditHistory.map((entry) => {
                    const entryDate = formatDate(entry.occurred_at || entry.created_at);
                    return (
                      <div key={entry.id} className="flex gap-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                        <div className="flex-shrink-0 mt-0.5">
                          {getActivityIcon(entry.activity_type)}
                        </div>
                        <div className="flex-grow min-w-0">
                          <div className="flex items-center justify-between">
                            <h4 className="text-sm font-medium">
                              {getActivityTitle(entry.activity_type, entry.notes)}
                            </h4>
                            <span className="text-xs text-muted-foreground">
                              {entryDate.date} {entryDate.time}
                            </span>
                          </div>
                          {entry.notes && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {entry.notes}
                            </p>
                          )}
                          <div className="flex items-center gap-2 mt-1">
                            <User className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">
                              {getUserName(entry.user_id)}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-4">
                  <History className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    No hay historial de cambios disponible
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
