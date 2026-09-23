'use client';

import { Building2, IdCard, Mail, Phone, SquareUser, User } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  AvatarIniciales,
  ListCard,
  StatusBadge,
  type AccionFila,
  type ColumnaTabla,
  type ContextoTarjeta,
} from '@/components/kit';
import { cn } from '@/utils/Utils';
import { formatMonedaSinDecimales } from '@/lib/hooks/useOrgCurrency';
import {
  documentoCliente,
  estadoCarteraDetalle,
  nombreCliente,
  type FilaCliente,
  type OpcionFiltro,
} from '@/lib/services/clientesListadoService';

/**
 * Columnas del listado de clientes en escritorio (Figma CAT-LISTO) y la
 * tarjeta móvil.
 */
export interface ContextoColumnas {
  moneda: string;
  /** Fecha de un timestamptz en la zona de la organización. */
  formatearFecha: (valor: string) => string;
  roles: readonly OpcionFiltro[];
}

const COLOR_SALDO: Record<string, string> = {
  vencido: 'text-danger-text',
  parcial: 'text-warning-text',
  pendiente: 'text-warning-text',
};

function etiquetaRol(rol: string, roles: readonly OpcionFiltro[]): string {
  return roles.find((r) => r.valor === rol)?.etiqueta ?? rol.charAt(0).toUpperCase() + rol.slice(1);
}

export function columnasClientes(ctx: ContextoColumnas): ColumnaTabla<FilaCliente>[] {
  return [
    {
      id: 'nombre',
      encabezado: 'Cliente',
      ordenable: true,
      ancho: 260,
      celda: (c) => {
        const nombre = nombreCliente(c);
        const rol = c.roles?.[0];
        return (
          <div className="flex min-w-0 items-center gap-3">
            <AvatarIniciales nombre={nombre} src={c.avatar_url} />
            <div className="flex min-w-0 flex-col gap-1">
              <span className="truncate font-medium text-fg">{nombre}</span>
              <div className="flex flex-wrap items-center gap-1">
                <StatusBadge estado={c.customer_type === 'company' ? 'Empresa' : 'Persona'} />
                {rol && (
                  <Badge tono="marca" apariencia="contorno" tamano="sm">
                    {etiquetaRol(rol, ctx.roles)}
                  </Badge>
                )}
                {c.status === 'inactive' && <StatusBadge estado="Inactivo" />}
              </div>
              {c.customer_type === 'company' && c.contacto_nombre && (
                <span className="truncate text-xs text-fg-muted">
                  Contacto: {c.contacto_nombre}
                  {c.contacto_cargo ? ` (${c.contacto_cargo})` : ''}
                </span>
              )}
            </div>
          </div>
        );
      },
    },
    {
      id: 'contacto',
      encabezado: 'Contacto',
      celda: (c) => (
        <div className="flex min-w-0 flex-col text-[13px] text-fg-secondary">
          <span className="truncate">{c.email || '—'}</span>
          {c.phone && <span className="truncate tabular-nums">{c.phone}</span>}
        </div>
      ),
    },
    {
      id: 'documento',
      encabezado: 'Documento',
      ocultarDebajo: 'xl',
      celda: (c) => {
        const doc = documentoCliente({ ...c, dv: null });
        if (!doc) return <span className="text-[13px] text-fg-muted">No registrado</span>;
        return (
          <div className="flex flex-col text-[13px]">
            <span className="whitespace-nowrap tabular-nums text-fg">{doc}</span>
            {c.dv !== null && c.dv !== undefined && <span className="text-xs text-fg-muted">DV {c.dv}</span>}
          </div>
        );
      },
    },
    {
      id: 'municipio',
      encabezado: 'Municipio',
      ocultarDebajo: 'xl',
      celda: (c) => <span className="text-[13px] text-fg-secondary">{c.municipio_nombre || '—'}</span>,
    },
    {
      id: 'etiquetas',
      encabezado: 'Etiquetas',
      ocultarDebajo: 'xl',
      celda: (c) => {
        const tags = c.tags ?? [];
        if (tags.length === 0) return <span className="text-[13px] text-fg-muted">—</span>;
        return (
          <div className="flex flex-wrap items-center gap-1">
            {tags.slice(0, 2).map((t) => (
              <Badge key={t} tono="neutro" apariencia="contorno" tamano="sm">
                {t}
              </Badge>
            ))}
            {tags.length > 2 && (
              <Badge tono="neutro" apariencia="contorno" tamano="sm" title={tags.slice(2).join(', ')}>
                +{tags.length - 2}
              </Badge>
            )}
          </div>
        );
      },
    },
    {
      id: 'saldo',
      encabezado: 'Cuentas por cobrar',
      variante: 'importe',
      ordenable: true,
      celda: (c) => {
        const detalle = estadoCarteraDetalle(c);
        return (
          <div className="flex flex-col items-end gap-1">
            <span className={cn('font-semibold', COLOR_SALDO[c.estado_cartera] ?? (c.saldo > 0 ? 'text-fg' : 'text-success-text'))}>
              {formatMonedaSinDecimales(c.saldo, ctx.moneda)}
            </span>
            {detalle && <StatusBadge estado={detalle} />}
          </div>
        );
      },
    },
    {
      id: 'ventas',
      encabezado: 'Ventas',
      variante: 'importe',
      ordenable: true,
      celda: (c) => (
        <div className="flex flex-col items-end">
          <span className="font-medium text-fg">{formatMonedaSinDecimales(c.total_compras, ctx.moneda)}</span>
          <span className="text-xs text-fg-muted">
            {c.compras} {c.compras === 1 ? 'compra' : 'compras'}
          </span>
        </div>
      ),
    },
    {
      id: 'ultima_compra',
      encabezado: 'Última compra',
      ordenable: true,
      celda: (c) =>
        c.ultima_compra ? (
          <span className="whitespace-nowrap text-[13px] text-fg-secondary">{ctx.formatearFecha(c.ultima_compra)}</span>
        ) : (
          <span className="whitespace-nowrap text-[13px] text-fg-muted">Sin compras</span>
        ),
    },
  ];
}

