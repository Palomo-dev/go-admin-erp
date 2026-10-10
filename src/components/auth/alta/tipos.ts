/**
 * Datos del asistente de alta de organización (registro y «Nueva organización»).
 * Se convierten a `DatosAltaOrganizacion` (lib/services/altaOrganizacionService).
 */
import { UBICACION_VACIA, type Ubicacion } from '@/components/kit/CampoUbicacion';
import { TARIFA_POR_DEFECTO_INICIAL, type CodigoTarifaPorDefecto } from '@/lib/services/defaultTaxService';
import type { DatosAltaOrganizacion } from '@/lib/services/altaOrganizacionService';
import { codigoPlan } from '@/lib/services/altaOrganizacionService';

export interface OrganizacionAlta {
  nombre: string;
  razonSocial: string;
  tipoId: string;
  nit: string;
  dv: string;
  correo: string;
  telefono: string;
  ubicacion: Ubicacion;
  subdominio: string;
  direccion: string;
  codigoPostal: string;
  sitioWeb: string;
  descripcion: string;
  tarifa: CodigoTarifaPorDefecto;
  logoUrl: string | null;
  colorPrimario: string;
  colorSecundario: string;
}

export interface SucursalAlta {
  mismaUbicacion: boolean;
  nombre: string;
  codigo: string;
  direccion: string;
  ubicacion: Ubicacion;
  telefono: string;
}

export interface PlanAlta {
  subscriptionPlan: string;
  billingPeriod: 'monthly' | 'yearly';
  skipTrial: boolean;
  couponCode?: string;
  stripeCustomerId?: string;
  stripePaymentMethodId?: string;
}

export const ORGANIZACION_INICIAL = (correo = ''): OrganizacionAlta => ({
  nombre: '',
  razonSocial: '',
  tipoId: '',
  nit: '',
  dv: '',
  correo,
  telefono: '',
  ubicacion: UBICACION_VACIA,
  subdominio: '',
  direccion: '',
  codigoPostal: '',
  sitioWeb: '',
  descripcion: '',
  tarifa: TARIFA_POR_DEFECTO_INICIAL,
  logoUrl: null,
  colorPrimario: '#3B82F6',
  colorSecundario: '#F59E0B',
});

export const SUCURSAL_INICIAL: SucursalAlta = {
  mismaUbicacion: true,
  nombre: '',
  codigo: 'MAIN-001',
  direccion: '',
  ubicacion: UBICACION_VACIA,
  telefono: '',
};

/** Plan Pro mensual con «Pagar ahora» elegido. «Usar días gratis» sigue disponible. */
export const PLAN_INICIAL: PlanAlta = { subscriptionPlan: 'pro', billingPeriod: 'monthly', skipTrial: true };

/** Dígito de verificación del NIT (DIAN, módulo 11). */
export function calcularDV(nit: string): string {
  const limpio = nit.replace(/[^0-9]/g, '');
  if (!limpio) return '';
  const pesos = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];
  const reverso = limpio.split('').reverse();
  let suma = 0;
  for (let i = 0; i < reverso.length; i++) suma += Number(reverso[i]) * (pesos[i] ?? pesos[pesos.length - 1]);
  const residuo = suma % 11;
  return residuo === 0 || residuo === 1 ? String(residuo) : String(11 - residuo);
}

/** «Mi Empresa S.A.S.» → «miempresasas» (3 a 30, solo letras y números). */
export function sugerirSubdominio(nombre: string): string {
  let s = nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
  if (s && s.length < 3) s += 'org';
  return s.slice(0, 30);
}

/** Datos de la sucursal que se envían: con «misma ubicación», los de la organización. */
export function sucursalEfectiva(org: OrganizacionAlta, suc: SucursalAlta) {
  const u = suc.mismaUbicacion ? org.ubicacion : suc.ubicacion;
  return {
    nombre: suc.nombre.trim() || undefined,
    codigo: suc.codigo.trim() || undefined,
    direccion: (suc.mismaUbicacion ? org.direccion : suc.direccion).trim() || undefined,
    ciudad: u.ciudad || undefined,
    departamento: u.departamento || undefined,
    departamentoCodigo: u.departamentoCodigo || undefined,
    paisCodigo: u.paisCodigo || org.ubicacion.paisCodigo,
    paisNombre: u.paisNombre || org.ubicacion.paisNombre,
    municipioId: u.municipioId || undefined,
    codigoPostal: suc.mismaUbicacion ? org.codigoPostal || undefined : undefined,
    telefono: (suc.telefono || (suc.mismaUbicacion ? org.telefono : '')) || undefined,
    correo: org.correo || undefined,
    nit: org.nit || undefined,
  };
}

/** Todo el asistente → cuerpo del servicio de alta. */
export function datosParaAlta(
  org: OrganizacionAlta,
  suc: SucursalAlta,
  plan: PlanAlta,
  extra: { zonaHoraria?: string | null; referido?: string | null; nombreCliente?: string },
): DatosAltaOrganizacion {
  return {
    organizacion: {
      nombre: org.nombre.trim(),
      razonSocial: org.razonSocial.trim() || org.nombre.trim(),
      tipoId: org.tipoId ? Number(org.tipoId) : null,
      descripcion: org.descripcion.trim() || undefined,
      correo: org.correo.trim() || undefined,
      telefono: org.telefono || undefined,
      sitioWeb: org.sitioWeb.trim() || undefined,
      nit: org.nit.replace(/[^0-9]/g, '') || undefined,
      dv: org.nit ? org.dv || calcularDV(org.nit) : undefined,
      direccion: org.direccion.trim() || undefined,
      ciudad: org.ubicacion.ciudad || undefined,
      departamento: org.ubicacion.departamento || undefined,
      paisCodigo: org.ubicacion.paisCodigo,
      paisNombre: org.ubicacion.paisNombre || undefined,
      municipioId: org.ubicacion.municipioId || undefined,
      codigoPostal: org.codigoPostal.trim() || undefined,
      colorPrimario: org.colorPrimario,
      colorSecundario: org.colorSecundario,
      subdominio: org.subdominio.trim() || undefined,
      logoUrl: org.logoUrl,
    },
    sucursal: sucursalEfectiva(org, suc),
    planCodigo: codigoPlan(plan.subscriptionPlan),
    periodo: plan.billingPeriod,
    sinPrueba: plan.skipTrial,
    zonaHoraria: extra.zonaHoraria ?? null,
    tarifaPorDefecto: org.tarifa,
    referido: extra.referido ?? null,
    stripe: {
      customerId: plan.stripeCustomerId,
      paymentMethodId: plan.stripePaymentMethodId,
      cupon: plan.couponCode,
      nombreCliente: extra.nombreCliente,
    },
  };
}
