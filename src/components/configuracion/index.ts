export { ConfiguracionPanelRenderer } from './layout/ConfiguracionPanelRenderer';
export { AtajoConfigurar } from './AtajoConfigurar';
export { abrirConfiguracion, EVENTO_ABRIR_CONFIGURACION, type OpcionesAbrirConfiguracion } from './dialogo/abrirConfiguracion';
export { useRegistrarCambios, contarCambios, type CambiosPanel } from './dialogo/cambiosSinGuardar';

export { useSeccionesPermitidas } from './hooks/useSeccionesPermitidas';

export {
  CONFIG_MODULES,
  GRUPOS_CONFIG,
  ENTRADAS_EXTRA,
  getConfigModule,
  getModuleByCode,
  type ConfigModule,
  type GrupoConfig,
} from './config/configModulesRegistry';
export {
  SECCIONES_CONFIG,
  RUTAS_MOVIDAS,
  rutaSeccion,
  seccionPorId,
  type SeccionConfig,
  type AjusteConfig,
} from './config/configSectionsRegistry';
