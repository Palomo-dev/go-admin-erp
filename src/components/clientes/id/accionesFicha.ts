/**
 * Menú «⋯» de la cabecera de la ficha del cliente (Figma 06 Clientes,
 * 332:119080). Dos grupos y lo destructivo al final:
 *
 *   Acciones:      Editar cliente · Registrar pago · Nueva venta ·
 *                  Nueva oportunidad · Estado de cuenta (PDF) · Exportar ficha
 *   Ciclo de vida: Marcar como inactivo (o Reactivar) · Unificar con otro cliente
 *   ───            Eliminar cliente
 *
 * El menú de la fila del listado (`listado/accionesCliente.ts`) es otro: allí
 * van Llamar, WhatsApp y Copiar identificador, que en la ficha ya están en la
 * barra de acciones rápidas. Lo que aún no existe va deshabilitado con motivo.
 */
import { Download, FileText, HandCoins, Pencil, Power, RotateCcw, ShoppingCart, Trash2, TrendingUp, Users } from 'lucide-react';
import type { AccionFila } from '@/components/kit';

export interface ContextoAccionesFicha {
  clienteId: string;
  inactivo: boolean;
  /** Textos del menú: `useTranslations('clientes.ficha')` con prefijo `menu.`/`motivos.`. */
  t: (clave: string) => string;
  navegar: (ruta: string) => void;
  onRegistrarPago: () => void;
  /** Motivo por el que no se puede cobrar (ya traducido) o `null`. */
  motivoPago: string | null;
  /** «Nueva oportunidad» del CRM (hoja lateral); sin ella, la página del CRM. */
  onNuevaOportunidad?: () => void;
  onEstadoCuenta: () => void;
  motivoEstadoCuenta: string | null;
  onCambiarEstado: (estado: 'active' | 'inactive') => void;
  onEliminar: () => void;
}

export function construirAccionesFicha(ctx: ContextoAccionesFicha): AccionFila[] {
  const { t } = ctx;
  const id = encodeURIComponent(ctx.clienteId);
  return [
    { id: 'editar', etiqueta: t('menu.editar'), icono: Pencil, onSelect: () => ctx.navegar(`/app/clientes/${id}/editar`) },
    {
      id: 'registrar-pago',
      etiqueta: t('menu.registrarPago'),
      icono: HandCoins,
      onSelect: ctx.onRegistrarPago,
      deshabilitada: !!ctx.motivoPago,
      motivo: ctx.motivoPago ?? undefined,
    },
    {
      id: 'nueva-venta',
      etiqueta: t('menu.nuevaVenta'),
      icono: ShoppingCart,
      onSelect: () => ctx.navegar(`/app/finanzas/facturas-venta/nuevo?cliente=${id}`),
    },
    {
      id: 'nueva-oportunidad',
      etiqueta: t('menu.nuevaOportunidad'),
      icono: TrendingUp,
      onSelect: () => (ctx.onNuevaOportunidad ? ctx.onNuevaOportunidad() : ctx.navegar(`/app/crm/oportunidades/nuevo?cliente=${id}`)),
    },
    {
      id: 'estado-cuenta',
      etiqueta: t('menu.estadoCuenta'),
      icono: FileText,
      onSelect: ctx.onEstadoCuenta,
      deshabilitada: !!ctx.motivoEstadoCuenta,
      motivo: ctx.motivoEstadoCuenta ?? undefined,
    },
    {
      id: 'exportar-ficha',
      etiqueta: t('menu.exportarFicha'),
      icono: Download,
      onSelect: () => undefined,
      deshabilitada: true,
      motivo: t('motivos.exportarFicha'),
    },
    ctx.inactivo
      ? { id: 'reactivar', etiqueta: t('menu.reactivar'), icono: RotateCcw, separadorAntes: true, onSelect: () => ctx.onCambiarEstado('active') }
      : { id: 'inactivar', etiqueta: t('menu.marcarInactivo'), icono: Power, separadorAntes: true, onSelect: () => ctx.onCambiarEstado('inactive') },
    // La fusión de duplicados vive en CRM › Identidades (comparar y unificar).
    { id: 'unificar', etiqueta: t('menu.unificar'), icono: Users, onSelect: () => ctx.navegar('/app/crm/identidades') },
    { id: 'eliminar', etiqueta: t('menu.eliminar'), icono: Trash2, destructiva: true, onSelect: ctx.onEliminar },
  ];
}
