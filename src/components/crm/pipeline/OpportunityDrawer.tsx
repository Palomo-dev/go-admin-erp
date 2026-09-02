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
import { RichTextEditor } from "@/components/shared/RichTextEditor";
import { HtmlContentRenderer } from "@/components/shared/HtmlContentRenderer";
import { toast } from "@/components/ui/use-toast";
import { opportunitiesService } from "@/components/crm/oportunidades/opportunitiesService";
import { ScoringSection } from "@/components/crm/oportunidades/ScoringSection";
import { DocumentUploader } from "@/components/crm/documents/DocumentUploader";
import { StructuredLossDialog } from "@/components/crm/oportunidades/StructuredLossDialog";
import { WonCloseModal } from "@/components/crm/pipeline/WonCloseModal";
import { getOrganizationId } from "@/lib/hooks/useOrganization";
import type { LossReasonData } from "@/components/crm/oportunidades/types";
import { formatCurrency } from "@/utils/Utils";
import { translateOpportunityStatus } from "@/utils/crmTranslations";
import { ActivityActions } from "./drawer/ActivityActions";
import { FollowupSection } from "./drawer/FollowupSection";
import { SalesTeamTerritorySelectors } from "./drawer";
import { DiscoverySection } from "./drawer/DiscoverySection";
import { DiscoveryConfigDialog } from "./drawer/DiscoveryConfigDialog";
import { ClosedWonDialog } from "./drawer/ClosedWonDialog";
import { TasksSection } from "./drawer/TasksSection";
import { CustomerEditDialog } from "../shared/CustomerEditDialog";
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
  SquarePen,
  Package,
  BedDouble,
  FileText,
  Trash2,
  Pin,
  PinOff,
  Loader2,
  FolderOpen,
  Target,
  XCircle,
  Trophy,
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
  channel?: string | null;
  outcome?: string | null;
  duration_seconds?: number | null;
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
  product?: { id: number; name: string; sku?: string };
}

interface SpaceItem {
  id: string;
  nights: number;
  unit_price: number;
  total_price: number;
  space?: { id: string; label: string; space_types?: { name: string } };
}

interface CustomLineItem {
  id: string;
  concept: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

interface OpportunityFull {
  id: string;
  name: string;
  amount?: number | null;
  currency?: string | null;
  expected_close_date?: string | null;
  status?: string | null;
  customer_id?: string | null;
  customer?: { id: string; full_name: string; email?: string | null } | null;
  created_at?: string | null;
  last_contact_at?: string | null;
  next_contact_at?: string | null;
  contact_channel?: string | null;
  contact_result?: string | null;
  temperature?: string | null;
  next_action?: string | null;
  objection_id?: string | null;
  discovery_data?: Record<string, unknown> | null;
  win_data?: Record<string, unknown> | null;
  loss_reason?: string | null;
  loss_reason_value?: string | null;
  competitor_name?: string | null;
  competitor_price?: number | null;
  missing_features?: string[] | null;
  recontact_at?: string | null;
  closed_at?: string | null;
  sales_team_id?: string | null;
  territory_id?: string | null;
}

interface OpportunityDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  opportunity: OpportunityFull | null;
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

const formatDate = (dateStr?: string | null) => {
  if (!dateStr) return "N/A";
  return new Date(dateStr).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
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
    follow_up: "Seguimiento",
    reminder: "Recordatorio",
    automation_log: "Automatización",
  };
  return translations[type?.toLowerCase()] || type || "Actividad";
};

