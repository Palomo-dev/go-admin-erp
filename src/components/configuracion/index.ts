export { ConfiguracionLayout } from './layout/ConfiguracionLayout';
export { ConfiguracionSidebar } from './layout/ConfiguracionSidebar';
export { ConfiguracionSidebarItem } from './layout/ConfiguracionSidebarItem';
export { ConfiguracionHeader } from './layout/ConfiguracionHeader';
export { ConfiguracionSearch } from './layout/ConfiguracionSearch';
export { ConfiguracionEmpty } from './layout/ConfiguracionEmpty';
export { ConfiguracionPanelRenderer } from './layout/ConfiguracionPanelRenderer';

export { useConfiguracionState } from './hooks/useConfiguracionState';
export { useActiveConfigModules } from './hooks/useActiveConfigModules';

export {
  CONFIG_MODULES,
  getConfigModule,
  getDefaultSection,
  getModuleByCode,
  type ConfigModule,
  type ConfigSection,
} from './config/configModulesRegistry';
