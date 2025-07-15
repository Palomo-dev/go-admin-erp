// Exportaciones centralizadas para componentes de pipeline
// Componentes originales
import KanbanColumn from './KanbanColumn';
import { KanbanSummary } from './KanbanSummary';
import { KanbanBoard } from './KanbanBoard';
import { StageManager } from './StageManager';
import { CustomerList } from './CustomerList';
import { CustomerCard } from './CustomerCard';
import { CustomerSummary } from './CustomerSummary';
import { CustomerDashboard } from './CustomerDashboard';

// Nuevos componentes modales
import CustomerDetailsModal from './modals/CustomerDetailsModal';
import EditCustomerModal from './modals/EditCustomerModal';
import CreateOpportunityModal from './modals/CreateOpportunityModal';
import CustomerHistoryModal from './modals/CustomerHistoryModal';

// Nuevos componentes de tabla y estadísticas
import CustomerStats from './components/CustomerStats';
import CustomersTable from './components/CustomersTable';

// Utilidades y servicios
import * as pipelineUtils from './utils/pipelineUtils';
import * as pipelineService from './services/pipelineService';

// Hooks personalizados
import { usePipeline } from './hooks/usePipeline';

// Exportación de componentes originales
export {
  KanbanColumn,
  KanbanSummary,
  KanbanBoard,
  StageManager,
  CustomerList,
  CustomerCard,
  CustomerSummary,
  CustomerDashboard
};

// Exportación de nuevos componentes modales
export {
  CustomerDetailsModal,
  EditCustomerModal,
  CreateOpportunityModal,
  CustomerHistoryModal
};

// Exportación de componentes de tabla y estadísticas
export {
  CustomerStats,
  CustomersTable
};

// Exportación de utilidades y servicios
export {
  pipelineUtils,
  pipelineService,
  usePipeline
};
