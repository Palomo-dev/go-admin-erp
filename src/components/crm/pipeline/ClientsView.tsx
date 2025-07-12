"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/config";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency } from "@/utils/Utils";
import {
  Mail,
  Phone,
  Building,
  Search,
  MoreHorizontal,
  Users,
  ArrowUpDown,
  Briefcase,
  MapPin,
  FileText,
  Clock,
  CalendarDays,
  Calculator,
  TrendingUp,
} from "lucide-react";
import LoadingSpinner from "@/components/ui/loading-spinner";

interface Customer {
  id: string;
  full_name: string;
  email?: string;
  phone?: string;
  address?: string;
  notes?: string;
  has_opportunities: boolean;
  organization_id: string;
  created_at: string;
  updated_at?: string;
  total_opportunities: number;
  active_opportunities: number;
  won_opportunities: number;
  total_value: number;
  latest_opportunity?: {
    id: string;
    name: string;
    status: string;
    amount: number;
    stage_id: string;
    created_at: string;
  };
  opportunities?: any[];
}

// Interfaz para actividades del cliente (historial)
interface CustomerInteraction {
  id: string;
  related_id: string; // ID del cliente relacionado
  activity_type: string;
  notes: string;
  occurred_at: string;
  created_at: string;
  user_id?: string;
  organization_id: number;
  metadata?: any;
  related_type: string; // Tipo de entidad relacionada ('customer', 'opportunity', etc.)
}

interface ClientsViewProps {
  pipelineId: string;
}

