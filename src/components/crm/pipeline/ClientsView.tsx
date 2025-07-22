"use client";

import React from "react";
import { usePipeline } from "./hooks/usePipeline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

// Componentes modulares
import CustomerDetailsModal from "./modals/CustomerDetailsModal";
import EditCustomerModal from "./modals/EditCustomerModal";
import CreateOpportunityModal from "./modals/CreateOpportunityModal";
import CustomerHistoryModal from "./modals/CustomerHistoryModal";
import CustomerStats from "./components/CustomerStats";
import CustomersTable from "./components/CustomersTable";

interface ClientsViewProps {
  pipelineId: string;
}

/**
 * Vista principal para gestión de clientes y oportunidades
 * Esta versión utiliza componentes modulares y hooks personalizados
 * para mejorar la mantenibilidad y organización del código.
 */
const ClientsView: React.FC<ClientsViewProps> = ({ pipelineId }) => {
  // Utilizar el hook personalizado para toda la lógica de pipeline
  const {
    // Estado
    filteredCustomers,
    pipelineStages,
    loading,
    selectedCustomer,
    customerInteractions,
    loadingInteractions,
    searchQuery,
    sortField,
    sortDirection,
    isDetailsOpen,
    isEditOpen,
    isHistoryOpen,
    isCreateOpportunityOpen,
    editFormData,
    opportunityFormData,
    formMessage,
    isSaving,
    error,
    
    // Setters
    setSearchQuery,
    setIsDetailsOpen,
    setIsEditOpen,
    setIsHistoryOpen,
    setIsCreateOpportunityOpen,
    
    // Acciones
    handleViewCustomer,
    handleEditCustomer,
    handleCreateOpportunity,
    handleViewHistory,
    handleEditFormChange,
    handleOpportunityFormChange,
    saveCustomerChanges,
    createNewOpportunity,
    handleSort
  } = usePipeline(pipelineId);

  // Ya tenemos acceso al estado de error desde el hook

  // Si estamos cargando, mostrar spinner
  if (loading) {
    return (
      <div className="flex justify-center items-center h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  // Si hay un error, mostrarlo
  if (error) {
    return (
      <div className="flex flex-col justify-center items-center h-[60vh]">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded max-w-lg">
          <h3 className="font-bold mb-2">Error al cargar datos</h3>
          <p>{error}</p>
          <p className="mt-4 text-sm">Sugerencia: Verifica la conexión a Supabase y el ID de organización.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-6">
      {/* Título y descripción */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Clientes</h2>
        <p className="text-muted-foreground">
          Gestiona y haz seguimiento a todos tus clientes en el pipeline.
        </p>
      </div>

      {/* Estadísticas de clientes */}
      <CustomerStats 
        customers={filteredCustomers}
      />

      {/* Barra de búsqueda */}
      <div className="flex items-center space-x-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar clientes por nombre, correo o teléfono..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8"
          />
        </div>
        <Button
          variant="outline"
          onClick={() => setSearchQuery("")}
          disabled={!searchQuery}
        >
          Limpiar
        </Button>
      </div>

      {/* Tabla de clientes */}
      <CustomersTable 
        customers={filteredCustomers}
        sortField={sortField}
        sortDirection={sortDirection}
        onSort={handleSort}
        onViewDetails={handleViewCustomer}
        onEdit={handleEditCustomer}
        onCreateOpportunity={handleCreateOpportunity}
        onViewHistory={handleViewHistory}
      />

      {/* Modal de detalles del cliente */}
      <CustomerDetailsModal 
        isOpen={isDetailsOpen}
        onClose={() => setIsDetailsOpen(false)}
        customer={selectedCustomer}
        onEdit={handleEditCustomer}
      />

      {/* Modal de edición de cliente */}
      <EditCustomerModal 
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        customer={selectedCustomer}
        formData={editFormData}
        onFormChange={handleEditFormChange}
        onSave={saveCustomerChanges}
        isSaving={isSaving}
        formMessage={formMessage}
      />

      {/* Modal de creación de oportunidad */}
      <CreateOpportunityModal 
        isOpen={isCreateOpportunityOpen}
        onClose={() => setIsCreateOpportunityOpen(false)}
        customer={selectedCustomer}
        pipelineStages={pipelineStages}
        formData={opportunityFormData}
        onFormChange={handleOpportunityFormChange}
        onCreate={createNewOpportunity}
        isSaving={isSaving}
        formMessage={formMessage}
      />

      {/* Modal de historial del cliente */}
      <CustomerHistoryModal 
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        customer={selectedCustomer}
        interactions={customerInteractions}
        isLoading={loadingInteractions}
      />
    </div>
  );
};

export default ClientsView;
