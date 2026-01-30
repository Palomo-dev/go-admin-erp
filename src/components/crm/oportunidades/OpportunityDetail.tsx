'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/components/ui/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ArrowLeft,
  Edit,
  Copy,
  Trash2,
  CheckCircle,
  XCircle,
  User,
  Calendar,
  DollarSign,
  Target,
  Phone,
  Mail,
  Clock,
  MessageSquare,
  Plus,
  Loader2,
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { formatCurrency } from '@/utils/Utils';
import { opportunitiesService } from './opportunitiesService';
import { Opportunity, OpportunityProduct, Activity, Stage } from './types';
import { LossReasonDialog } from './LossReasonDialog';

interface OpportunityDetailProps {
  opportunityId: string;
}

export function OpportunityDetail({ opportunityId }: OpportunityDetailProps) {
  const router = useRouter();

  const [opportunity, setOpportunity] = useState<Opportunity | null>(null);
  const [products, setProducts] = useState<OpportunityProduct[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);

  const [showLossDialog, setShowLossDialog] = useState(false);
  const [newActivityType, setNewActivityType] = useState<Activity['activity_type']>('note');
  const [newActivityNotes, setNewActivityNotes] = useState('');
  const [isAddingActivity, setIsAddingActivity] = useState(false);

  useEffect(() => {
    loadData();
  }, [opportunityId]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [oppData, productsData, activitiesData] = await Promise.all([
        opportunitiesService.getOpportunityById(opportunityId),
        opportunitiesService.getOpportunityProducts(opportunityId),
        opportunitiesService.getOpportunityActivities(opportunityId),
      ]);

      setOpportunity(oppData);
      setProducts(productsData);
      setActivities(activitiesData);

      if (oppData?.pipeline_id) {
        const stagesData = await opportunitiesService.getStages(oppData.pipeline_id);
        setStages(stagesData);
      }
    } catch (error) {
      console.error('Error cargando datos:', error);
      toast({
        title: 'Error',
        description: 'No se pudo cargar la oportunidad',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleStageChange = async (stageId: string) => {
    if (!opportunity) return;
    setIsUpdating(true);
    try {
      await opportunitiesService.moveToStage(opportunity.id, stageId);
      await loadData();
      toast({
        title: 'Éxito',
        description: 'Etapa actualizada correctamente',
      });
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: 'Error',
        description: 'No se pudo actualizar la etapa',
        variant: 'destructive',
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleMarkWon = async () => {
    if (!opportunity) return;
    setIsUpdating(true);
    try {
      await opportunitiesService.markAsWon(opportunity.id);
      await loadData();
      toast({
        title: 'Éxito',
        description: 'Oportunidad marcada como ganada',
      });
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: 'Error',
        description: 'No se pudo actualizar la oportunidad',
        variant: 'destructive',
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleMarkLost = async (reason: string) => {
    if (!opportunity) return;
    setIsUpdating(true);
    try {
      await opportunitiesService.markAsLost(opportunity.id, reason);
      setShowLossDialog(false);
      await loadData();
      toast({
        title: 'Éxito',
        description: 'Oportunidad marcada como perdida',
      });
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: 'Error',
        description: 'No se pudo actualizar la oportunidad',
        variant: 'destructive',
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDuplicate = async () => {
    if (!opportunity) return;
    setIsUpdating(true);
    try {
      const newOpp = await opportunitiesService.duplicateOpportunity(opportunity.id);
      toast({
        title: 'Éxito',
        description: 'Oportunidad duplicada correctamente',
      });
      router.push(`/app/crm/oportunidades/${newOpp.id}`);
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: 'Error',
        description: 'No se pudo duplicar la oportunidad',
        variant: 'destructive',
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDelete = async () => {
    if (!opportunity || !confirm('¿Estás seguro de eliminar esta oportunidad?')) return;
    setIsUpdating(true);
    try {
      await opportunitiesService.deleteOpportunity(opportunity.id);
      toast({
        title: 'Éxito',
        description: 'Oportunidad eliminada correctamente',
      });
      router.push('/app/crm/oportunidades');
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: 'Error',
        description: 'No se pudo eliminar la oportunidad',
        variant: 'destructive',
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleAddActivity = async () => {
    if (!opportunity || !newActivityNotes.trim()) return;
    setIsAddingActivity(true);
    try {
      await opportunitiesService.createActivity(opportunity.id, newActivityType, newActivityNotes);
      setNewActivityNotes('');
      await loadData();
      toast({
        title: 'Éxito',
        description: 'Actividad registrada correctamente',
      });
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: 'Error',
        description: 'No se pudo registrar la actividad',
        variant: 'destructive',
      });
    } finally {
      setIsAddingActivity(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'open':
        return (
          <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
            Abierta
          </Badge>
        );
      case 'won':
        return (
          <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
            Ganada
          </Badge>
        );
      case 'lost':
        return (
          <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
            Perdida
          </Badge>
        );
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'call':
        return <Phone className="h-4 w-4" />;
      case 'email':
        return <Mail className="h-4 w-4" />;
      case 'meeting':
        return <Calendar className="h-4 w-4" />;
      case 'note':
        return <MessageSquare className="h-4 w-4" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };

  const getActivityLabel = (type: string) => {
    const labels: Record<string, string> = {
      call: 'Llamada',
      email: 'Email',
      meeting: 'Reunión',
      note: 'Nota',
      task: 'Tarea',
    };
    return labels[type] || type;
  };

  if (isLoading) {
    return (
      <div className="space-y-6 p-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10 rounded-full" />
          <Skeleton className="h-8 w-64" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Skeleton className="h-64 lg:col-span-2" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (!opportunity) {
    return (
      <div className="p-6 text-center">
        <p className="text-gray-500 dark:text-gray-400">Oportunidad no encontrada</p>
        <Button onClick={() => router.back()} className="mt-4">
          Volver
        </Button>
      </div>
    );
  }

  const productsTotal = products.reduce((sum, p) => sum + (p.total_price || 0), 0);
  const displayAmount = products.length > 0 ? productsTotal : opportunity.amount;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.back()}
            className="text-gray-600 dark:text-gray-400"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{opportunity.name}</h1>
            <div className="flex items-center gap-2 mt-1">
              {getStatusBadge(opportunity.status)}
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {opportunity.pipeline?.name}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {opportunity.status === 'open' && (
            <>
              <Button
                variant="outline"
                onClick={handleMarkWon}
                disabled={isUpdating}
                className="text-green-600 border-green-200 hover:bg-green-50 dark:border-green-800 dark:hover:bg-green-900/20"
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                Marcar ganada
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowLossDialog(true)}
                disabled={isUpdating}
                className="text-red-600 border-red-200 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/20"
              >
                <XCircle className="h-4 w-4 mr-2" />
                Marcar perdida
              </Button>
            </>
          )}
          <Button
            variant="outline"
            onClick={() => router.push(`/app/crm/oportunidades/${opportunity.id}/editar`)}
            className="border-gray-200 dark:border-gray-700"
          >
            <Edit className="h-4 w-4 mr-2" />
            Editar
          </Button>
          <Button
            variant="outline"
            onClick={handleDuplicate}
            disabled={isUpdating}
            className="border-gray-200 dark:border-gray-700"
          >
            <Copy className="h-4 w-4 mr-2" />
            Duplicar
          </Button>
          <Button
            variant="outline"
            onClick={handleDelete}
            disabled={isUpdating}
            className="text-red-600 border-red-200 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/20"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Eliminar
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Información principal */}
        <div className="lg:col-span-2 space-y-6">
          {/* Etapas del pipeline */}
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="text-gray-900 dark:text-white">Etapa actual</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {stages.map((stage) => (
                  <Button
                    key={stage.id}
                    variant={stage.id === opportunity.stage_id ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => handleStageChange(stage.id)}
                    disabled={isUpdating || opportunity.status !== 'open'}
                    className={
                      stage.id === opportunity.stage_id
                        ? 'bg-blue-600 hover:bg-blue-700 text-white'
                        : 'border-gray-200 dark:border-gray-700'
                    }
                  >
                    <div
                      className="w-2 h-2 rounded-full mr-2"
                      style={{ backgroundColor: stage.color }}
                    />
                    {stage.name}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Tabs */}
          <Tabs defaultValue="products" className="w-full">
            <TabsList className="bg-gray-100 dark:bg-gray-800">
              <TabsTrigger value="products">Productos ({products.length})</TabsTrigger>
              <TabsTrigger value="activities">Actividades ({activities.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="products">
              <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                <CardContent className="pt-6">
                  {products.length === 0 ? (
                    <p className="text-center text-gray-500 dark:text-gray-400 py-4">
                      No hay productos cotizados
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {products.map((product) => (
                        <div
                          key={product.id}
                          className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-lg"
                        >
                          <div>
                            <p className="font-medium text-gray-900 dark:text-white">
                              {product.product?.name || 'Producto'}
                            </p>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                              {product.quantity} x {formatCurrency(product.unit_price)}
                            </p>
                          </div>
                          <p className="font-medium text-gray-900 dark:text-white">
                            {formatCurrency(product.total_price)}
                          </p>
                        </div>
                      ))}
                      <div className="flex justify-between pt-3 border-t border-gray-200 dark:border-gray-700">
                        <span className="font-bold text-gray-900 dark:text-white">Total</span>
                        <span className="font-bold text-gray-900 dark:text-white">
                          {formatCurrency(productsTotal)}
                        </span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="activities">
              <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                <CardContent className="pt-6 space-y-4">
                  {/* Nueva actividad */}
                  <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg space-y-3">
                    <div className="flex gap-2">
                      <Select
                        value={newActivityType}
                        onValueChange={(v) => setNewActivityType(v as Activity['activity_type'])}
                      >
                        <SelectTrigger className="w-32 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-white dark:bg-gray-800">
                          <SelectItem value="note">Nota</SelectItem>
                          <SelectItem value="call">Llamada</SelectItem>
                          <SelectItem value="email">Email</SelectItem>
                          <SelectItem value="meeting">Reunión</SelectItem>
                          <SelectItem value="task">Tarea</SelectItem>
                        </SelectContent>
                      </Select>
                      <Textarea
                        value={newActivityNotes}
                        onChange={(e) => setNewActivityNotes(e.target.value)}
                        placeholder="Escribe una nota o actividad..."
                        className="flex-1 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                        rows={2}
                      />
                    </div>
                    <div className="flex justify-end">
                      <Button
                        onClick={handleAddActivity}
                        disabled={isAddingActivity || !newActivityNotes.trim()}
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                      >
                        {isAddingActivity && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        <Plus className="h-4 w-4 mr-2" />
                        Agregar
                      </Button>
                    </div>
                  </div>

                  {/* Lista de actividades */}
                  {activities.length === 0 ? (
                    <p className="text-center text-gray-500 dark:text-gray-400 py-4">
                      No hay actividades registradas
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {activities.map((activity) => (
                        <div
                          key={activity.id}
                          className="flex gap-3 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg"
                        >
                          <div className="flex-shrink-0 w-8 h-8 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center text-blue-600 dark:text-blue-400">
                            {getActivityIcon(activity.activity_type)}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="text-xs">
                                {getActivityLabel(activity.activity_type)}
                              </Badge>
                              <span className="text-xs text-gray-500 dark:text-gray-400">
                                {format(new Date(activity.occurred_at), 'dd/MM/yyyy HH:mm', {
                                  locale: es,
                                })}
                              </span>
                            </div>
                            <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">
                              {activity.notes}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Resumen */}
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="text-gray-900 dark:text-white">Resumen</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                  <DollarSign className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Monto</p>
                  <p className="text-lg font-bold text-gray-900 dark:text-white">
                    {formatCurrency(displayAmount)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                  <Target className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Probabilidad</p>
                  <p className="text-lg font-bold text-gray-900 dark:text-white">
                    {opportunity.stage?.probability
                      ? `${(opportunity.stage.probability * 100).toFixed(0)}%`
                      : '-'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                  <Calendar className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Fecha cierre</p>
                  <p className="text-lg font-bold text-gray-900 dark:text-white">
                    {opportunity.expected_close_date
                      ? format(new Date(opportunity.expected_close_date), 'dd/MM/yyyy', {
                          locale: es,
                        })
                      : '-'}
                  </p>
                </div>
              </div>

              {opportunity.loss_reason && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                  <p className="text-sm font-medium text-red-600 dark:text-red-400">
                    Razón de pérdida:
                  </p>
                  <p className="text-sm text-red-700 dark:text-red-300">
                    {opportunity.loss_reason}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Cliente */}
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="text-gray-900 dark:text-white">Cliente</CardTitle>
            </CardHeader>
            <CardContent>
              {opportunity.customer ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-gray-100 dark:bg-gray-700 rounded-full">
                      <User className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">
                        {opportunity.customer.full_name}
                      </p>
                    </div>
                  </div>
                  {opportunity.customer.email && (
                    <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                      <Mail className="h-4 w-4" />
                      {opportunity.customer.email}
                    </div>
                  )}
                  {opportunity.customer.phone && (
                    <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                      <Phone className="h-4 w-4" />
                      {opportunity.customer.phone}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400">Sin cliente asignado</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Loss Reason Dialog */}
      <LossReasonDialog
        open={showLossDialog}
        onOpenChange={setShowLossDialog}
        onConfirm={handleMarkLost}
        isLoading={isUpdating}
      />
    </div>
  );
}
