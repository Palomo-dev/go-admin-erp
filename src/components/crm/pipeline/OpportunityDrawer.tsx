"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { RichTextEditor } from "@/components/shared/RichTextEditor";
import { HtmlContentRenderer } from "@/components/shared/HtmlContentRenderer";
import { toast } from "@/components/ui/use-toast";
import { opportunitiesService } from "@/components/crm/oportunidades/opportunitiesService";
import { ScoringSection } from "@/components/crm/oportunidades/ScoringSection";
import type { Activity } from "@/components/crm/oportunidades/types";
import { formatCurrency } from "@/utils/Utils";
import { translateOpportunityStatus } from "@/utils/crmTranslations";
import {
  User,
  Mail,
  Phone,
  MapPin,
  Calendar,
  DollarSign,
  Activity as ActivityIcon,
  CheckSquare,
  StickyNote,
  Building2,
  Clock,
  CircleDot,
  Edit,
  Plus,
  Package,
  BedDouble,
  FileText,
  Trash2,
  Pin,
  PinOff,
  Loader2,
} from "lucide-react";

interface CustomerInfo {
  id: string;
  full_name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  notes?: string | null;
  company_name?: string | null;
  customer_type?: string | null;
  identification_type?: string | null;
  identification_number?: string | null;
  created_at?: string | null;
}

interface ActivityItem {
  id: string;
  activity_type: string;
  notes?: string | null;
  occurred_at: string;
  related_type?: string | null;
}

interface TaskItem {
  id: string;
  title: string;
  status: string;
  priority?: string | null;
  due_date?: string | null;
  description?: string | null;
}

interface NoteItem {
  id: string;
  body: string;
  created_at: string;
  is_pinned: boolean;
}

interface ProductItem {
  id: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  product?: {
    id: number;
    name: string;
    sku?: string;
  };
}

interface SpaceItem {
  id: string;
  nights: number;
  unit_price: number;
  total_price: number;
  space?: {
    id: string;
    label: string;
    space_types?: {
      name: string;
    };
  };
}

interface CustomLineItem {
  id: string;
  concept: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

interface OpportunityDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  opportunity: {
    id: string;
    name: string;
    amount?: number | null;
    currency?: string | null;
    expected_close_date?: string | null;
    status?: string | null;
    customer_id?: string | null;
    customer?: { id: string; full_name: string; email?: string | null } | null;
    created_at?: string | null;
  } | null;
}

const getStatusColor = (status: string) => {
  switch (status?.toLowerCase()) {
    case "open":
    case "active":
    case "in_progress":
      return "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800";
    case "won":
      return "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800";
    case "lost":
      return "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800";
    default:
      return "bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600";
  }
};

const getTaskStatusColor = (status: string) => {
  switch (status?.toLowerCase()) {
    case "completed":
    case "done":
      return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
    case "in_progress":
      return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
    case "cancelled":
      return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
    default:
      return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400";
  }
};

