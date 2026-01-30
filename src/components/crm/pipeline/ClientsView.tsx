"use client";

import React, { useState, useEffect, useMemo } from "react";
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
import ClientsPagination from "./components/ClientsPagination";

interface ClientsViewProps {
  pipelineId: string;
}

/**
 * Vista principal para gestión de clientes y oportunidades
 * Esta versión utiliza componentes modulares y hooks personalizados
 * para mejorar la mantenibilidad y organización del código.
 */
const ClientsView: React.FC<ClientsViewProps> = ({ pipelineId }) => {
  // Estados de paginación
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  
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
  
  // Calcular paginación
  const totalPages = Math.ceil(filteredCustomers.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedCustomers = useMemo(() => {
    return filteredCustomers.slice(startIndex, endIndex);
  }, [filteredCustomers, startIndex, endIndex]);
  
  // Resetear página cuando cambia el pageSize o la búsqueda
  useEffect(() => {
    setCurrentPage(1);
  }, [pageSize, searchQuery]);

  // Ya tenemos acceso al estado de error desde el hook

  // Si estamos cargando, mostrar spinner
  if (loading) {
    return (
      <div className="flex flex-col justify-center items-center h-[60vh] gap-3">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 dark:border-blue-400"></div>
        <span className="text-sm text-gray-600 dark:text-gray-400">Cargando clientes...</span>
      </div>
    );
  }

  // Si hay un error, mostrarlo
  if (error) {
    return (
      <div className="flex flex-col justify-center items-center h-[60vh] p-4">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-800 text-red-700 dark:text-red-400 px-4 sm:px-6 py-4 rounded-lg max-w-lg">
          <h3 className="font-bold mb-2 text-base sm:text-lg">Error al cargar datos</h3>
          <p className="text-sm sm:text-base">{error}</p>
          <p className="mt-4 text-xs sm:text-sm text-red-600 dark:text-red-400">Sugerencia: Verifica la conexión a Supabase y el ID de organización.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-4 sm:space-y-6 p-3 sm:p-4">
      {/* Título y descripción */}
      <div>
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Clientes</h2>
        <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400 mt-1">
          Gestiona y haz seguimiento a todos tus clientes en el pipeline.
        </p>
      </div>

      {/* Estadísticas de clientes */}
      <CustomerStats 
        customers={filteredCustomers}
      />

      {/* Barra de búsqueda */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 sm:h-5 sm:w-5 text-gray-500 dark:text-gray-400" />
          <Input
            placeholder="Buscar clientes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 sm:pl-10 h-11 sm:h-12 text-sm sm:text-base bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400"
          />
        </div>
        <Button
          variant="outline"
          onClick={() => setSearchQuery("")}
          disabled={!searchQuery}
          className="min-h-[44px] border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
        >
          Limpiar
        </Button>
      </div>

      {/* Tabla de clientes */}
      <CustomersTable 
        customers={paginatedCustomers}
        sortField={sortField}
        sortDirection={sortDirection}
        onSort={handleSort}
        onViewDetails={handleViewCustomer}
        onEdit={handleEditCustomer}
        onCreateOpportunity={handleCreateOpportunity}
        onViewHistory={handleViewHistory}
      />
      
      {/* Paginación */}
      {filteredCustomers.length > 0 && (
        <div className="mt-4 p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <ClientsPagination
            currentPage={currentPage}
            totalPages={totalPages}
            pageSize={pageSize}
            totalItems={filteredCustomers.length}
            onPageChange={setCurrentPage}
            onPageSizeChange={setPageSize}
          />
        </div>
      )}

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
