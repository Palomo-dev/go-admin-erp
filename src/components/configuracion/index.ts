export { ConfiguracionLayout } from './layout/ConfiguracionLayout';
export { ConfiguracionPanelRenderer } from './layout/ConfiguracionPanelRenderer';
export { AtajoConfigurar } from './AtajoConfigurar';

export { useConfiguracionState } from './hooks/useConfiguracionState';
export { useSeccionesPermitidas } from './hooks/useSeccionesPermitidas';

export {
  CONFIG_MODULES,
  getConfigModule,
  getModuleByCode,
  type ConfigModule,
} from './config/configModulesRegistry';
export {
  SECCIONES_CONFIG,
  RUTAS_MOVIDAS,
  rutaSeccion,
  seccionPorId,
  type SeccionConfig,
  type AjusteConfig,
} from './config/configSectionsRegistry';
