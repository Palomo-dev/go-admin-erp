export { ConfiguracionLayout } from './layout/ConfiguracionLayout';
export { ConfiguracionHeader } from './layout/ConfiguracionHeader';
export { ConfiguracionEmpty } from './layout/ConfiguracionEmpty';
export { ConfiguracionPanelRenderer } from './layout/ConfiguracionPanelRenderer';

export { useConfiguracionState } from './hooks/useConfiguracionState';
export { useActiveConfigModules } from './hooks/useActiveConfigModules';

export {
  CONFIG_MODULES,
  getConfigModule,
  getModuleByCode,
  type ConfigModule,
} from './config/configModulesRegistry';