/**
 * Tarjeta móvil (corrección del dueño, 2026-09-24; Figma `ListCard`
 * Inicio=avatar, captura `53-movil-tarjetas-clientes-listo.png`): la tarjeta
 * blanca de Proveedores con el AVATAR de iniciales, el nombre y su insignia
 * Persona/Empresa, y como «datos» de una línea con icono: documento, contacto
 * (solo empresa), correo y teléfono. Todo con elipsis: nada se sale de la
 * pantalla; lo que no cabe (saldo, compras) queda en la ficha.
 */
export function TarjetaCliente({
  cliente: c,
  ctx,
  acciones,
  onAbrir,
}: {
  cliente: FilaCliente;
  ctx: ContextoTarjeta;
  acciones: readonly AccionFila[];
  onAbrir: () => void;
}) {
  const nombre = nombreCliente(c);
  const doc = documentoCliente(c);
  const empresa = c.customer_type === 'company';
  const contacto =
    empresa && c.contacto_nombre
      ? `Contacto: ${c.contacto_nombre}${c.contacto_cargo ? ` (${c.contacto_cargo})` : ''}`
      : null;

  return (
    <ListCard
      avatar={{ nombre, src: c.avatar_url }}
      titulo={nombre}
      insignia={<StatusBadge estado={empresa ? 'Empresa' : 'Persona'} icono={empresa ? Building2 : User} />}
      datos={[
        doc ? { icono: IdCard, texto: doc, etiqueta: 'Documento' } : null,
        contacto ? { icono: SquareUser, texto: contacto, etiqueta: 'Contacto' } : null,
        c.email ? { icono: Mail, texto: c.email, etiqueta: 'Correo' } : null,
        c.phone ? { icono: Phone, texto: c.phone, etiqueta: 'Teléfono' } : null,
      ]}
      estado={c.status === 'inactive' ? <StatusBadge estado="Inactivo" /> : undefined}
      acciones={acciones}
      onClick={onAbrir}
      seleccionable={ctx.modoSeleccion}
      seleccionado={ctx.seleccionado}
      onSeleccionChange={ctx.alternar}
      onMantenerPulsado={() => ctx.alternar(true)}
    />
  );
}
