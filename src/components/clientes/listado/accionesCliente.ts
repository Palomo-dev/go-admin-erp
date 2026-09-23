/**
 * Acciones de un cliente: menú «⋯» de la fila, hoja de acciones móvil y menú
 * de la cabecera de la ficha. Una sola lista para las tres (Figma Clientes,
 * frame «hoja de acciones» 711:352552):
 *
 *   Ver · Editar · Registrar pago · Nueva venta · Nueva oportunidad · Llamar ·
 *   WhatsApp · Estado de cuenta · Copiar identificador · Marcar inactivo · Eliminar
 *
 * Lo que aún no tiene backend va **deshabilitado con su motivo**, no escondido.
 */
import {
  Copy,
  Eye,
  FileText,
  HandCoins,
  MessageCircle,
  Pencil,
  Phone,
  Power,
  RotateCcw,
  ShoppingCart,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import type { AccionFila } from '@/components/kit';
import { telefonoWhatsApp } from '@/lib/services/clientesListadoService';

/**
 * Traductor del namespace `clientes.listado` (`useTranslations('clientes.listado')`).
 * Sin él, los textos salen en español (tests y llamadas antiguas).
 */
export type TraductorClientes = (clave: string, valores?: Record<string, string | number>) => string;

export interface ClienteParaAcciones {
  id: string;
  nombre: string;
  phone: string | null;
  status: string | null;
}

export interface ContextoAccionesCliente {
  navegar: (ruta: string) => void;
  onCambiarEstado: (cliente: ClienteParaAcciones, estado: 'active' | 'inactive') => void;
  onEliminar: (cliente: ClienteParaAcciones) => void;
  onCopiarId: (cliente: ClienteParaAcciones) => void;
  /** En la ficha, «Ver detalle» sobra. */
  omitirVer?: boolean;
  /** Indicativo del país de la organización para WhatsApp (57 por defecto). */
  indicativo?: string;
  /** `useTranslations('clientes.listado')`; sin él, español. */
  t?: TraductorClientes;
}

export const MOTIVO_REGISTRAR_PAGO =
  'Aún no disponible: el cobro desde la ficha llega con el pago unificado. Mientras tanto, usa Cuentas por cobrar.';
export const MOTIVO_ESTADO_CUENTA = 'Aún no disponible: el estado de cuenta en PDF está en construcción.';
export const MOTIVO_UNIFICAR = 'Aún no disponible: la unificación que mueve ventas, cartera y reservas está en construcción.';

/** Textos en español cuando no llega traductor (mismas claves que `clientes.listado`). */
const ESPANOL: Record<string, string> = {
  'acciones.ver': 'Ver detalle',
  'acciones.editar': 'Editar',
  'acciones.registrarPago': 'Registrar pago',
  'acciones.nuevaVenta': 'Nueva venta',
  'acciones.nuevaOportunidad': 'Nueva oportunidad',
  'acciones.llamar': 'Llamar',
  'acciones.whatsapp': 'WhatsApp',
  'acciones.estadoCuenta': 'Estado de cuenta',
  'acciones.copiarId': 'Copiar identificador',
  'acciones.reactivar': 'Reactivar',
  'acciones.marcarInactivo': 'Marcar inactivo',
  'acciones.eliminar': 'Eliminar',
  'motivos.registrarPago': MOTIVO_REGISTRAR_PAGO,
  'motivos.estadoCuenta': MOTIVO_ESTADO_CUENTA,
  'motivos.sinTelefono': 'Sin teléfono registrado',
  'motivos.sinTelefonoValido': 'Sin teléfono válido registrado',
};
const enEspanol: TraductorClientes = (clave) => ESPANOL[clave] ?? clave;

export function construirAccionesCliente(c: ClienteParaAcciones, ctx: ContextoAccionesCliente): AccionFila[] {
  const whatsapp = telefonoWhatsApp(c.phone, ctx.indicativo);
  const inactivo = c.status === 'inactive';
  const t = ctx.t ?? enEspanol;

  return [
    {
      id: 'ver',
      etiqueta: t('acciones.ver'),
      icono: Eye,
      onSelect: () => ctx.navegar(`/app/clientes/${c.id}`),
      oculta: ctx.omitirVer,
    },
    { id: 'editar', etiqueta: t('acciones.editar'), icono: Pencil, onSelect: () => ctx.navegar(`/app/clientes/${c.id}/editar`) },
    {
      id: 'registrar-pago',
      etiqueta: t('acciones.registrarPago'),
      icono: HandCoins,
      onSelect: () => undefined,
      deshabilitada: true,
      motivo: t('motivos.registrarPago'),
    },
    {
      id: 'nueva-venta',
      etiqueta: t('acciones.nuevaVenta'),
      icono: ShoppingCart,
      onSelect: () => ctx.navegar(`/app/finanzas/facturas-venta/nuevo?cliente=${encodeURIComponent(c.id)}`),
    },
    {
      id: 'nueva-oportunidad',
      etiqueta: t('acciones.nuevaOportunidad'),
      icono: TrendingUp,
      onSelect: () => ctx.navegar(`/app/crm/oportunidades/nuevo?cliente=${encodeURIComponent(c.id)}`),
    },
    {
      id: 'llamar',
      etiqueta: t('acciones.llamar'),
      icono: Phone,
      onSelect: () => {
        if (c.phone) window.location.href = `tel:${c.phone.replace(/[^\d+]/g, '')}`;
      },
      deshabilitada: !c.phone,
      motivo: c.phone ? undefined : t('motivos.sinTelefono'),
    },
    {
      id: 'whatsapp',
      etiqueta: t('acciones.whatsapp'),
      icono: MessageCircle,
      onSelect: () => {
        if (whatsapp) window.open(`https://wa.me/${whatsapp}`, '_blank', 'noopener,noreferrer');
      },
      deshabilitada: !whatsapp,
      motivo: whatsapp ? undefined : t('motivos.sinTelefonoValido'),
    },
    {
      id: 'estado-cuenta',
      etiqueta: t('acciones.estadoCuenta'),
      icono: FileText,
      onSelect: () => undefined,
      deshabilitada: true,
      motivo: t('motivos.estadoCuenta'),
    },
    { id: 'copiar-id', etiqueta: t('acciones.copiarId'), icono: Copy, onSelect: () => ctx.onCopiarId(c) },
    inactivo
      ? { id: 'reactivar', etiqueta: t('acciones.reactivar'), icono: RotateCcw, onSelect: () => ctx.onCambiarEstado(c, 'active') }
      : { id: 'inactivar', etiqueta: t('acciones.marcarInactivo'), icono: Power, onSelect: () => ctx.onCambiarEstado(c, 'inactive') },
    { id: 'eliminar', etiqueta: t('acciones.eliminar'), icono: Trash2, destructiva: true, onSelect: () => ctx.onEliminar(c) },
  ];
}
