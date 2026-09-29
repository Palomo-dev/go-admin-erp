/**
 * Kit del acceso (auth v3): escena del viajero, tarjeta flotante y piezas.
 * Figma: `02 Componentes` (Acceso, Átomos, Formularios, Fundamentos ›
 * Ilustración). Documentación: docs/design/AUTH-ACCESO-V2.md §11 y §13.
 */
export { EscenaAcceso, type EscenaAccesoProps } from './EscenaAcceso';
export { TarjetaAcceso, type TarjetaAccesoProps, type AnchoTarjeta } from './TarjetaAcceso';
export {
  Enlace,
  DividerTexto,
  IconoDestacado,
  PieEnlace,
  ProgresoPasos,
  AvisoAcceso,
  BotonProveedor,
  type EnlaceProps,
  type TonoEnlace,
  type TonoIcono,
  type ProgresoPasosProps,
  type TonoAviso,
  type AvisoAccesoProps,
} from './piezas';
export { CampoContrasena, type CampoContrasenaProps } from './CampoContrasena';
export { MedidorFortaleza, useEvaluacionContrasena, type MedidorFortalezaProps } from './MedidorFortaleza';
export { PhoneField, type PhoneFieldProps } from './PhoneField';
export { PreferenciasAcceso, SelectorIdiomaCompacto, BotonTemaAcceso } from './PreferenciasAcceso';
export { ViajeroDePie, ViajeroSentado, Planeta, Cohete, Luna, Nube, EstrellaTrazo } from './ilustraciones';
export { TarjetaOrganizacion, type TarjetaOrganizacionProps } from './TarjetaOrganizacion';
