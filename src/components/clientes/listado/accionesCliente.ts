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
}

export const MOTIVO_REGISTRAR_PAGO =
  'Aún no disponible: el cobro desde la ficha llega con el pago unificado. Mientras tanto, usa Cuentas por cobrar.';
export const MOTIVO_ESTADO_CUENTA = 'Aún no disponible: el estado de cuenta en PDF está en construcción.';
export const MOTIVO_UNIFICAR = 'Aún no disponible: la unificación que mueve ventas, cartera y reservas está en construcción.';

export function construirAccionesCliente(c: ClienteParaAcciones, ctx: ContextoAccionesCliente): AccionFila[] {
  const whatsapp = telefonoWhatsApp(c.phone, ctx.indicativo);
  const inactivo = c.status === 'inactive';

  return [
    {
      id: 'ver',
      etiqueta: 'Ver detalle',
      icono: Eye,
      onSelect: () => ctx.navegar(`/app/clientes/${c.id}`),
      oculta: ctx.omitirVer,
    },
    { id: 'editar', etiqueta: 'Editar', icono: Pencil, onSelect: () => ctx.navegar(`/app/clientes/${c.id}/editar`) },
    {
      id: 'registrar-pago',
      etiqueta: 'Registrar pago',
      icono: HandCoins,
      onSelect: () => undefined,
      deshabilitada: true,
      motivo: MOTIVO_REGISTRAR_PAGO,
    },
    {
      id: 'nueva-venta',
      etiqueta: 'Nueva venta',
      icono: ShoppingCart,
      onSelect: () => ctx.navegar(`/app/finanzas/facturas-venta/nuevo?cliente=${encodeURIComponent(c.id)}`),
    },
    {
      id: 'nueva-oportunidad',
      etiqueta: 'Nueva oportunidad',
      icono: TrendingUp,
      onSelect: () => ctx.navegar(`/app/crm/oportunidades/nuevo?cliente=${encodeURIComponent(c.id)}`),
    },
    {
      id: 'llamar',
      etiqueta: 'Llamar',
      icono: Phone,
      onSelect: () => {
        if (c.phone) window.location.href = `tel:${c.phone.replace(/[^\d+]/g, '')}`;
      },
      deshabilitada: !c.phone,
      motivo: c.phone ? undefined : 'Sin teléfono registrado',
    },
    {
      id: 'whatsapp',
      etiqueta: 'WhatsApp',
      icono: MessageCircle,
      onSelect: () => {
        if (whatsapp) window.open(`https://wa.me/${whatsapp}`, '_blank', 'noopener,noreferrer');
      },
      deshabilitada: !whatsapp,
      motivo: whatsapp ? undefined : 'Sin teléfono válido registrado',
    },
    {
      id: 'estado-cuenta',
      etiqueta: 'Estado de cuenta',
      icono: FileText,
      onSelect: () => undefined,
      deshabilitada: true,
      motivo: MOTIVO_ESTADO_CUENTA,
    },
    { id: 'copiar-id', etiqueta: 'Copiar identificador', icono: Copy, onSelect: () => ctx.onCopiarId(c) },
    inactivo
      ? { id: 'reactivar', etiqueta: 'Reactivar', icono: RotateCcw, onSelect: () => ctx.onCambiarEstado(c, 'active') }
      : { id: 'inactivar', etiqueta: 'Marcar inactivo', icono: Power, onSelect: () => ctx.onCambiarEstado(c, 'inactive') },
    { id: 'eliminar', etiqueta: 'Eliminar', icono: Trash2, destructiva: true, onSelect: () => ctx.onEliminar(c) },
  ];
}
