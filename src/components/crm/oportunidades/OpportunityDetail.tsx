'use client';

import { useState, useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RichTextEditor } from '@/components/shared/RichTextEditor';
import { HtmlContentRenderer } from '@/components/shared/HtmlContentRenderer';
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
  Package,
  BedDouble,
  FileText,
  TrendingUp,
  CheckSquare,
  Square,
  Pin,
  PinOff,
  StickyNote,
  ListTodo,
  BarChart3,
  MapPin,
  Building2,
  IdCard,
  Tag,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { formatCurrency } from '@/utils/Utils';
import { opportunitiesService } from './opportunitiesService';
import { Opportunity, OpportunityProduct, OpportunitySpace, OpportunityCustomLine, Activity, Stage, OpportunityTask, OpportunityNote, CustomerDetails, LossReasonData } from './types';
import { LossReasonDialog } from './LossReasonDialog';

interface OpportunityDetailProps {
  opportunityId: string;
}

export function OpportunityDetail({ opportunityId }: OpportunityDetailProps) {
  const router = useRouter();

  const [opportunity, setOpportunity] = useState<Opportunity | null>(null);
  const [products, setProducts] = useState<OpportunityProduct[]>([]);
  const [spaces, setSpaces] = useState<OpportunitySpace[]>([]);
  const [customLines, setCustomLines] = useState<OpportunityCustomLine[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [tasks, setTasks] = useState<OpportunityTask[]>([]);
  const [notes, setNotes] = useState<OpportunityNote[]>([]);
  const [customerDetails, setCustomerDetails] = useState<CustomerDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);

  const [showLossDialog, setShowLossDialog] = useState(false);
  const [newActivityType, setNewActivityType] = useState<Activity['activity_type']>('note');
  const [newActivityNotes, setNewActivityNotes] = useState('');
  const [isAddingActivity, setIsAddingActivity] = useState(false);

  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState('medium');
  const [newTaskDueDate, setNewTaskDueDate] = useState('');
  const [isAddingTask, setIsAddingTask] = useState(false);

  const [newNoteBody, setNewNoteBody] = useState('');
  const [isAddingNote, setIsAddingNote] = useState(false);

  useEffect(() => {
    loadData();
  }, [opportunityId]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [oppData, productsData, spacesData, customData, activitiesData, tasksData, notesData] = await Promise.all([
        opportunitiesService.getOpportunityById(opportunityId),
        opportunitiesService.getOpportunityProducts(opportunityId),
        opportunitiesService.getOpportunitySpaces(opportunityId),
        opportunitiesService.getOpportunityCustomLines(opportunityId),
        opportunitiesService.getOpportunityActivities(opportunityId),
        opportunitiesService.getOpportunityTasks(opportunityId),
        opportunitiesService.getOpportunityNotes(opportunityId),
      ]);

      setOpportunity(oppData);
      setProducts(productsData);
      setSpaces(spacesData);
      setCustomLines(customData);
      setActivities(activitiesData);
      setTasks(tasksData);
      setNotes(notesData);

      if (oppData?.customer_id) {
        const custDetails = await opportunitiesService.getCustomerDetails(oppData.customer_id);
        setCustomerDetails(custDetails);
      }

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

  const handleMarkLost = async (data: LossReasonData) => {
    if (!opportunity) return;
    setIsUpdating(true);
    try {
      await opportunitiesService.markAsLost(opportunity.id, data);
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

  const handleAddTask = async () => {
    if (!opportunity || !newTaskTitle.trim()) return;
    setIsAddingTask(true);
    try {
      await opportunitiesService.createTask(opportunity.id, newTaskTitle, {
        priority: newTaskPriority,
        due_date: newTaskDueDate || undefined,
      });
      setNewTaskTitle('');
      setNewTaskPriority('medium');
      setNewTaskDueDate('');
      await loadData();
      toast({
        title: 'Éxito',
        description: 'Tarea creada correctamente',
      });
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: 'Error',
        description: 'No se pudo crear la tarea',
        variant: 'destructive',
      });
    } finally {
      setIsAddingTask(false);
    }
  };

  const handleToggleTask = async (taskId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'done' || currentStatus === 'completed' ? 'open' : 'done';
    try {
      await opportunitiesService.updateTask(taskId, { status: newStatus });
      await loadData();
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: 'Error',
        description: 'No se pudo actualizar la tarea',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm('¿Eliminar esta tarea?')) return;
    try {
      await opportunitiesService.deleteTask(taskId);
      await loadData();
      toast({ title: 'Éxito', description: 'Tarea eliminada' });
    } catch (error) {
      console.error('Error:', error);
      toast({ title: 'Error', description: 'No se pudo eliminar', variant: 'destructive' });
    }
  };

  const handleAddNote = async () => {
    if (!opportunity || !newNoteBody.trim()) return;
    setIsAddingNote(true);
    try {
      await opportunitiesService.createNote(opportunity.id, newNoteBody);
      setNewNoteBody('');
      await loadData();
      toast({ title: 'Éxito', description: 'Nota agregada correctamente' });
    } catch (error) {
      console.error('Error:', error);
      toast({ title: 'Error', description: 'No se pudo agregar la nota', variant: 'destructive' });
    } finally {
      setIsAddingNote(false);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!confirm('¿Eliminar esta nota?')) return;
    try {
      await opportunitiesService.deleteNote(noteId);
      await loadData();
      toast({ title: 'Éxito', description: 'Nota eliminada' });
    } catch (error) {
      console.error('Error:', error);
      toast({ title: 'Error', description: 'No se pudo eliminar', variant: 'destructive' });
    }
  };

  const handleTogglePin = async (noteId: string, isPinned: boolean) => {
    try {
      await opportunitiesService.toggleNotePin(noteId, isPinned);
      await loadData();
    } catch (error) {
      console.error('Error:', error);
      toast({ title: 'Error', description: 'No se pudo actualizar', variant: 'destructive' });
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
  const spacesTotal = spaces.reduce((sum, s) => sum + (s.total_price || 0), 0);
  const customTotal = customLines.reduce((sum, c) => sum + (c.total_price || 0), 0);
  const lineItemsTotal = productsTotal + spacesTotal + customTotal;
  const displayAmount = lineItemsTotal > 0 ? lineItemsTotal : opportunity.amount;
  const totalItems = products.length + spaces.length + customLines.length;

  return (
    <div className="space-y-6">
      {/* Header tipo CRM moderno */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-5 sm:p-6">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.back()}
              className="text-gray-600 dark:text-gray-400 shrink-0"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white truncate">
                  {opportunity.name}
                </h1>
                {getStatusBadge(opportunity.status)}
              </div>
              <div className="flex items-center gap-3 mt-2 text-sm text-gray-500 dark:text-gray-400 flex-wrap">
                <span className="flex items-center gap-1">
                  <Target className="h-3.5 w-3.5" />
                  {opportunity.pipeline?.name}
                </span>
                <span className="text-gray-300 dark:text-gray-600">|</span>
                <span className="flex items-center gap-1">
                  <DollarSign className="h-3.5 w-3.5" />
                  {formatCurrency(displayAmount)}
                </span>
                {opportunity.expected_close_date && (
                  <>
                    <span className="text-gray-300 dark:text-gray-600">|</span>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      {format(new Date(opportunity.expected_close_date), 'dd MMM yyyy', { locale: es })}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 shrink-0">
            {opportunity.status === 'open' && (
              <>
                <Button
                  size="sm"
                  onClick={handleMarkWon}
                  disabled={isUpdating}
                  className="bg-green-600 hover:bg-green-700 text-white border-0"
                >
                  <CheckCircle className="h-4 w-4 mr-1.5" />
                  Ganar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowLossDialog(true)}
                  disabled={isUpdating}
                  className="text-red-600 border-red-200 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/20"
                >
                  <XCircle className="h-4 w-4 mr-1.5" />
                  Perder
                </Button>
              </>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => router.push(`/app/crm/oportunidades/${opportunity.id}/editar`)}
              className="border-gray-200 dark:border-gray-700"
            >
              <Edit className="h-4 w-4 mr-1.5" />
              Editar
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleDuplicate}
              disabled={isUpdating}
              className="border-gray-200 dark:border-gray-700"
            >
              <Copy className="h-4 w-4 mr-1.5" />
              Duplicar
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleDelete}
              disabled={isUpdating}
              className="text-red-600 border-red-200 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/20"
            >
              <Trash2 className="h-4 w-4 mr-1.5" />
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Columna principal - 2/3 */}
        <div className="lg:col-span-2 space-y-6">
          {/* Pipeline visual tipo funnel */}
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-blue-500" />
                Pipeline
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-1 overflow-x-auto pb-2">
                {stages.map((stage, idx) => (
                  <div key={stage.id} className="flex items-center shrink-0">
                    <button
                      onClick={() => handleStageChange(stage.id)}
                      disabled={isUpdating || opportunity.status !== 'open'}
                      className={`px-3 py-2 rounded-lg text-xs font-medium transition-all flex items-center gap-2 ${
                        stage.id === opportunity.stage_id
                          ? 'bg-blue-600 text-white shadow-md'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                      } ${isUpdating || opportunity.status !== 'open' ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: stage.color }}
                      />
                      {stage.name}
                      {stage.probability && (
                        <span className={`text-[10px] ${stage.id === opportunity.stage_id ? 'text-blue-200' : 'text-gray-400'}`}>
                          {(stage.probability).toFixed(0)}%
                        </span>
                      )}
                    </button>
                    {idx < stages.length - 1 && (
                      <div className="w-2 h-px bg-gray-300 dark:bg-gray-600 mx-0.5" />
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Tabs de contenido */}
          <Tabs defaultValue="products" className="w-full">
            <TabsList className="bg-gray-100 dark:bg-gray-800 w-full justify-start h-auto p-1 flex-wrap">
              <TabsTrigger value="products" className="text-xs gap-1.5">
                <Package className="h-3.5 w-3.5" />
                Productos ({products.length})
              </TabsTrigger>
              <TabsTrigger value="spaces" className="text-xs gap-1.5">
                <BedDouble className="h-3.5 w-3.5" />
                Espacios ({spaces.length})
              </TabsTrigger>
              <TabsTrigger value="custom" className="text-xs gap-1.5">
                <FileText className="h-3.5 w-3.5" />
                Conceptos ({customLines.length})
              </TabsTrigger>
              <TabsTrigger value="activities" className="text-xs gap-1.5">
                <MessageSquare className="h-3.5 w-3.5" />
                Actividades ({activities.length})
              </TabsTrigger>
              <TabsTrigger value="tasks" className="text-xs gap-1.5">
                <ListTodo className="h-3.5 w-3.5" />
                Tareas ({tasks.length})
              </TabsTrigger>
              <TabsTrigger value="notes" className="text-xs gap-1.5">
                <StickyNote className="h-3.5 w-3.5" />
                Notas ({notes.length})
              </TabsTrigger>
              <TabsTrigger value="timeline" className="text-xs gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                Timeline
              </TabsTrigger>
              <TabsTrigger value="analytics" className="text-xs gap-1.5">
                <BarChart3 className="h-3.5 w-3.5" />
                Analítica
              </TabsTrigger>
            </TabsList>

            {/* Tab Productos */}
            <TabsContent value="products">
              <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                <CardContent className="pt-6">
                  {products.length === 0 ? (
                    <div className="text-center py-8">
                      <Package className="h-10 w-10 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                      <p className="text-sm text-gray-500 dark:text-gray-400">No hay productos cotizados</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {products.map((product) => (
                        <div
                          key={product.id}
                          className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-100 dark:border-gray-800"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-9 h-9 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                              <Package className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium text-sm text-gray-900 dark:text-white truncate">
                                {product.product?.name || 'Producto'}
                              </p>
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                {product.quantity} x {formatCurrency(product.unit_price)}
                              </p>
                            </div>
                          </div>
                          <p className="font-semibold text-sm text-gray-900 dark:text-white shrink-0">
                            {formatCurrency(product.total_price)}
                          </p>
                        </div>
                      ))}
                      {products.length > 0 && (
                        <div className="flex justify-between pt-3 border-t border-gray-200 dark:border-gray-700">
                          <span className="font-bold text-sm text-gray-900 dark:text-white">Subtotal productos</span>
                          <span className="font-bold text-sm text-gray-900 dark:text-white">
                            {formatCurrency(productsTotal)}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Tab Espacios */}
            <TabsContent value="spaces">
              <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                <CardContent className="pt-6">
                  {spaces.length === 0 ? (
                    <div className="text-center py-8">
                      <BedDouble className="h-10 w-10 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                      <p className="text-sm text-gray-500 dark:text-gray-400">No hay espacios cotizados</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {spaces.map((space) => (
                        <div
                          key={space.id}
                          className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-100 dark:border-gray-800"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-9 h-9 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center shrink-0">
                              <BedDouble className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium text-sm text-gray-900 dark:text-white truncate">
                                {space.space?.label || 'Espacio'}
                              </p>
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                {space.nights} noche{space.nights !== 1 ? 's' : ''} x {formatCurrency(space.unit_price)}
                              </p>
                            </div>
                          </div>
                          <p className="font-semibold text-sm text-gray-900 dark:text-white shrink-0">
                            {formatCurrency(space.total_price)}
                          </p>
                        </div>
                      ))}
                      {spaces.length > 0 && (
                        <div className="flex justify-between pt-3 border-t border-gray-200 dark:border-gray-700">
                          <span className="font-bold text-sm text-gray-900 dark:text-white">Subtotal espacios</span>
                          <span className="font-bold text-sm text-gray-900 dark:text-white">
                            {formatCurrency(spacesTotal)}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Tab Conceptos */}
            <TabsContent value="custom">
              <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                <CardContent className="pt-6">
                  {customLines.length === 0 ? (
                    <div className="text-center py-8">
                      <FileText className="h-10 w-10 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                      <p className="text-sm text-gray-500 dark:text-gray-400">No hay conceptos personalizados</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {customLines.map((line) => (
                        <div
                          key={line.id}
                          className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-100 dark:border-gray-800"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-9 h-9 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
                              <FileText className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium text-sm text-gray-900 dark:text-white truncate">
                                {line.concept}
                              </p>
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                {line.quantity} x {formatCurrency(line.unit_price)}
                              </p>
                            </div>
                          </div>
                          <p className="font-semibold text-sm text-gray-900 dark:text-white shrink-0">
                            {formatCurrency(line.total_price)}
                          </p>
                        </div>
                      ))}
                      {customLines.length > 0 && (
                        <div className="flex justify-between pt-3 border-t border-gray-200 dark:border-gray-700">
                          <span className="font-bold text-sm text-gray-900 dark:text-white">Subtotal conceptos</span>
                          <span className="font-bold text-sm text-gray-900 dark:text-white">
                            {formatCurrency(customTotal)}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Tab Actividades */}
            <TabsContent value="activities">
              <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                <CardContent className="pt-6 space-y-4">
                  {/* Nueva actividad */}
                  <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg space-y-3 border border-gray-100 dark:border-gray-800">
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
                      <RichTextEditor
                        value={newActivityNotes}
                        onChange={setNewActivityNotes}
                        placeholder="Escribe una nota o actividad..."
                        minHeight={60}
                        className="flex-1 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                      />
                    </div>
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        onClick={handleAddActivity}
                        disabled={isAddingActivity || !newActivityNotes.trim()}
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                      >
                        {isAddingActivity && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        <Plus className="h-4 w-4 mr-1.5" />
                        Agregar
                      </Button>
                    </div>
                  </div>

                  {/* Timeline de actividades */}
                  {activities.length === 0 ? (
                    <div className="text-center py-8">
                      <Clock className="h-10 w-10 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                      <p className="text-sm text-gray-500 dark:text-gray-400">No hay actividades registradas</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {activities.map((activity) => (
                        <div
                          key={activity.id}
                          className="flex gap-3 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-100 dark:border-gray-800"
                        >
                          <div className="flex-shrink-0 w-8 h-8 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center text-blue-600 dark:text-blue-400">
                            {getActivityIcon(activity.activity_type)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
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

            {/* Tab Tareas */}
            <TabsContent value="tasks">
              <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                <CardContent className="pt-6 space-y-4">
                  {/* Nueva tarea */}
                  <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg space-y-3 border border-gray-100 dark:border-gray-800">
                    <input
                      type="text"
                      value={newTaskTitle}
                      onChange={(e) => setNewTaskTitle(e.target.value)}
                      placeholder="Título de la tarea..."
                      className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <div className="flex gap-2 flex-wrap">
                      <Select value={newTaskPriority} onValueChange={setNewTaskPriority}>
                        <SelectTrigger className="w-32 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-white dark:bg-gray-800">
                          <SelectItem value="low">Baja</SelectItem>
                          <SelectItem value="medium">Media</SelectItem>
                          <SelectItem value="high">Alta</SelectItem>
                          <SelectItem value="urgent">Urgente</SelectItem>
                        </SelectContent>
                      </Select>
                      <input
                        type="date"
                        value={newTaskDueDate}
                        onChange={(e) => setNewTaskDueDate(e.target.value)}
                        className="px-3 py-2 text-xs bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md"
                      />
                      <Button
                        size="sm"
                        onClick={handleAddTask}
                        disabled={isAddingTask || !newTaskTitle.trim()}
                        className="bg-blue-600 hover:bg-blue-700 text-white ml-auto"
                      >
                        {isAddingTask && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        <Plus className="h-4 w-4 mr-1.5" />
                        Agregar
                      </Button>
                    </div>
                  </div>

                  {/* Lista de tareas */}
                  {tasks.length === 0 ? (
                    <div className="text-center py-8">
                      <ListTodo className="h-10 w-10 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                      <p className="text-sm text-gray-500 dark:text-gray-400">No hay tareas registradas</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {tasks.map((task) => {
                        const isDone = task.status === 'done' || task.status === 'completed';
                        const priorityColors: Record<string, string> = {
                          urgent: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
                          high: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
                          medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
                          low: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
                        };
                        return (
                          <div
                            key={task.id}
                            className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-100 dark:border-gray-800"
                          >
                            <button
                              onClick={() => handleToggleTask(task.id, task.status)}
                              className="mt-0.5 shrink-0"
                            >
                              {isDone ? (
                                <CheckSquare className="h-5 w-5 text-green-500" />
                              ) : (
                                <Square className="h-5 w-5 text-gray-400" />
                              )}
                            </button>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className={`text-sm font-medium ${isDone ? 'line-through text-gray-400' : 'text-gray-900 dark:text-white'}`}>
                                  {task.title}
                                </p>
                                {task.priority && (
                                  <Badge variant="secondary" className={`text-xs ${priorityColors[task.priority] || ''}`}>
                                    {task.priority}
                                  </Badge>
                                )}
                              </div>
                              {task.description && (
                                <HtmlContentRenderer html={task.description} className="mt-1 text-xs text-gray-500 dark:text-gray-400" />
                              )}
                              <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-400">
                                {task.due_date && (
                                  <span className="flex items-center gap-1">
                                    <Calendar className="h-3 w-3" />
                                    {format(new Date(task.due_date), 'dd/MM/yyyy', { locale: es })}
                                  </span>
                                )}
                                <span>{formatDistanceToNow(new Date(task.created_at), { addSuffix: true, locale: es })}</span>
                              </div>
                            </div>
                            <button
                              onClick={() => handleDeleteTask(task.id)}
                              className="shrink-0 text-gray-400 hover:text-red-500"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Tab Notas */}
            <TabsContent value="notes">
              <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                <CardContent className="pt-6 space-y-4">
                  {/* Nueva nota */}
                  <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg space-y-3 border border-gray-100 dark:border-gray-800">
                    <RichTextEditor
                      value={newNoteBody}
                      onChange={setNewNoteBody}
                      placeholder="Escribe una nota..."
                      minHeight={80}
                      className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                    />
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        onClick={handleAddNote}
                        disabled={isAddingNote || !newNoteBody.trim()}
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                      >
                        {isAddingNote && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        <Plus className="h-4 w-4 mr-1.5" />
                        Agregar Nota
                      </Button>
                    </div>
                  </div>

                  {/* Lista de notas */}
                  {notes.length === 0 ? (
                    <div className="text-center py-8">
                      <StickyNote className="h-10 w-10 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                      <p className="text-sm text-gray-500 dark:text-gray-400">No hay notas registradas</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {notes.map((note) => (
                        <div
                          key={note.id}
                          className={`p-3 rounded-lg border ${
                            note.is_pinned
                              ? 'bg-yellow-50 dark:bg-yellow-900/10 border-yellow-200 dark:border-yellow-800'
                              : 'bg-gray-50 dark:bg-gray-900 border-gray-100 dark:border-gray-800'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <HtmlContentRenderer html={note.body} className="text-sm text-gray-700 dark:text-gray-300 flex-1" />
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                onClick={() => handleTogglePin(note.id, note.is_pinned)}
                                className="text-gray-400 hover:text-yellow-500"
                                title={note.is_pinned ? 'Desfijar' : 'Fijar'}
                              >
                                {note.is_pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                              </button>
                              <button
                                onClick={() => handleDeleteNote(note.id)}
                                className="text-gray-400 hover:text-red-500"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
                            {note.user?.first_name && (
                              <span>{note.user.first_name} {note.user.last_name}</span>
                            )}
                            <span>{formatDistanceToNow(new Date(note.created_at), { addSuffix: true, locale: es })}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Tab Timeline */}
            <TabsContent value="timeline">
              <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                <CardContent className="pt-6">
                  {(() => {
                    const timelineItems: {
                      id: string;
                      type: string;
                      date: string;
                      title: string;
                      description: string | null;
                    }[] = [
                      ...activities.map(a => ({ id: `act-${a.id}`, type: 'activity', date: a.occurred_at, title: `Actividad: ${getActivityLabel(a.activity_type)}`, description: a.notes })),
                      ...tasks.map(t => ({ id: `task-${t.id}`, type: 'task', date: t.created_at, title: `Tarea: ${t.title}`, description: t.description })),
                      ...notes.map(n => ({ id: `note-${n.id}`, type: 'note', date: n.created_at, title: 'Nota', description: n.body })),
                    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

                    if (timelineItems.length === 0) {
                      return (
                        <div className="text-center py-8">
                          <Clock className="h-10 w-10 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                          <p className="text-sm text-gray-500 dark:text-gray-400">No hay eventos en el timeline</p>
                        </div>
                      );
                    }

                    const typeConfig: Record<string, { icon: ReactNode; bg: string; color: string }> = {
                      activity: { icon: <MessageSquare className="h-4 w-4" />, bg: 'bg-blue-100 dark:bg-blue-900/30', color: 'text-blue-600 dark:text-blue-400' },
                      task: { icon: <ListTodo className="h-4 w-4" />, bg: 'bg-purple-100 dark:bg-purple-900/30', color: 'text-purple-600 dark:text-purple-400' },
                      note: { icon: <StickyNote className="h-4 w-4" />, bg: 'bg-amber-100 dark:bg-amber-900/30', color: 'text-amber-600 dark:text-amber-400' },
                    };

                    return (
                      <div className="relative">
                        <div className="absolute top-0 left-4 bottom-0 w-0.5 bg-gray-200 dark:bg-gray-700" />
                        <div className="space-y-4">
                          {timelineItems.map((item) => {
                            const config = typeConfig[item.type] || typeConfig.activity;
                            return (
                              <div key={item.id} className="relative pl-10">
                                <div className={`absolute left-0 p-1.5 rounded-full ${config.bg} ${config.color}`}>
                                  {config.icon}
                                </div>
                                <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3">
                                  <div className="flex justify-between items-start gap-2 mb-1">
                                    <p className="text-sm font-medium text-gray-900 dark:text-white">{item.title}</p>
                                    <span className="text-xs text-gray-400 shrink-0">
                                      {format(new Date(item.date), 'dd/MM/yyyy HH:mm', { locale: es })}
                                    </span>
                                  </div>
                                  {item.description && (
                                    <HtmlContentRenderer html={item.description} className="text-xs text-gray-600 dark:text-gray-400" />
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Tab Analítica */}
            <TabsContent value="analytics">
              <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                <CardContent className="pt-6 space-y-4">
                  {(() => {
                    const tasksDone = tasks.filter(t => t.status === 'done' || t.status === 'completed').length;
                    const activitiesByType: Record<string, number> = {};
                    activities.forEach(a => {
                      activitiesByType[a.activity_type] = (activitiesByType[a.activity_type] || 0) + 1;
                    });
                    const taskCompletionRate = tasks.length > 0 ? Math.round((tasksDone / tasks.length) * 100) : 0;
                    const daysOpen = opportunity ? Math.ceil((Date.now() - new Date(opportunity.created_at).getTime()) / 86400000) : 0;
                    const stageProbability = opportunity?.stage?.probability || 0;

                    return (
                      <>
                        {/* Métricas principales */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-800">
                            <p className="text-xs text-blue-600 dark:text-blue-400 font-medium">Días abierta</p>
                            <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{daysOpen}</p>
                          </div>
                          <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-100 dark:border-green-800">
                            <p className="text-xs text-green-600 dark:text-green-400 font-medium">Tareas completadas</p>
                            <p className="text-2xl font-bold text-green-700 dark:text-green-300">{tasksDone}/{tasks.length}</p>
                          </div>
                          <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-100 dark:border-purple-800">
                            <p className="text-xs text-purple-600 dark:text-purple-400 font-medium">Probabilidad</p>
                            <p className="text-2xl font-bold text-purple-700 dark:text-purple-300">{stageProbability.toFixed(0)}%</p>
                          </div>
                          <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-100 dark:border-amber-800">
                            <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">Actividades</p>
                            <p className="text-2xl font-bold text-amber-700 dark:text-amber-300">{activities.length}</p>
                          </div>
                        </div>

                        {/* Progreso de tareas */}
                        {tasks.length > 0 && (
                          <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                            <div className="flex justify-between items-center mb-2">
                              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Progreso de tareas</p>
                              <span className="text-sm font-bold text-gray-900 dark:text-white">{taskCompletionRate}%</span>
                            </div>
                            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                              <div
                                className="bg-green-500 h-2.5 rounded-full transition-all"
                                style={{ width: `${taskCompletionRate}%` }}
                              />
                            </div>
                          </div>
                        )}

                        {/* Distribución de actividades */}
                        {Object.keys(activitiesByType).length > 0 && (
                          <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Distribución de actividades</p>
                            <div className="space-y-2">
                              {Object.entries(activitiesByType).map(([type, count]) => {
                                const max = Math.max(...Object.values(activitiesByType));
                                const width = (count / max) * 100;
                                return (
                                  <div key={type} className="flex items-center gap-2">
                                    <span className="text-xs text-gray-500 dark:text-gray-400 w-20">{getActivityLabel(type)}</span>
                                    <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                                      <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${width}%` }} />
                                    </div>
                                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300 w-6 text-right">{count}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Resumen del pipeline */}
                        <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Estado en pipeline</p>
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-gray-500 dark:text-gray-400">Etapa actual</span>
                              <span className="font-medium text-gray-900 dark:text-white">{opportunity?.stage?.name || '-'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-500 dark:text-gray-400">Valor estimado</span>
                              <span className="font-medium text-gray-900 dark:text-white">{formatCurrency(displayAmount)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-500 dark:text-gray-400">Valor ponderado</span>
                              <span className="font-medium text-blue-600 dark:text-blue-400">
                                {formatCurrency(displayAmount * (opportunity?.stage?.probability || 0) / 100)}
                              </span>
                            </div>
                            {opportunity?.expected_close_date && (
                              <div className="flex justify-between">
                                <span className="text-gray-500 dark:text-gray-400">Cierre estimado</span>
                                <span className="font-medium text-gray-900 dark:text-white">
                                  {format(new Date(opportunity.expected_close_date), 'dd/MM/yyyy', { locale: es })}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* Sidebar derecho - 1/3 */}
        <div className="space-y-5">
          {/* Card de valor total - destacado */}
          <Card className="bg-gradient-to-br from-blue-600 to-blue-700 dark:from-blue-700 dark:to-blue-800 border-0 text-white">
            <CardContent className="pt-6">
              <p className="text-blue-100 text-xs font-medium uppercase tracking-wide">Valor total</p>
              <p className="text-3xl font-bold mt-1">{formatCurrency(displayAmount)}</p>
              {totalItems > 0 && (
                <p className="text-blue-200 text-xs mt-2">
                  {totalItems} {totalItems === 1 ? 'item' : 'items'} cotizados
                </p>
              )}
              {lineItemsTotal > 0 && (
                <div className="mt-4 space-y-1.5 text-xs text-blue-100">
                  {products.length > 0 && (
                    <div className="flex justify-between">
                      <span>Productos</span>
                      <span>{formatCurrency(productsTotal)}</span>
                    </div>
                  )}
                  {spaces.length > 0 && (
                    <div className="flex justify-between">
                      <span>Espacios</span>
                      <span>{formatCurrency(spacesTotal)}</span>
                    </div>
                  )}
                  {customLines.length > 0 && (
                    <div className="flex justify-between">
                      <span>Conceptos</span>
                      <span>{formatCurrency(customTotal)}</span>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Info clave */}
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardContent className="pt-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                    <Target className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                  </div>
                  <span className="text-sm text-gray-600 dark:text-gray-400">Probabilidad</span>
                </div>
                <span className="font-bold text-sm text-gray-900 dark:text-white">
                  {opportunity.stage?.probability
                    ? `${(opportunity.stage.probability).toFixed(0)}%`
                    : '-'}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                    <Calendar className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <span className="text-sm text-gray-600 dark:text-gray-400">Cierre estimado</span>
                </div>
                <span className="font-medium text-sm text-gray-900 dark:text-white">
                  {opportunity.expected_close_date
                    ? format(new Date(opportunity.expected_close_date), 'dd/MM/yyyy', { locale: es })
                    : '-'}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg">
                    <Clock className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                  </div>
                  <span className="text-sm text-gray-600 dark:text-gray-400">Creada</span>
                </div>
                <span className="font-medium text-sm text-gray-900 dark:text-white">
                  {format(new Date(opportunity.created_at), 'dd/MM/yyyy', { locale: es })}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Comisión */}
          {opportunity.commission_type && opportunity.commission_type !== 'none' && opportunity.commission_rate && opportunity.commission_rate > 0 && (
            <Card className="bg-white dark:bg-gray-800 border-blue-200 dark:border-blue-800">
              <CardContent className="pt-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                    <User className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">
                    Comisión {opportunity.commission_type === 'salesperson' ? 'de Vendedor' : 'de Intermediación'}
                  </p>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">Tasa</span>
                    <span className="font-semibold text-gray-900 dark:text-white">{opportunity.commission_rate}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">Monto</span>
                    <span className="font-semibold text-blue-600 dark:text-blue-400">
                      {formatCurrency(displayAmount * (opportunity.commission_rate || 0) / 100)}
                    </span>
                  </div>
                  {opportunity.status === 'won' && (
                    <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1 pt-1">
                      <CheckCircle className="h-3 w-3" />
                      Comisión generada
                    </p>
                  )}
                  {opportunity.status === 'open' && (
                    <p className="text-xs text-blue-600 dark:text-blue-500 pt-1">
                      Se generará al marcar como ganada
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Cliente */}
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                <User className="h-4 w-4 text-blue-500" />
                Cliente
              </CardTitle>
            </CardHeader>
            <CardContent>
              {opportunity.customer ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0">
                      {opportunity.customer.full_name?.charAt(0)?.toUpperCase() || '?'}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm text-gray-900 dark:text-white truncate">
                        {opportunity.customer.full_name}
                      </p>
                      {customerDetails?.customer_type && (
                        <Badge variant="secondary" className="text-xs mt-0.5">
                          {customerDetails.customer_type === 'company' ? 'Empresa' : 'Persona'}
                        </Badge>
                      )}
                    </div>
                  </div>
                  {opportunity.customer.email && (
                    <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                      <Mail className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{opportunity.customer.email}</span>
                    </div>
                  )}
                  {opportunity.customer.phone && (
                    <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                      <Phone className="h-3.5 w-3.5 shrink-0" />
                      <span>{opportunity.customer.phone}</span>
                    </div>
                  )}
                  {customerDetails?.identification_number && (
                    <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                      <IdCard className="h-3.5 w-3.5 shrink-0" />
                      <span>{customerDetails.identification_type || 'Doc'}: {customerDetails.identification_number}</span>
                    </div>
                  )}
                  {customerDetails?.address && (
                    <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                      <MapPin className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{customerDetails.address}</span>
                    </div>
                  )}
                  {customerDetails?.city && (
                    <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                      <Building2 className="h-3.5 w-3.5 shrink-0" />
                      <span>{customerDetails.city}</span>
                    </div>
                  )}
                  {customerDetails?.company_name && (
                    <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                      <Building2 className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{customerDetails.company_name}</span>
                    </div>
                  )}
                  {customerDetails?.tags && customerDetails.tags.length > 0 && (
                    <div className="flex items-start gap-1.5 flex-wrap pt-1">
                      <Tag className="h-3 w-3 text-gray-400 mt-0.5 shrink-0" />
                      {customerDetails.tags.slice(0, 4).map((tag, i) => (
                        <Badge key={i} variant="outline" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400">Sin cliente asignado</p>
              )}
            </CardContent>
          </Card>

          {/* Razón de pérdida */}
          {opportunity.loss_reason && (
            <Card className="bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
              <CardContent className="pt-5">
                <p className="text-sm font-medium text-red-600 dark:text-red-400 mb-1">
                  Razón de pérdida
                </p>
                <p className="text-sm text-red-700 dark:text-red-300">
                  {opportunity.loss_reason}
                </p>
              </CardContent>
            </Card>
          )}
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
