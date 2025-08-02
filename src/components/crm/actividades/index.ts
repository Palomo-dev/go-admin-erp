// Exportaciones principales del módulo de actividades CRM

// Core components
export { ActividadesManager } from './core/ActividadesManager';
export { ActividadesDataLoader } from './core/ActividadesDataLoader';

// Form components
export { FiltrosActividades } from './forms/FiltrosActividades';

// UI components
export { ActividadesList } from './ui/ActividadesList';
export { ActividadItem } from './ui/ActividadItem';
export { ActividadIcon } from './ui/ActividadIcon';
export { ActividadModal } from './ui/ActividadModal';
export { ActividadContextPanel } from './ui/ActividadContextPanel';
export { ActividadesStats } from './ui/ActividadesStats';

// Types (re-export from types)
export type {
  Activity,
  ActivityFilter,
  ActivityResponse,
  NewActivity,
  ActivityType,
  ActivityMetadata,
  ActivityAttachment,
  ActivityLink
} from '@/types/activity';

// Constants
export { ACTIVITY_TYPE_CONFIG } from '@/types/activity';