export function OpportunityDrawer({ open, onOpenChange, opportunity }: OpportunityDrawerProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [customer, setCustomer] = useState<CustomerInfo | null>(null);
  const [showCustomerEdit, setShowCustomerEdit] = useState(false);
  const [showDiscoveryConfig, setShowDiscoveryConfig] = useState(false);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [spaces, setSpaces] = useState<SpaceItem[]>([]);
  const [customLines, setCustomLines] = useState<CustomLineItem[]>([]);
  const [oppData, setOppData] = useState<OpportunityFull | null>(null);

  // Dialogs
  const [lossDialogOpen, setLossDialogOpen] = useState(false);
  const [wonDialogOpen, setWonDialogOpen] = useState(false);
  const [wonCloseOpen, setWonCloseOpen] = useState(false);
  const [closingLost, setClosingLost] = useState(false);

  // Form state
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
    setOppData(opportunity);

    try {
      const results = await Promise.allSettled([
        opportunitiesService.getOpportunityActivities(opportunity.id),
        opportunitiesService.getOpportunityTasks(opportunity.id),
        opportunitiesService.getOpportunityNotes(opportunity.id),
        opportunitiesService.getOpportunityProducts(opportunity.id),
        opportunitiesService.getOpportunitySpaces(opportunity.id),
        opportunitiesService.getOpportunityCustomLines(opportunity.id),
        opportunitiesService.getOpportunityById(opportunity.id),
      ]);

      if (results[0].status === "fulfilled") setActivities(results[0].value as ActivityItem[]);
      if (results[1].status === "fulfilled") setTasks(results[1].value as TaskItem[]);
      if (results[2].status === "fulfilled") setNotes(results[2].value as NoteItem[]);
      if (results[3].status === "fulfilled") setProducts(results[3].value as ProductItem[]);
      if (results[4].status === "fulfilled") setSpaces(results[4].value as SpaceItem[]);
      if (results[5].status === "fulfilled") setCustomLines(results[5].value as CustomLineItem[]);
      if (results[6].status === "fulfilled") {
        const full = results[6].value as OpportunityFull | null;
        if (full) setOppData({ ...opportunity, ...full });
      }

      const customerId = opportunity.customer_id || opportunity.customer?.id;
      if (customerId) {
        const custDetails = await opportunitiesService.getCustomerDetails(customerId);
        if (custDetails) setCustomer(custDetails as CustomerInfo);
      }
    } catch (error: unknown) {
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

  const handleAddNote = async () => {
    if (!opportunity || !newNoteBody.trim()) return;
    setIsAddingNote(true);
    try {
      await opportunitiesService.createNote(opportunity.id, newNoteBody);
      setNewNoteBody("");
      await loadData();
      toast({ title: "Nota agregada" });
    } catch {
      toast({ title: "Error", description: "No se pudo agregar la nota", variant: "destructive" });
    } finally {
      setIsAddingNote(false);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    try {
      await opportunitiesService.deleteNote(noteId);
      await loadData();
      toast({ title: "Nota eliminada" });
    } catch {
      toast({ title: "Error", description: "No se pudo eliminar", variant: "destructive" });
    }
  };

  const handleTogglePin = async (noteId: string, isPinned: boolean) => {
    try {
      await opportunitiesService.toggleNotePin(noteId, isPinned);
      await loadData();
    } catch {
      toast({ title: "Error", description: "No se pudo actualizar", variant: "destructive" });
    }
  };

  const handleEdit = () => {
    if (!opportunity) return;
    onOpenChange(false);
    router.push(`/app/crm/oportunidades/${opportunity.id}/editar`);
  };

  const handleMarkLost = async (data: LossReasonData) => {
    if (!opportunity) return;
    setClosingLost(true);
    try {
      await opportunitiesService.markAsLost(opportunity.id, data);
      toast({ title: "Oportunidad cerrada como perdida" });
      setLossDialogOpen(false);
      await loadData();
      window.dispatchEvent(new Event("refresh-pipeline-data"));
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Error desconocido";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setClosingLost(false);
    }
  };

  const handleWonConfirmed = async () => {
    await loadData();
    setWonDialogOpen(false);
    // Abrir el WonCloseModal con pasos financieros
    setWonCloseOpen(true);
    window.dispatchEvent(new Event("refresh-pipeline-data"));
  };

  const formattedAmount = opportunity
    ? formatCurrency(parseFloat(opportunity.amount?.toString() || "0") || 0, opportunity.currency || "COP")
    : "";

  const isWon = oppData?.status === "won";
  const isLost = oppData?.status === "lost";

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
                <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                  {opportunity.status && (
                    <Badge className={`text-xs ${getStatusColor(opportunity.status)}`}>
                      {translateOpportunityStatus(opportunity.status)}
                    </Badge>
                  )}
                  <Button size="sm" variant="outline" onClick={handleEdit} className="h-8 px-3 text-xs">
                    <Edit className="h-3.5 w-3.5 mr-1" />
                    Editar
                  </Button>
                </div>
              </div>

              {/* Acciones de cierre rápido */}
              {!isWon && !isLost && (
                <div className="flex gap-2 mt-3">
                  <Button
                    size="sm"
                    onClick={() => setWonDialogOpen(true)}
                    className="h-8 text-xs bg-green-600 hover:bg-green-700"
                  >
                    <Trophy className="h-3.5 w-3.5 mr-1" />
                    Cerrar ganada
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setLossDialogOpen(true)}
                    className="h-8 text-xs border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                  >
                    <XCircle className="h-3.5 w-3.5 mr-1" />
                    Cerrar perdida
                  </Button>
                </div>
              )}
            </SheetHeader>

            {/* Contenido scroll único */}
            <div className="p-4 sm:p-6 space-y-5">
              {loading ? (
                <div className="space-y-4">
                  <Skeleton className="h-24 w-full" />
                  <Skeleton className="h-32 w-full" />
                  <Skeleton className="h-32 w-full" />
                </div>
              ) : (
                <>
                  {/* ===== Acciones operativas ===== */}
                  <section>
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                      <Target className="h-4 w-4 text-blue-500" />
                      Acciones
                    </h3>
                    <ActivityActions
                      opportunityId={opportunity.id}
                      customer={customer}
                      onActivityLogged={loadData}
                    />
                  </section>

                  <Separator />

                  {/* ===== Seguimiento ===== */}
                  <section>
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                      <Clock className="h-4 w-4 text-blue-500" />
                      Seguimiento
                    </h3>
                    <FollowupSection
                      opportunityId={opportunity.id}
                      initialData={oppData || undefined}
                      onUpdated={loadData}
                    />
                  </section>

                  <Separator />

                  {/* ===== Info de la oportunidad ===== */}
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

                  {/* ===== Equipo y Territorio ===== */}
                  <SalesTeamTerritorySelectors
                    opportunityId={opportunity.id}
                    initialTeamId={oppData?.sales_team_id}
                    initialTerritoryId={oppData?.territory_id}
                    initialSalespersonId={oppData?.salesperson_id}
                    onUpdated={loadData}
                  />

                  <Separator />

                  {/* ===== Calificación GOC ===== */}
                  <ScoringSection opportunityId={opportunity.id} />

                  <Separator />

                  {/* ===== Discovery ===== */}
                  <section>
                    <DiscoverySection
                      opportunityId={opportunity.id}
                      initialData={oppData?.discovery_data}
                      onUpdated={loadData}
                      onConfigure={() => setShowDiscoveryConfig(true)}
                    />
                  </section>

                  <Separator />

                  {/* ===== Info del cliente ===== */}
                  <section>
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                      <User className="h-4 w-4 text-blue-500" />
                      Información del Cliente
                      {customer && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs ml-auto"
                          onClick={() => setShowCustomerEdit(true)}
                        >
                          <SquarePen className="h-3 w-3 mr-1" />
                          Editar
                        </Button>
                      )}
                    </h3>
                    {customer ? (
                      <Card className="p-4 bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700">
                        <div className="space-y-2.5 text-sm">
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-gray-400 shrink-0" />
                            <span className="font-medium text-gray-900 dark:text-gray-100">{customer.full_name}</span>
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

                  {/* ===== Resumen de pérdida (si aplica) ===== */}
                  {isLost && oppData && (
                    <>
                      <Separator />
                      <section>
                        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                          <XCircle className="h-4 w-4 text-red-500" />
                          Razón de pérdida
                        </h3>
                        <Card className="p-4 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
                          <div className="space-y-2 text-sm">
                            <div>
                              <span className="text-xs text-gray-500 block">Razón:</span>
                              <span className="font-medium">{oppData.loss_reason || oppData.loss_reason_value || "N/A"}</span>
                            </div>
                            {oppData.competitor_name && (
                              <div>
                                <span className="text-xs text-gray-500 block">Competidor:</span>
                                <span>{oppData.competitor_name}</span>
                              </div>
                            )}
                            {oppData.competitor_price != null && (
                              <div>
                                <span className="text-xs text-gray-500 block">Precio competidor:</span>
                                <span>{formatCurrency(Number(oppData.competitor_price), opportunity.currency || "COP")}</span>
                              </div>
                            )}
                            {oppData.missing_features && oppData.missing_features.length > 0 && (
                              <div>
                                <span className="text-xs text-gray-500 block">Funcionalidades faltantes:</span>
                                <ul className="list-disc list-inside text-xs">
                                  {oppData.missing_features.map((f, i) => (
                                    <li key={i}>{f}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {oppData.recontact_at && (
                              <div>
                                <span className="text-xs text-gray-500 block">Recontactar:</span>
                                <span>{formatDate(oppData.recontact_at)}</span>
                              </div>
                            )}
                          </div>
                        </Card>
                      </section>
                    </>
                  )}

                  {/* ===== Resumen de ganada (si aplica) ===== */}
                  {isWon && oppData?.win_data && Object.keys(oppData.win_data).length > 0 && (
                    <>
                      <Separator />
                      <section>
                        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                          <Trophy className="h-4 w-4 text-green-500" />
                          Ficha de handoff
                        </h3>
                        <Card className="p-4 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
                          <div className="grid grid-cols-2 gap-3 text-sm">
                            {(oppData.win_data as Record<string, string>).product && (
                              <div className="col-span-2">
                                <span className="text-xs text-gray-500 block">Qué compró:</span>
                                <span className="font-medium">{(oppData.win_data as Record<string, string>).product}</span>
                              </div>
                            )}
                            {(oppData.win_data as Record<string, string>).modules && (
                              <div className="col-span-2">
                                <span className="text-xs text-gray-500 block">Módulos:</span>
                                <span>{(oppData.win_data as Record<string, string>).modules}</span>
                              </div>
                            )}
                            {(oppData.win_data as Record<string, string>).users_count && (
                              <div>
                                <span className="text-xs text-gray-500 block">Usuarios:</span>
                                <span>{(oppData.win_data as Record<string, string>).users_count}</span>
                              </div>
                            )}
                            {(oppData.win_data as Record<string, string>).branches_count && (
                              <div>
                                <span className="text-xs text-gray-500 block">Sucursales:</span>
                                <span>{(oppData.win_data as Record<string, string>).branches_count}</span>
                              </div>
                            )}
                            {(oppData.win_data as Record<string, string>).responsible && (
                              <div className="col-span-2">
                                <span className="text-xs text-gray-500 block">Responsable:</span>
                                <span>{(oppData.win_data as Record<string, string>).responsible}</span>
                              </div>
                            )}
                          </div>
                        </Card>
                      </section>
                    </>
                  )}

                  <Separator />

                  {/* ===== Productos ===== */}
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
                                <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">x{prod.quantity}</span>
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

                  {/* ===== Espacios ===== */}
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
                                <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">{sp.nights} noche(s)</span>
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

                  {/* ===== Conceptos personalizados ===== */}
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
                                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{cl.concept}</span>
                                <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">x{cl.quantity}</span>
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

                  {/* ===== Actividades ===== */}
                  <section>
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                      <ActivityIcon className="h-4 w-4 text-blue-500" />
                      Actividades ({activities.length})
                    </h3>
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
                                <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5 whitespace-pre-wrap">{act.notes}</p>
                              )}
                              {act.duration_seconds != null && act.duration_seconds > 0 && (
                                <span className="text-xs text-gray-400 mt-0.5 block">
                                  Duración: {Math.floor(act.duration_seconds / 60)}m {act.duration_seconds % 60}s
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                        No hay actividades registradas. Usa las acciones arriba para registrar llamadas, emails, WhatsApp o reuniones.
                      </p>
                    )}
                  </section>

                  <Separator />

                  {/* ===== Tareas (reutiliza PM) ===== */}
                  <section>
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                      <CheckSquare className="h-4 w-4 text-blue-500" />
                      Tareas ({tasks.length})
                    </h3>
                    <TasksSection
                      opportunityId={opportunity.id}
                      customerId={opportunity.customer_id || undefined}
                      tasks={tasks}
                      onTasksChanged={loadData}
                    />
                  </section>

                  <Separator />

                  {/* ===== Notas ===== */}
                  <section>
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                      <StickyNote className="h-4 w-4 text-blue-500" />
                      Notas ({notes.length})
                    </h3>
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
                        {isAddingNote ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
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
                                    {note.is_pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
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
                      <p className="text-sm text-gray-500 dark:text-gray-400 italic">No hay notas registradas.</p>
                    )}
                  </section>

                  <Separator />

                  {/* ===== Documentos ===== */}
                  <section>
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                      <FolderOpen className="h-4 w-4 text-blue-500" />
                      Documentos
                    </h3>
                    {(() => {
                      const orgId = getOrganizationId();
                      if (!orgId || !opportunity.id) return null;
                      return (
                        <DocumentUploader
                          organizationId={orgId}
                          relatedType="opportunity"
                          relatedId={opportunity.id}
                          title="Documentos de la oportunidad"
                        />
                      );
                    })()}
                  </section>
                </>
              )}
            </div>
          </>
        )}
      </SheetContent>

      {/* Diálogo editar/crear cliente */}
      {opportunity?.customer_id && (
        <CustomerEditDialog
          customerId={opportunity.customer_id}
          open={showCustomerEdit}
          onOpenChange={setShowCustomerEdit}
          onSaved={loadData}
          editMode
        />
      )}

      {/* Diálogo configurar discovery */}
      <DiscoveryConfigDialog
        open={showDiscoveryConfig}
        onOpenChange={setShowDiscoveryConfig}
        onSaved={loadData}
      />

      {/* Dialogs estructurados */}
      <StructuredLossDialog
        open={lossDialogOpen}
        onOpenChange={setLossDialogOpen}
        onConfirm={handleMarkLost}
        isLoading={closingLost}
      />

      <ClosedWonDialog
        open={wonDialogOpen}
        onOpenChange={setWonDialogOpen}
        opportunityId={opportunity?.id || ""}
        opportunityName={opportunity?.name}
        initialWinData={oppData?.win_data}
        onConfirmed={handleWonConfirmed}
      />

      {opportunity && (
        <WonCloseModal
          open={wonCloseOpen}
          onOpenChange={setWonCloseOpen}
          opportunityId={opportunity.id}
          opportunityName={opportunity.name}
          onComplete={() => {
            setWonCloseOpen(false);
            loadData();
          }}
        />
      )}
    </Sheet>
  );
}