const formatDate = (dateStr?: string | null) => {
  if (!dateStr) return "N/A";
  return new Date(dateStr).toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const formatDateTime = (dateStr?: string | null) => {
  if (!dateStr) return "N/A";
  return new Date(dateStr).toLocaleString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const translateActivityType = (type: string) => {
  const translations: Record<string, string> = {
    call: "Llamada",
    email: "Correo",
    meeting: "Reunión",
    note: "Nota",
    task: "Tarea",
    stage_change: "Cambio de etapa",
    created: "Creado",
    updated: "Actualizado",
    message: "Mensaje",
    visit: "Visita",
  };
  return translations[type?.toLowerCase()] || type || "Actividad";
};

export function OpportunityDrawer({
  open,
  onOpenChange,
  opportunity,
}: OpportunityDrawerProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [customer, setCustomer] = useState<CustomerInfo | null>(null);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [spaces, setSpaces] = useState<SpaceItem[]>([]);
  const [customLines, setCustomLines] = useState<CustomLineItem[]>([]);

  // Form state
  const [newActivityNotes, setNewActivityNotes] = useState("");
  const [newActivityType, setNewActivityType] = useState("note");
  const [isAddingActivity, setIsAddingActivity] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [newNoteBody, setNewNoteBody] = useState("");
  const [isAddingNote, setIsAddingNote] = useState(false);

  const loadData = useCallback(async () => {
    if (!opportunity) return;
    setLoading(true);
    setCustomer(null);
    setActivities([]);
    setTasks([]);
    setNotes([]);
    setProducts([]);
    setSpaces([]);
    setCustomLines([]);

    try {
      const results = await Promise.allSettled([
        opportunitiesService.getOpportunityActivities(opportunity.id),
        opportunitiesService.getOpportunityTasks(opportunity.id),
        opportunitiesService.getOpportunityNotes(opportunity.id),
        opportunitiesService.getOpportunityProducts(opportunity.id),
        opportunitiesService.getOpportunitySpaces(opportunity.id),
        opportunitiesService.getOpportunityCustomLines(opportunity.id),
      ]);

      if (results[0].status === 'fulfilled') setActivities(results[0].value as ActivityItem[]);
      else console.warn('Error cargando actividades:', results[0].reason);

      if (results[1].status === 'fulfilled') setTasks(results[1].value as TaskItem[]);
      else console.warn('Error cargando tareas:', results[1].reason);

      if (results[2].status === 'fulfilled') setNotes(results[2].value as NoteItem[]);
      else console.warn('Error cargando notas:', results[2].reason);

      if (results[3].status === 'fulfilled') setProducts(results[3].value as ProductItem[]);
      else console.warn('Error cargando productos:', results[3].reason);

      if (results[4].status === 'fulfilled') setSpaces(results[4].value as SpaceItem[]);
      else console.warn('Error cargando espacios:', results[4].reason);

      if (results[5].status === 'fulfilled') setCustomLines(results[5].value as CustomLineItem[]);
      else console.warn('Error cargando conceptos:', results[5].reason);

      // Cargar info completa del cliente
      const customerId = opportunity.customer_id || opportunity.customer?.id;
      if (customerId) {
        const custDetails = await opportunitiesService.getCustomerDetails(customerId);
        if (custDetails) {
          setCustomer(custDetails as CustomerInfo);
        }
      }
    } catch (error) {
      console.error("Error cargando datos del drawer:", error);
    } finally {
      setLoading(false);
    }
  }, [opportunity]);

  useEffect(() => {
    if (open && opportunity) {
      loadData();
    }
  }, [open, opportunity, loadData]);

  const handleAddActivity = async () => {
    if (!opportunity || !newActivityNotes.trim()) return;
    setIsAddingActivity(true);
    try {
      await opportunitiesService.createActivity(
        opportunity.id,
        newActivityType as Activity["activity_type"],
        newActivityNotes
      );
      setNewActivityNotes("");
      setNewActivityType("note");
      await loadData();
      toast({ title: "Éxito", description: "Actividad registrada" });
    } catch (error) {
      console.error("Error:", error);
      toast({ title: "Error", description: "No se pudo registrar la actividad", variant: "destructive" });
    } finally {
      setIsAddingActivity(false);
    }
  };

  const handleAddTask = async () => {
    if (!opportunity || !newTaskTitle.trim()) return;
    setIsAddingTask(true);
    try {
      await opportunitiesService.createTask(opportunity.id, newTaskTitle);
      setNewTaskTitle("");
      await loadData();
      toast({ title: "Éxito", description: "Tarea creada" });
    } catch (error) {
      console.error("Error:", error);
      toast({ title: "Error", description: "No se pudo crear la tarea", variant: "destructive" });
    } finally {
      setIsAddingTask(false);
    }
  };

  const handleAddNote = async () => {
    if (!opportunity || !newNoteBody.trim()) return;
    setIsAddingNote(true);
    try {
      await opportunitiesService.createNote(opportunity.id, newNoteBody);
      setNewNoteBody("");
      await loadData();
      toast({ title: "Éxito", description: "Nota agregada" });
    } catch (error) {
      console.error("Error:", error);
      toast({ title: "Error", description: "No se pudo agregar la nota", variant: "destructive" });
    } finally {
      setIsAddingNote(false);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    try {
      await opportunitiesService.deleteNote(noteId);
      await loadData();
      toast({ title: "Éxito", description: "Nota eliminada" });
    } catch (error) {
      console.error("Error:", error);
      toast({ title: "Error", description: "No se pudo eliminar", variant: "destructive" });
    }
  };

  const handleTogglePin = async (noteId: string, isPinned: boolean) => {
    try {
      await opportunitiesService.toggleNotePin(noteId, isPinned);
      await loadData();
    } catch (error) {
      console.error("Error:", error);
      toast({ title: "Error", description: "No se pudo actualizar", variant: "destructive" });
    }
  };

  const handleToggleTask = async (taskId: string, currentStatus: string) => {
    const newStatus = currentStatus === "done" || currentStatus === "completed" ? "open" : "done";
    try {
      await opportunitiesService.updateTask(taskId, { status: newStatus });
      await loadData();
    } catch (error) {
      console.error("Error:", error);
      toast({ title: "Error", description: "No se pudo actualizar", variant: "destructive" });
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm("¿Eliminar esta tarea?")) return;
    try {
      await opportunitiesService.deleteTask(taskId);
      await loadData();
      toast({ title: "Éxito", description: "Tarea eliminada" });
    } catch (error) {
      console.error("Error:", error);
      toast({ title: "Error", description: "No se pudo eliminar", variant: "destructive" });
    }
  };

  const handleEdit = () => {
    if (!opportunity) return;
    onOpenChange(false);
    router.push(`/app/crm/oportunidades/${opportunity.id}/editar`);
  };

  const formattedAmount = opportunity
    ? formatCurrency(
        parseFloat(opportunity.amount?.toString() || "0") || 0,
        opportunity.currency || "COP"
      )
    : "";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg md:max-w-xl lg:max-w-2xl overflow-y-auto p-0 bg-white dark:bg-gray-900"
      >
        {opportunity && (
          <>
            {/* Header */}
            <SheetHeader className="p-4 sm:p-6 pb-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 sticky top-0 z-10">
              <div className="flex items-start justify-between gap-3 pr-6">
                <div className="flex-1 min-w-0">
                  <SheetTitle className="text-lg sm:text-xl font-bold text-gray-900 dark:text-gray-100">
                    {opportunity.name}
                  </SheetTitle>
                  <SheetDescription className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    {opportunity.customer?.full_name || "Cliente no especificado"}
                  </SheetDescription>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {opportunity.status && (
                    <Badge
                      className={`text-xs ${getStatusColor(opportunity.status)}`}
                    >
                      {translateOpportunityStatus(opportunity.status)}
                    </Badge>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleEdit}
                    className="h-8 px-3 text-xs border-gray-200 dark:border-gray-700"
                  >
                    <Edit className="h-3.5 w-3.5 mr-1" />
                    Editar
                  </Button>
                </div>
              </div>
            </SheetHeader>

            {/* Contenido scrolleable */}
            <div className="p-4 sm:p-6 space-y-5">
              {loading ? (
                <div className="space-y-4">
                  <Skeleton className="h-24 w-full" />
                  <Skeleton className="h-32 w-full" />
                  <Skeleton className="h-32 w-full" />
                </div>
              ) : (
                <>
                  {/* Info de la oportunidad */}
                  <section>
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                      <CircleDot className="h-4 w-4 text-blue-500" />
                      Información de la Oportunidad
                    </h3>
                    <Card className="p-4 bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700">
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <span className="text-gray-500 dark:text-gray-400 text-xs block mb-0.5">Monto</span>
                          <span className="font-medium text-gray-900 dark:text-gray-100 flex items-center gap-1">
                            <DollarSign className="h-3.5 w-3.5 text-blue-500" />
                            {formattedAmount}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-500 dark:text-gray-400 text-xs block mb-0.5">Cierre estimado</span>
                          <span className="font-medium text-gray-900 dark:text-gray-100 flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5 text-blue-500" />
                            {formatDate(opportunity.expected_close_date)}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-500 dark:text-gray-400 text-xs block mb-0.5">Creada</span>
                          <span className="font-medium text-gray-900 dark:text-gray-100 flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5 text-blue-500" />
                            {formatDate(opportunity.created_at)}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-500 dark:text-gray-400 text-xs block mb-0.5">Moneda</span>
                          <span className="font-medium text-gray-900 dark:text-gray-100">
                            {opportunity.currency || "COP"}
                          </span>
                        </div>
                      </div>
                    </Card>
                  </section>

                  <Separator />

                  {/* Calificación GOC */}
                  <ScoringSection opportunityId={opportunity.id} />

                  <Separator />

                  {/* Info del cliente */}
                  <section>
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                      <User className="h-4 w-4 text-blue-500" />
                      Información del Cliente
                    </h3>
                    {customer ? (
                      <Card className="p-4 bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700">
                        <div className="space-y-2.5 text-sm">
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-gray-400 shrink-0" />
                            <span className="font-medium text-gray-900 dark:text-gray-100">
                              {customer.full_name}
                            </span>
                          </div>
                          {customer.company_name && (
                            <div className="flex items-center gap-2">
                              <Building2 className="h-4 w-4 text-gray-400 shrink-0" />
                              <span className="text-gray-700 dark:text-gray-300">{customer.company_name}</span>
                            </div>
                          )}
                          {customer.email && (
                            <div className="flex items-center gap-2">
                              <Mail className="h-4 w-4 text-gray-400 shrink-0" />
                              <span className="text-gray-700 dark:text-gray-300 truncate">{customer.email}</span>
                            </div>
                          )}
                          {customer.phone && (
                            <div className="flex items-center gap-2">
                              <Phone className="h-4 w-4 text-gray-400 shrink-0" />
                              <span className="text-gray-700 dark:text-gray-300">{customer.phone}</span>
                            </div>
                          )}
                          {(customer.address || customer.city) && (
                            <div className="flex items-center gap-2">
                              <MapPin className="h-4 w-4 text-gray-400 shrink-0" />
                              <span className="text-gray-700 dark:text-gray-300">
                                {[customer.city, customer.address].filter(Boolean).join(", ")}
                              </span>
                            </div>
                          )}
                          {customer.identification_number && (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-400 shrink-0">ID:</span>
                              <span className="text-gray-700 dark:text-gray-300">
                                {customer.identification_type ? `${customer.identification_type}: ` : ""}
                                {customer.identification_number}
                              </span>
                            </div>
                          )}
                          {customer.customer_type && (
                            <div>
                              <Badge variant="secondary" className="text-xs">
                                {customer.customer_type}
                              </Badge>
                            </div>
                          )}
                          {customer.notes && (
                            <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                              <span className="text-xs text-gray-400 block mb-1">Notas del cliente:</span>
                              <p className="text-gray-600 dark:text-gray-400 text-xs">{customer.notes}</p>
                            </div>
                          )}
                        </div>
                      </Card>
                    ) : (
                      !loading && (
                        <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                          No hay información detallada del cliente.
                        </p>
                      )
                    )}
                  </section>

                  <Separator />

                  {/* Productos */}
                  {products.length > 0 && (
                    <>
                      <section>
                        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                          <Package className="h-4 w-4 text-blue-500" />
                          Productos ({products.length})
                        </h3>
                        <div className="space-y-2">
                          {products.map((prod) => (
                            <div
                              key={prod.id}
                              className="flex items-center justify-between gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700"
                            >
                              <div className="flex-1 min-w-0">
                                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                  {prod.product?.name || "Producto sin nombre"}
                                </span>
                                <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
                                  x{prod.quantity}
                                </span>
                              </div>
                              <span className="text-sm font-medium text-blue-600 dark:text-blue-400 shrink-0">
                                {formatCurrency(prod.total_price, opportunity.currency || "COP")}
                              </span>
                            </div>
                          ))}
                        </div>
                      </section>
                      <Separator />
                    </>
                  )}

                  {/* Espacios */}
                  {spaces.length > 0 && (
                    <>
                      <section>
                        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                          <BedDouble className="h-4 w-4 text-blue-500" />
                          Espacios ({spaces.length})
                        </h3>
                        <div className="space-y-2">
                          {spaces.map((sp) => (
                            <div
                              key={sp.id}
                              className="flex items-center justify-between gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700"
                            >
                              <div className="flex-1 min-w-0">
                                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                  {sp.space?.label || "Espacio sin nombre"}
                                </span>
                                <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
                                  {sp.nights} noche(s)
                                </span>
                              </div>
                              <span className="text-sm font-medium text-blue-600 dark:text-blue-400 shrink-0">
                                {formatCurrency(sp.total_price, opportunity.currency || "COP")}
                              </span>
                            </div>
                          ))}
                        </div>
                      </section>
                      <Separator />
                    </>
                  )}

                  {/* Conceptos personalizados */}
                  {customLines.length > 0 && (
                    <>
                      <section>
                        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                          <FileText className="h-4 w-4 text-blue-500" />
                          Conceptos ({customLines.length})
                        </h3>
                        <div className="space-y-2">
                          {customLines.map((cl) => (
                            <div
                              key={cl.id}
                              className="flex items-center justify-between gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700"
                            >
                              <div className="flex-1 min-w-0">
                                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                  {cl.concept}
                                </span>
                                <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
                                  x{cl.quantity}
                                </span>
                              </div>
                              <span className="text-sm font-medium text-blue-600 dark:text-blue-400 shrink-0">
                                {formatCurrency(cl.total_price, opportunity.currency || "COP")}
                              </span>
                            </div>
                          ))}
                        </div>
                      </section>
                      <Separator />
                    </>
                  )}

                  {/* Actividades */}
                  <section>
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                      <ActivityIcon className="h-4 w-4 text-blue-500" />
                      Actividades ({activities.length})
                    </h3>
                    {/* Formulario nueva actividad */}
                    <div className="mb-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                      <div className="flex gap-2 mb-2">
                        <select
                          value={newActivityType}
                          onChange={(e) => setNewActivityType(e.target.value)}
                          className="text-xs rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1.5 text-gray-700 dark:text-gray-300"
                        >
                          <option value="note">Nota</option>
                          <option value="call">Llamada</option>
                          <option value="email">Correo</option>
                          <option value="meeting">Reunión</option>
                          <option value="visit">Visita</option>
                        </select>
                        <RichTextEditor
                          value={newActivityNotes}
                          onChange={setNewActivityNotes}
                          placeholder="Descripción de la actividad..."
                          minHeight={60}
                          className="flex-1"
                        />
                      </div>
                      <Button
                        size="sm"
                        onClick={handleAddActivity}
                        disabled={isAddingActivity || !newActivityNotes.trim()}
                        className="w-full h-8 text-xs"
                      >
                        {isAddingActivity ? (
                          <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                        ) : (
                          <Plus className="h-3.5 w-3.5 mr-1" />
                        )}
                        Registrar Actividad
                      </Button>
                    </div>
                    {activities.length > 0 ? (
                      <div className="space-y-2">
                        {activities.map((act) => (
                          <div
                            key={act.id}
                            className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700"
                          >
                            <div className="mt-0.5 shrink-0 w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                              <ActivityIcon className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                  {translateActivityType(act.activity_type)}
                                </span>
                                <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">
                                  {formatDateTime(act.occurred_at)}
                                </span>
                              </div>
                              {act.notes && (
                                <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">{act.notes}</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                        No hay actividades registradas.
                      </p>
                    )}
                  </section>

                  <Separator />

                  {/* Tareas */}
                  <section>
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                      <CheckSquare className="h-4 w-4 text-blue-500" />
                      Tareas ({tasks.length})
                    </h3>
                    {/* Formulario nueva tarea */}
                    <div className="mb-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                      <div className="flex gap-2">
                        <Input
                          value={newTaskTitle}
                          onChange={(e) => setNewTaskTitle(e.target.value)}
                          placeholder="Título de la tarea..."
                          className="text-sm flex-1"
                        />
                        <Button
                          size="sm"
                          onClick={handleAddTask}
                          disabled={isAddingTask || !newTaskTitle.trim()}
                          className="h-9 px-3 text-xs shrink-0"
                        >
                          {isAddingTask ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Plus className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </div>
                    </div>
                    {tasks.length > 0 ? (
                      <div className="space-y-2">
                        {tasks.map((task) => (
                          <div
                            key={task.id}
                            className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700"
                          >
                            <button
                              onClick={() => handleToggleTask(task.id, task.status)}
                              className="mt-0.5 shrink-0 w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors"
                            >
                              <CheckSquare className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                            </button>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <span className={`text-sm font-medium ${task.status === 'done' || task.status === 'completed' ? 'line-through text-gray-400' : 'text-gray-900 dark:text-gray-100'}`}>
                                  {task.title}
                                </span>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <Badge className={`text-xs ${getTaskStatusColor(task.status)}`}>
                                    {task.status}
                                  </Badge>
                                  <button
                                    onClick={() => handleDeleteTask(task.id)}
                                    className="text-gray-400 hover:text-red-500 transition-colors"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </div>
                              {task.description && (
                                <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">{task.description}</p>
                              )}
                              {task.due_date && (
                                <div className="flex items-center gap-1 mt-1 text-xs text-gray-500 dark:text-gray-400">
                                  <Calendar className="h-3 w-3" />
                                  Vence: {formatDate(task.due_date)}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                        No hay tareas asociadas.
                      </p>
                    )}
                  </section>

                  <Separator />

                  {/* Notas */}
                  <section>
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                      <StickyNote className="h-4 w-4 text-blue-500" />
                      Notas ({notes.length})
                    </h3>
                    {/* Formulario nueva nota */}
                    <div className="mb-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                      <RichTextEditor
                        value={newNoteBody}
                        onChange={setNewNoteBody}
                        placeholder="Escribe una nota..."
                        minHeight={60}
                        className="mb-2"
                      />
                      <Button
                        size="sm"
                        onClick={handleAddNote}
                        disabled={isAddingNote || !newNoteBody.trim()}
                        className="w-full h-8 text-xs"
                      >
                        {isAddingNote ? (
                          <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                        ) : (
                          <Plus className="h-3.5 w-3.5 mr-1" />
                        )}
                        Agregar Nota
                      </Button>
                    </div>
                    {notes.length > 0 ? (
                      <div className="space-y-2">
                        {notes.map((note) => (
                          <div
                            key={note.id}
                            className={`flex items-start gap-3 p-3 rounded-lg border ${
                              note.is_pinned
                                ? "bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800"
                                : "bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700"
                            }`}
                          >
                            <div className="mt-0.5 shrink-0 w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                              <StickyNote className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <HtmlContentRenderer html={note.body} className="text-sm text-gray-700 dark:text-gray-300" />
                              <div className="flex items-center justify-between mt-1">
                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                  {formatDateTime(note.created_at)}
                                  {note.is_pinned && " · Fijada"}
                                </span>
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => handleTogglePin(note.id, note.is_pinned)}
                                    className="text-gray-400 hover:text-blue-500 transition-colors p-1"
                                    title={note.is_pinned ? "Desfijar" : "Fijar"}
                                  >
                                    {note.is_pinned ? (
                                      <PinOff className="h-3.5 w-3.5" />
                                    ) : (
                                      <Pin className="h-3.5 w-3.5" />
                                    )}
                                  </button>
                                  <button
                                    onClick={() => handleDeleteNote(note.id)}
                                    className="text-gray-400 hover:text-red-500 transition-colors p-1"
                                    title="Eliminar"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                        No hay notas registradas.
                      </p>
                    )}
                  </section>
                </>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