const ClientsView: React.FC<ClientsViewProps> = ({ pipelineId }) => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [organizationId, setOrganizationId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [sortField, setSortField] = useState<string>("full_name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [customerInteractions, setCustomerInteractions] = useState<
    CustomerInteraction[]
  >([]);
  const [loadingInteractions, setLoadingInteractions] =
    useState<boolean>(false);

  // Estado para almacenar las etapas del pipeline
  const [pipelineStages, setPipelineStages] = useState<
    { id: string; name: string; color: string }[]
  >([]);

  // Obtener el ID de la organización de localStorage o sessionStorage
  useEffect(() => {
    // Lista de posibles claves donde podría estar almacenado el ID de la organización
    const possibleKeys = [
      "currentOrganizationId",
      "organizationId",
      "selectedOrganizationId",
      "orgId",
      "organization_id",
    ];

    // Buscar en localStorage
    for (const key of possibleKeys) {
      const orgId = localStorage.getItem(key);
      if (orgId) {
        // Organización encontrada en localStorage
        setOrganizationId(Number(orgId));
        return;
      }
    }

    // Si no está en localStorage, buscar en sessionStorage
    for (const key of possibleKeys) {
      const orgId = sessionStorage.getItem(key);
      if (orgId) {
        // Organización encontrada en sessionStorage
        setOrganizationId(Number(orgId));
        return;
      }
    }

    // Si no se encuentra, usar un valor predeterminado para desarrollo
    if (process.env.NODE_ENV !== "production") {
      // Usando ID de organización predeterminado para desarrollo
      setOrganizationId(2); // Valor predeterminado para desarrollo
    } else {
      // No se pudo encontrar el ID de organización en el almacenamiento local
    }
  }, []);

  // Cargar etapas del pipeline
  useEffect(() => {
    if (!pipelineId) return;

    const loadStages = async () => {
      try {
        const { data, error } = await supabase
          .from("stages")
          .select("id, name, color")
          .eq("pipeline_id", pipelineId)
          .order("position");

        if (error) throw error;

        setPipelineStages(data || []);
      } catch (error) {
        console.error("Error al cargar etapas del pipeline:", error);
      }
    };

    loadStages();
  }, [pipelineId]);

  // Cargar datos de clientes cuando cambie el pipelineId o organizationId
  useEffect(() => {
    if (!pipelineId || !organizationId) return;

    const loadData = async () => {
      setLoading(true);

      try {
        // Cargando clientes para pipeline y organización

        // Consulta optimizada para obtener todos los clientes de la organización
        // sin filtrar primero por oportunidades para tener una lista completa
        const { data: customersData, error: customersError } = await supabase
          .from("customers")
          .select(
            "id, full_name, email, phone, address, created_at, notes, organization_id"
          )
          .eq("organization_id", organizationId)
          .order("full_name");

        if (customersError) {
          console.error("Error al cargar clientes:", customersError);
          throw customersError;
        }

        if (!customersData || customersData.length === 0) {
          // No se encontraron clientes para esta organización
          setCustomers([]);
          setLoading(false);
          return;
        }

        // Clientes encontrados

        // Consulta única para obtener todas las oportunidades relacionadas con estos clientes
        // en el pipeline actual, para evitar múltiples consultas individuales
        const customerIds = customersData.map((c) => c.id);

        const { data: opportunitiesData, error: oppsError } = await supabase
          .from("opportunities")
          .select("id, customer_id, amount, status, stage_id, name, created_at")
          .in("customer_id", customerIds)
          .eq("pipeline_id", pipelineId);

        if (oppsError) {
          console.error("Error al cargar oportunidades:", oppsError);
          throw oppsError;
        }

        const opportunities = opportunitiesData || [];
        // Oportunidades relacionadas encontradas

        // Agrupar oportunidades por cliente para un procesamiento eficiente
        const opportunitiesByCustomer: Record<string, any[]> = {};

        opportunities.forEach((opp) => {
          if (!opportunitiesByCustomer[opp.customer_id]) {
            opportunitiesByCustomer[opp.customer_id] = [];
          }
          opportunitiesByCustomer[opp.customer_id].push(opp);
        });

        // Combinar datos de clientes con estadísticas de oportunidades
        const customersWithStats = customersData.map((customer) => {
          const customerOpps = opportunitiesByCustomer[customer.id] || [];
          const totalValue = customerOpps.reduce(
            (sum, opp) => sum + parseFloat(opp.amount || 0),
            0
          );

          // Contar oportunidades por estado
          const activeOpportunities = customerOpps.filter(
            (opp) => opp.status === "open"
          ).length;
          const wonOpportunities = customerOpps.filter(
            (opp) => opp.status === "won"
          ).length;
          const lostOpportunities = customerOpps.filter(
            (opp) => opp.status === "lost"
          ).length;

          // Obtener la oportunidad más reciente
          const latestOpportunity =
            customerOpps.length > 0
              ? customerOpps.reduce((latest, current) => {
                  return new Date(current.created_at || 0) >
                    new Date(latest.created_at || 0)
                    ? current
                    : latest;
                })
              : null;

          return {
            ...customer,
            total_opportunities: customerOpps.length,
            active_opportunities: activeOpportunities,
            won_opportunities: wonOpportunities,
            lost_opportunities: lostOpportunities,
            total_value: totalValue,
            has_opportunities: customerOpps.length > 0,
            latest_opportunity: latestOpportunity,
            opportunities: customerOpps,
          };
        });

        setCustomers(customersWithStats);
      } catch (error) {
        console.error("Error al cargar datos de clientes:", error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [pipelineId, organizationId]);

  // Función para manejar cambio de orden
  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  // Estados para modales y diálogos
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(
    null
  );
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isCreateOpportunityOpen, setIsCreateOpportunityOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  // Estados para formularios
  const [editFormData, setEditFormData] = useState({
    full_name: "",
    email: "",
    phone: "",
    address: "",
    notes: "",
  });

  const [opportunityFormData, setOpportunityFormData] = useState({
    name: "",
    amount: 0,
    stage: "",
    expected_close_date: "",
  });

  // Estado para mostrar mensajes de éxito o error
  const [formMessage, setFormMessage] = useState({
    type: "",
    text: "",
  });

  // Estados para manejar carga durante operaciones de guardado
  const [isSaving, setIsSaving] = useState(false);

  // Funciones para manejar acciones del menú de cliente
  const handleViewCustomerDetails = (customer: Customer) => {
    setSelectedCustomer(customer);
    setIsDetailsOpen(true);
    // Registrar la visualización en analíticas (opcional)
    console.log(`Visualizando detalles del cliente: ${customer.id}`);
  };

  const handleEditCustomer = (customer: Customer) => {
    setSelectedCustomer(customer);
    // Inicializar el formulario con los datos actuales del cliente
    setEditFormData({
      full_name: customer.full_name || "",
      email: customer.email || "",
      phone: customer.phone || "",
      address: customer.address || "",
      notes: customer.notes || "",
    });
    setIsEditOpen(true);
  };

  const handleCreateOpportunity = (customer: Customer) => {
    setSelectedCustomer(customer);

    // Obtener la fecha actual para el campo de fecha estimada de cierre (30 días después)
    const today = new Date();
    const nextMonth = new Date(today);
    nextMonth.setDate(today.getDate() + 30);
    const formattedDate = nextMonth.toISOString().split("T")[0]; // Formato YYYY-MM-DD

    // Usar la primera etapa del pipeline como valor por defecto si está disponible
    const defaultStageId =
      pipelineStages.length > 0 ? pipelineStages[0].id : "contacto";

    // Inicializar el formulario con valores por defecto
    setOpportunityFormData({
      name: "",
      amount: 0,
      stage: defaultStageId,
      expected_close_date: formattedDate,
    });

    setIsCreateOpportunityOpen(true);
  };

  const handleSendEmail = (customer: Customer) => {
    if (customer.email) {
      // Añadimos más información al correo para hacer seguimiento
      const subject = encodeURIComponent(
        `GoAdmin: Seguimiento de cliente - ${customer.full_name}`
      );
      const body = encodeURIComponent(
        `Estimado/a ${customer.full_name},\n\nEspero que este mensaje le encuentre bien.\n\n` +
          `Quería hacer seguimiento sobre nuestras conversaciones recientes.\n\n` +
          `Saludos cordiales,\n\n`
      );
      window.location.href = `mailto:${customer.email}?subject=${subject}&body=${body}`;
    } else {
      alert(
        "Este cliente no tiene dirección de correo electrónico registrada."
      );
    }
  };

  const handleViewHistory = (customer: Customer) => {
    setSelectedCustomer(customer);
    setIsHistoryOpen(true);
    setCustomerInteractions([]); // Limpiar interacciones anteriores
    setLoadingInteractions(true);

    // Cargar datos del historial desde la base de datos usando la tabla activities
    const loadCustomerHistory = async () => {
      try {
        const { data, error } = await supabase
          .from("activities")
          .select("*")
          .eq("related_id", customer.id)
          .eq("related_type", "customer")
          .eq("organization_id", organizationId)
          .order("occurred_at", { ascending: false });

        if (error) throw error;

        setCustomerInteractions(data || []);
      } catch (error) {
        console.error("Error al cargar historial del cliente:", error);
      } finally {
        setLoadingInteractions(false);
      }
    };

    loadCustomerHistory();
  };

  // Funciones para manejar cambios en los formularios
  const handleEditFormChange = (field: string, value: string) => {
    setEditFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleOpportunityFormChange = (
    field: string,
    value: string | number
  ) => {
    setOpportunityFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  // Funciones para guardar los datos
  const saveCustomerChanges = async () => {
    if (!selectedCustomer) return;

    setIsSaving(true);
    setFormMessage({ type: "", text: "" });

    try {
      // Actualizar cliente en la base de datos
      const { error } = await supabase
        .from("customers")
        .update({
          full_name: editFormData.full_name,
          email: editFormData.email,
          phone: editFormData.phone,
          address: editFormData.address,
          notes: editFormData.notes,
          updated_at: new Date().toISOString(),
        })
        .eq("id", selectedCustomer.id);

      if (error) throw error;

      // Actualizar estado local
      setCustomers((prev) =>
        prev.map((customer) =>
          customer.id === selectedCustomer.id
            ? {
                ...customer,
                full_name: editFormData.full_name,
                email: editFormData.email,
                phone: editFormData.phone,
                address: editFormData.address,
                notes: editFormData.notes,
              }
            : customer
        )
      );

      setFormMessage({
        type: "success",
        text: "Cliente actualizado correctamente",
      });

      // Cerrar el modal después de un breve tiempo
      setTimeout(() => {
        setIsEditOpen(false);
        setFormMessage({ type: "", text: "" });
      }, 1500);
    } catch (error) {
      console.error("Error al actualizar cliente:", error);
      setFormMessage({ type: "error", text: "Error al guardar los cambios" });
    } finally {
      setIsSaving(false);
    }
  };

  const createNewOpportunity = async () => {
    if (
      !selectedCustomer ||
      !opportunityFormData.name ||
      !opportunityFormData.expected_close_date ||
      !opportunityFormData.stage
    ) {
      setFormMessage({
        text: "Por favor complete todos los campos obligatorios",
        type: "error",
      });
      return;
    }

    setIsSaving(true);
    setFormMessage({ type: "", text: "" });

    try {
      // Insertar nueva oportunidad en la base de datos
      const { data, error } = await supabase
        .from("opportunities")
        .insert([
          {
            name: opportunityFormData.name,
            amount: opportunityFormData.amount,
            customer_id: selectedCustomer.id,
            pipeline_id: pipelineId,
            stage_id: opportunityFormData.stage,
            expected_close_date: opportunityFormData.expected_close_date,
            status: "active",
            created_at: new Date().toISOString(),
            organization_id: organizationId,
          },
        ])
        .select();

      if (error) throw error;

      // Actualizar estado local
      if (data && data.length > 0) {
        const newOpportunity = data[0];

        setCustomers((prev) =>
          prev.map((customer) =>
            customer.id === selectedCustomer.id
              ? {
                  ...customer,
                  total_opportunities: customer.total_opportunities + 1,
                  active_opportunities: customer.active_opportunities + 1,
                  total_value:
                    customer.total_value + Number(opportunityFormData.amount),
                  has_opportunities: true,
                  latest_opportunity: {
                    id: newOpportunity.id,
                    name: newOpportunity.name,
                    status: newOpportunity.status,
                    amount: newOpportunity.amount,
                    stage_id: newOpportunity.stage_id,
                    created_at: newOpportunity.created_at,
                  },
                }
              : customer
          )
        );
      }

      setFormMessage({
        type: "success",
        text: "Oportunidad creada correctamente",
      });

      // Cerrar el modal después de un breve tiempo
      setTimeout(() => {
        setIsCreateOpportunityOpen(false);
        setFormMessage({ type: "", text: "" });
      }, 1500);
    } catch (error) {
      console.error("Error al crear oportunidad:", error);
      setFormMessage({ type: "error", text: "Error al crear la oportunidad" });
    } finally {
      setIsSaving(false);
    }
  };

  // Filtrar clientes por búsqueda
  const filteredCustomers = customers
    .filter((customer) => {
      if (!searchQuery) return true;

      const searchLower = searchQuery.toLowerCase();
      return (
        (customer.full_name &&
          customer.full_name.toLowerCase().includes(searchLower)) ||
        (customer.email &&
          customer.email.toLowerCase().includes(searchLower)) ||
        (customer.address &&
          customer.address.toLowerCase().includes(searchLower)) ||
        (customer.phone && customer.phone.toLowerCase().includes(searchLower))
      );
    })
    .sort((a, b) => {
      let valueA, valueB;

      switch (sortField) {
        case "full_name":
          valueA = a.full_name;
          valueB = b.full_name;
          break;
        case "email":
          valueA = a.email || "";
          valueB = b.email || "";
          break;
        case "total_opportunities":
          valueA = a.total_opportunities;
          valueB = b.total_opportunities;
          break;
        case "total_value":
          valueA = a.total_value;
          valueB = b.total_value;
          break;
        default:
          valueA = a.full_name;
          valueB = b.full_name;
          break;
      }

      if (sortDirection === "asc") {
        return valueA < valueB ? -1 : valueA > valueB ? 1 : 0;
      } else {
        return valueA > valueB ? -1 : valueA < valueB ? 1 : 0;
      }
    });

  // Mostrar esqueleto mientras carga
  if (loading) {
    return (
      <div className="p-4">
        <div className="flex justify-center items-center h-40">
          <LoadingSpinner size="lg" className="text-blue-500" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      {/* Diálogos para las acciones del menú */}
      {/* Modal de detalles del cliente */}
      {selectedCustomer && (
        <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
          <DialogContent className="max-w-6xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3 text-xl font-semibold">
                <Users className="h-6 w-6 text-blue-500" />
                Detalles del Cliente
              </DialogTitle>
            </DialogHeader>

            <div className="flex flex-col gap-6 py-6">
              <div className="space-y-4 bg-gray-50 dark:bg-gray-800 p-5 rounded-xl border border-gray-100 dark:border-gray-700">
                <h3 className="font-semibold text-gray-700 dark:text-gray-300">
                  Información de contacto
                </h3>

                <div className="flex flex-col gap-4 text-sm">
                  <div className="flex items-center gap-3">
                    <Users className="h-4 w-4 text-blue-500" />
                    <span className="font-medium">Nombre:</span>
                    <span>{selectedCustomer.full_name}</span>
                  </div>

                  {selectedCustomer.email && (
                    <div className="flex items-center gap-3">
                      <Mail className="h-4 w-4 text-blue-500" />
                      <span className="font-medium">Correo:</span>
                      <a
                        href={`mailto:${selectedCustomer.email}`}
                        className="text-blue-600 hover:underline"
                      >
                        {selectedCustomer.email}
                      </a>
                    </div>
                  )}

                  {selectedCustomer.phone && (
                    <div className="flex items-center gap-3">
                      <Phone className="h-4 w-4 text-blue-500" />
                      <span className="font-medium">Teléfono:</span>
                      <a
                        href={`tel:${selectedCustomer.phone}`}
                        className="text-blue-600 hover:underline"
                      >
                        {selectedCustomer.phone}
                      </a>
                    </div>
                  )}

                  {selectedCustomer.address && (
                    <div className="flex items-start gap-3">
                      <MapPin className="h-4 w-4 text-blue-500 mt-0.5" />
                      <span className="font-medium">Dirección:</span>
                      <span>{selectedCustomer.address}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-4 bg-gray-50 dark:bg-gray-800 p-5 rounded-xl border border-gray-100 dark:border-gray-700">
                <h3 className="font-semibold text-gray-700 dark:text-gray-300">
                  Resumen de oportunidades
                </h3>

                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Total oportunidades:</span>
                    <span className="font-medium text-blue-600">
                      {selectedCustomer.total_opportunities}
                    </span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-sm">Oportunidades activas:</span>
                    <span className="font-medium text-amber-600">
                      {selectedCustomer.active_opportunities}
                    </span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-sm">Oportunidades ganadas:</span>
                    <span className="font-medium text-green-600">
                      {selectedCustomer.won_opportunities}
                    </span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-sm">Valor total:</span>
                    <span className="font-medium text-blue-600">
                      {formatCurrency(selectedCustomer.total_value)}
                    </span>
                  </div>
                </div>
              </div>

              {selectedCustomer.notes && (
                <div className="space-y-3 bg-gray-50 dark:bg-gray-800 p-5 rounded-xl border border-gray-100 dark:border-gray-700">
                  <h3 className="font-semibold text-gray-700 dark:text-gray-300">
                    Notas
                  </h3>
                  <p className="text-sm bg-white dark:bg-gray-900 p-4 rounded-md border border-gray-100 dark:border-gray-700">
                    {selectedCustomer.notes}
                  </p>
                </div>
              )}
            </div>

            <DialogFooter className="sticky bottom-0 bg-white dark:bg-gray-950 pt-3 pb-1 mt-4 border-t border-gray-100 dark:border-gray-800">
              <Button variant="outline" onClick={() => setIsDetailsOpen(false)}>
                Cerrar
              </Button>
              <Button
                onClick={() => {
                  setIsDetailsOpen(false);
                  handleEditCustomer(selectedCustomer);
                }}
              >
                Editar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Modal de edición de cliente */}
      {selectedCustomer && (
        <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-blue-500" />
                Editar Cliente
              </DialogTitle>
            </DialogHeader>

            <form
              className="space-y-4 py-2"
              onSubmit={(e) => {
                e.preventDefault();
                saveCustomerChanges();
              }}
            >
              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="full_name">Nombre completo</Label>
                  <Input
                    id="full_name"
                    value={editFormData.full_name}
                    onChange={(e) =>
                      handleEditFormChange("full_name", e.target.value)
                    }
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Correo electrónico</Label>
                  <Input
                    id="email"
                    type="email"
                    value={editFormData.email}
                    onChange={(e) =>
                      handleEditFormChange("email", e.target.value)
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">Teléfono</Label>
                  <Input
                    id="phone"
                    value={editFormData.phone}
                    onChange={(e) =>
                      handleEditFormChange("phone", e.target.value)
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="address">Dirección</Label>
                  <Input
                    id="address"
                    value={editFormData.address}
                    onChange={(e) =>
                      handleEditFormChange("address", e.target.value)
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Notas</Label>
                  <Input
                    id="notes"
                    value={editFormData.notes}
                    onChange={(e) =>
                      handleEditFormChange("notes", e.target.value)
                    }
                  />
                </div>

                {formMessage.text && (
                  <div
                    className={`mt-2 p-2 text-sm rounded-md ${
                      formMessage.type === "success"
                        ? "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                        : "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                    }`}
                  >
                    {formMessage.text}
                  </div>
                )}
              </div>
            </form>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsEditOpen(false)}
                disabled={isSaving}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                onClick={saveCustomerChanges}
                disabled={isSaving}
              >
                {isSaving ? "Guardando..." : "Guardar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Modal para crear nueva oportunidad */}
      {selectedCustomer && (
        <Dialog
          open={isCreateOpportunityOpen}
          onOpenChange={setIsCreateOpportunityOpen}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Briefcase className="h-5 w-5 text-blue-500" />
                Nueva Oportunidad
              </DialogTitle>
              <DialogDescription>
                Crear una nueva oportunidad para {selectedCustomer.full_name}
              </DialogDescription>
            </DialogHeader>

            <form
              className="space-y-4 py-2"
              onSubmit={(e) => {
                e.preventDefault();
                createNewOpportunity();
              }}
            >
              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nombre de la oportunidad</Label>
                  <Input
                    id="name"
                    placeholder="Ej: Proyecto nuevo"
                    value={opportunityFormData.name}
                    onChange={(e) =>
                      handleOpportunityFormChange("name", e.target.value)
                    }
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="amount">Valor</Label>
                  <Input
                    id="amount"
                    type="number"
                    placeholder="0.00"
                    value={opportunityFormData.amount}
                    onChange={(e) =>
                      handleOpportunityFormChange(
                        "amount",
                        parseFloat(e.target.value) || 0
                      )
                    }
                    required
                    min="0"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="stage">Etapa</Label>
                  <Select
                    value={opportunityFormData.stage}
                    onValueChange={(value) =>
                      handleOpportunityFormChange("stage", value)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar etapa" />
                    </SelectTrigger>
                    <SelectContent>
                      {pipelineStages.length > 0 ? (
                        pipelineStages.map((stage) => (
                          <SelectItem key={stage.id} value={stage.id}>
                            <div className="flex items-center gap-3">
                              <div
                                className="w-2 h-2 rounded-full"
                                style={{
                                  backgroundColor: stage.color || "#888",
                                }}
                              />
                              {stage.name}
                            </div>
                          </SelectItem>
                        ))
                      ) : (
                        <SelectItem value="contacto">
                          Contacto inicial
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="expected_close_date">
                    Fecha estimada de cierre
                  </Label>
                  <Input
                    id="expected_close_date"
                    type="date"
                    value={opportunityFormData.expected_close_date}
                    onChange={(e) =>
                      handleOpportunityFormChange(
                        "expected_close_date",
                        e.target.value
                      )
                    }
                    required
                  />
                </div>

                {formMessage.text && (
                  <div
                    className={`mt-2 p-2 text-sm rounded-md ${
                      formMessage.type === "success"
                        ? "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                        : "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                    }`}
                  >
                    {formMessage.text}
                  </div>
                )}
              </div>
            </form>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsCreateOpportunityOpen(false)}
                disabled={isSaving}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                onClick={createNewOpportunity}
                disabled={isSaving}
              >
                {isSaving ? "Creando..." : "Crear oportunidad"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Modal para ver historial */}
      {selectedCustomer && (
        <Dialog open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-blue-500" />
                Historial del Cliente
              </DialogTitle>
              <DialogDescription>
                Historial de interacciones con {selectedCustomer.full_name}
              </DialogDescription>
            </DialogHeader>

            <div className="py-4">
              {loadingInteractions ? (
                <div className="flex justify-center items-center py-8">
                  <LoadingSpinner size="md" className="text-blue-500" />
                </div>
              ) : customerInteractions.length > 0 ? (
                <div className="space-y-4">
                  {customerInteractions.map((interaction) => (
                    <div
                      key={interaction.id}
                      className="border border-gray-200 dark:border-gray-800 rounded-md p-3"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-medium">
                            {interaction.activity_type.charAt(0).toUpperCase() +
                              interaction.activity_type.slice(1)}
                          </h4>
                          <div className="flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400 mt-1">
                            {interaction.activity_type === "call" && (
                              <Phone className="h-3 w-3" />
                            )}
                            {interaction.activity_type === "email" && (
                              <Mail className="h-3 w-3" />
                            )}
                            {interaction.activity_type === "meeting" && (
                              <Users className="h-3 w-3" />
                            )}
                            {interaction.activity_type === "note" && (
                              <FileText className="h-3 w-3" />
                            )}
                            {!["call", "email", "meeting", "note"].includes(
                              interaction.activity_type
                            ) && <Clock className="h-3 w-3" />}
                            <span>
                              {interaction.metadata?.title ||
                                interaction.activity_type}
                            </span>
                          </div>
                          <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                            {interaction.notes}
                          </p>
                        </div>
                        <div className="text-xs text-gray-500">
                          <CalendarDays className="h-3 w-3 inline-block mr-1" />
                          {new Date(
                            interaction.occurred_at || interaction.created_at
                          ).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-gray-500 dark:text-gray-400 italic text-center p-8">
                  No hay interacciones registradas para este cliente.
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsHistoryOpen(false)}>
                Cerrar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Resumen de clientes */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total de clientes</CardDescription>
            <CardTitle>{customers.length}</CardTitle>
          </CardHeader>
          <CardContent>
            <Users className="h-5 w-5 text-blue-500" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Oportunidades activas</CardDescription>
            <CardTitle>
              {customers.reduce((sum, c) => sum + c.active_opportunities, 0)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Briefcase className="h-5 w-5 text-amber-500" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Oportunidades ganadas</CardDescription>
            <CardTitle>
              {customers.reduce((sum, c) => sum + c.won_opportunities, 0)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Briefcase className="h-5 w-5 text-green-500" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Valor total</CardDescription>
            <CardTitle>
              {formatCurrency(
                customers.reduce((sum, c) => sum + c.total_value, 0)
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Briefcase className="h-5 w-5 text-blue-500" />
          </CardContent>
        </Card>
      </div>

      {/* Búsqueda */}
      <div className="relative flex-grow mb-4 max-w-md">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500 dark:text-gray-400" />
        <Input
          placeholder="Buscar clientes..."
          className="pl-8"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Tabla de clientes */}
      <div className="rounded-md border border-gray-200 dark:border-gray-800">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50 dark:bg-gray-800/50">
              <TableHead
                className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800"
                onClick={() => handleSort("full_name")}
              >
                <div className="flex items-center gap-1">
                  Cliente
                  <ArrowUpDown className="h-3 w-3" />
                </div>
              </TableHead>
              <TableHead>Contacto</TableHead>
              <TableHead
                className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800"
                onClick={() => handleSort("total_opportunities")}
              >
                <div className="flex items-center gap-1">
                  Oportunidades
                  <ArrowUpDown className="h-3 w-3" />
                </div>
              </TableHead>
              <TableHead
                className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 text-right"
                onClick={() => handleSort("total_value")}
              >
                <div className="flex items-center gap-1 justify-end">
                  Valor total
                  <ArrowUpDown className="h-3 w-3" />
                </div>
              </TableHead>
              <TableHead>Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredCustomers.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-center py-8 text-gray-500 dark:text-gray-400"
                >
                  No se encontraron clientes
                </TableCell>
              </TableRow>
            ) : (
              filteredCustomers.map((customer) => (
                <TableRow
                  key={customer.id}
                  className="hover:bg-gray-50 dark:hover:bg-gray-800/50"
                >
                  <TableCell className="font-medium">
                    <div className="flex flex-col">
                      <span className="text-blue-600 dark:text-blue-400">
                        {customer.full_name}
                      </span>
                      {customer.address && (
                        <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 mt-1">
                          <MapPin className="h-3 w-3" />
                          <span>{customer.address}</span>
                        </div>
                      )}
                      {customer.notes && (
                        <div className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300 mt-1 italic line-clamp-1">
                          <FileText className="h-3 w-3" />
                          <span>{customer.notes}</span>
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Building className="h-4 w-4 text-blue-500" />
                      <span className="text-gray-600 dark:text-gray-300 font-medium">
                        {customer.full_name.split(" ")[0]}
                      </span>
                    </div>
                    {customer.created_at && (
                      <div className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                        <CalendarDays className="h-3 w-3" />
                        <span>
                          Desde:{" "}
                          {new Date(customer.created_at).toLocaleDateString(
                            "es-CO"
                          )}
                        </span>
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      {customer.email && (
                        <div className="flex items-center gap-1 text-sm">
                          <Mail className="h-3.5 w-3.5 text-blue-500" />
                          <a
                            href={`mailto:${customer.email}`}
                            className="hover:text-blue-600 hover:underline"
                          >
                            {customer.email}
                          </a>
                        </div>
                      )}
                      {customer.phone && (
                        <div className="flex items-center gap-1 text-sm">
                          <Phone className="h-3.5 w-3.5 text-blue-500" />
                          <a
                            href={`tel:${customer.phone}`}
                            className="hover:text-blue-600 hover:underline"
                          >
                            {customer.phone}
                          </a>
                        </div>
                      )}
                      {!customer.email && !customer.phone && (
                        <span className="text-gray-400 dark:text-gray-500 text-sm">
                          Sin contacto
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-2 items-center">
                      <div className="bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-500 px-2 py-1 rounded-full text-sm font-medium">
                        {customer.total_opportunities}
                      </div>
                      {customer.active_opportunities > 0 && (
                        <div className="bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-500 px-2 py-1 rounded-full text-xs font-medium">
                          {customer.active_opportunities} activas
                        </div>
                      )}
                      {customer.won_opportunities > 0 && (
                        <div className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-500 px-2 py-1 rounded-full text-xs font-medium">
                          {customer.won_opportunities} ganadas
                        </div>
                      )}
                      {/* Las oportunidades perdidas no están disponibles en el modelo actual */}
                    </div>
                    {customer.latest_opportunity && (
                      <div className="mt-1 text-xs text-gray-500 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        <span>
                          Última:{" "}
                          {customer.latest_opportunity.name || "Sin nombre"}
                        </span>
                        {customer.latest_opportunity.status && (
                          <span
                            className={`inline-block px-1.5 py-0.5 rounded text-[10px] ${
                              customer.latest_opportunity.status === "won"
                                ? "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-500"
                                : customer.latest_opportunity.status === "lost"
                                ? "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-500"
                                : "bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-500"
                            }`}
                          >
                            {customer.latest_opportunity.status === "won"
                              ? "ganada"
                              : customer.latest_opportunity.status === "lost"
                              ? "perdida"
                              : "activa"}
                          </span>
                        )}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="font-medium text-blue-700 dark:text-blue-400">
                      {formatCurrency(customer.total_value)}
                    </div>
                    {customer.total_opportunities > 0 && (
                      <div className="text-xs text-gray-500 mt-1 flex items-center justify-end gap-1">
                        <Calculator className="h-3 w-3" />
                        <span>
                          {formatCurrency(
                            customer.total_value / customer.total_opportunities
                          )}{" "}
                          prom.
                        </span>
                      </div>
                    )}
                    {customer.won_opportunities > 0 && (
                      <div className="text-xs text-green-600 dark:text-green-400 mt-1 flex items-center justify-end gap-1">
                        <TrendingUp className="h-3 w-3" />
                        <span>
                          Ganado:{" "}
                          {formatCurrency(
                            customer.opportunities
                              ?.filter((o) => o.status === "won")
                              .reduce(
                                (sum, opp) => sum + parseFloat(opp.amount || 0),
                                0
                              )
                          )}
                        </span>
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                          <span className="sr-only">Abrir menú</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-52">
                        <DropdownMenuItem
                          className="cursor-pointer"
                          onClick={() => handleViewCustomerDetails(customer)}
                        >
                          <Users className="h-4 w-4 mr-2" />
                          Ver detalles del cliente
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="cursor-pointer"
                          onClick={() => handleEditCustomer(customer)}
                        >
                          <FileText className="h-4 w-4 mr-2" />
                          Editar información
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="cursor-pointer"
                          onClick={() => handleCreateOpportunity(customer)}
                        >
                          <Briefcase className="h-4 w-4 mr-2" />
                          Crear nueva oportunidad
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="cursor-pointer"
                          onClick={() => handleSendEmail(customer)}
                        >
                          <Mail className="h-4 w-4 mr-2" />
                          Enviar correo
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="cursor-pointer"
                          onClick={() => handleViewHistory(customer)}
                        >
                          <Clock className="h-4 w-4 mr-2" />
                          Ver historial
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default ClientsView;
