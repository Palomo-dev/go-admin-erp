'use client';

import { useCallback, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { BedDouble, UserPlus } from 'lucide-react';
import { CustomerPicker, lineaSecundaria, type ClientePicker } from '@/components/kit';
import type { PaginaEntidad } from '@/components/kit/selectorEntidadLogica';
import { POSService } from '@/lib/services/posService';
import { useOrganization, getCurrentBranchIdWithFallback } from '@/lib/hooks/useOrganization';
import { ClienteFormDialog } from '@/components/shared/form-dialogs';
import { OfflineCustomerDialog } from './OfflineCustomerDialog';
import { Customer } from './types';
import { supabase } from '@/lib/supabase/config';
import { clienteDesdeHabitacion } from '@/lib/pos/venta/cliente';
import { normalizarBusqueda, palabrasBusqueda } from '@/lib/clientes/busqueda';

/**
 * Selector de cliente con la API de siempre (lo usan el POS, mesas, PMS y
 * nueva venta), dibujado con `CustomerPicker` del kit (paso 8 de POS-PLAN;
 * patrón `inventario/BranchBadge` → `kit/BranchBadgeActiva`).
 *
 * La búsqueda es la única de clientes (`POSService.buscarClientesPagina`: RPC
 * `fn_clientes_buscar`, o el catálogo local sin red): sin tildes, todas las
 * palabras, teléfono y documento por dígitos, por relevancia y con el total
 * para «Mostrando 20 de N · Ver más» (empresas con su contacto principal).
 * Además, huéspedes con la reserva en `checked_in` («Espacios ocupados»). Crear abre el formulario completo (`ClienteFormDialog`) o, sin
 * red en Desktop, el registro rápido local (`OfflineCustomerDialog`).
 */
export interface OccupiedSpace {
  space_id: string;
  space_label: string;
  reservation_id: string;
  customer_id: string;
  customer_name: string;
  customer_email?: string;
  customer_phone?: string;
  checkin: string;
  checkout: string;
  folio_id?: string;
}

export interface CustomerWithRoom {
  customer: Customer;
  room?: OccupiedSpace;
}

interface CustomerSelectorProps {
  selectedCustomer?: Customer;
  selectedRoom?: OccupiedSpace;
  onCustomerSelect: (customer?: Customer, room?: OccupiedSpace) => void;
  className?: string;
  /** Lista abierta (controlada). El POS la abre con F2. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Atajo que se muestra en «Cambiar» (el POS pasa «F2» y lo registra). */
  atajo?: string;
  /**
   * Muestra «Ver» y «Editar» del cliente elegido (Figma `906:115573`,
   * `906:115574`) y abre su ficha en una pestaña nueva, para no interrumpir la
   * venta en curso. Solo lo activa el POS de venta; PMS y mesas no cambian.
   */
  accionesFichaEnPestanaNueva?: boolean;
}

type ClienteBusqueda = Customer & {
  customer_type?: string;
  primary_contact_name?: string | null;
  primary_contact_position?: string | null;
};

/**
 * Clientes (una página de la búsqueda única) y espacios ocupados que
 * coinciden con `term`. Los espacios solo en la primera página.
 */
async function buscarClientesYEspacios(
  term: string,
  organizationId: number,
  desde: number,
): Promise<{ customers: ClienteBusqueda[]; total: number; spaces: OccupiedSpace[] }> {
  // Fase 4D: sin red en Desktop solo hay catálogo local (sin reservas ni
  // contactos de empresa, que necesitan Supabase).
  if (POSService.usesLocalCatalog()) {
    const { filas, total } = await POSService.buscarClientesPagina(term.trim() || undefined, { desde });
    return { customers: filas, total, spaces: [] };
  }
  const pagina = POSService.buscarClientesPagina(term.trim() || undefined, { desde });
  if (desde > 0) {
    const { filas, total } = await pagina;
    return { customers: await conContactoPrincipal(filas as ClienteBusqueda[]), total, spaces: [] };
  }

  const spaces: OccupiedSpace[] = [];
  const palabras = palabrasBusqueda(term);
  const { data: reservations, error: roomsError } = await supabase
    .from('reservations')
    .select(`
      id,
      customer_id,
      checkin,
      checkout,
      customers!inner (
        id,
        full_name,
        email,
        phone
      ),
      reservation_spaces!inner (
        space_id,
        spaces!inner (
          id,
          label
        )
      ),
      folios (
        id
      )
    `)
    .eq('organization_id', organizationId)
    .in('status', ['checked_in'])
    .order('checkin', { ascending: false })
    .limit(20);

  if (!roomsError && reservations) {
    type FilaReserva = {
      id: string;
      checkin: string;
      checkout: string;
      customers: { id: string; full_name: string | null; email?: string; phone?: string };
      reservation_spaces: { spaces: { id: string; label: string } } | { spaces: { id: string; label: string } }[];
      folios?: { id: string }[] | null;
    };
    (reservations as unknown as FilaReserva[]).forEach((reservation) => {
      const customer = reservation.customers;
      const reservationSpaces = Array.isArray(reservation.reservation_spaces) ? reservation.reservation_spaces : [reservation.reservation_spaces];
      reservationSpaces.forEach((rs) => {
        const space = rs.spaces;
        const customerName = customer.full_name || '';
        // Mismas reglas que la búsqueda única: sin tildes, todas las palabras.
        if (palabras.length > 0 && !palabras.every((w) => normalizarBusqueda(`${space.label} ${customerName}`).includes(w))) {
          return;
        }
        spaces.push({
          space_id: space.id,
          space_label: space.label,
          reservation_id: reservation.id,
          customer_id: customer.id,
          customer_name: customerName,
          customer_email: customer.email,
          customer_phone: customer.phone,
          checkin: reservation.checkin,
          checkout: reservation.checkout,
          folio_id: reservation.folios?.[0]?.id,
        });
      });
    });
  }

  // Clientes (siempre, incluso sin término de búsqueda)
  const { filas, total } = await pagina;
  return { customers: await conContactoPrincipal(filas as ClienteBusqueda[]), total, spaces };
}

/** Contactos principales de las empresas de la página. */
async function conContactoPrincipal(results: ClienteBusqueda[]): Promise<ClienteBusqueda[]> {
  const companyResults = results.filter((c) => c.customer_type === 'company');
  if (companyResults.length > 0) {
    const companyIds = companyResults.map((c) => c.id);
    const { data: links } = await supabase
      .from('customer_company_links')
      .select(`
        company_id,
        is_primary,
        position,
        person:customers!customer_company_links_person_id_fkey(first_name, last_name)
      `)
      .in('company_id', companyIds)
      .order('is_primary', { ascending: false });

    if (links) {
      type Enlace = { company_id: string; position: string | null; person: { first_name?: string; last_name?: string } | null };
      const contactMap = new Map<string, { name: string; position: string | null }>();
      for (const link of links as unknown as Enlace[]) {
        if (!contactMap.has(link.company_id) && link.person) {
          contactMap.set(link.company_id, {
            name: `${link.person.first_name || ''} ${link.person.last_name || ''}`.trim(),
            position: link.position || null,
          });
        }
      }
      results.forEach((c) => {
        if (c.customer_type === 'company') {
          const contact = contactMap.get(c.id);
          if (contact) {
            c.primary_contact_name = contact.name;
            c.primary_contact_position = contact.position;
          }
        }
      });
    }
  }
  return results;
}

/** Abre una ruta de la app en una pestaña nueva, sin dar acceso a esta ventana. */
function abrirEnPestanaNueva(ruta: string) {
  window.open(ruta, '_blank', 'noopener');
}

export function CustomerSelector({
  selectedCustomer,
  onCustomerSelect,
  className,
  open,
  onOpenChange,
  atajo,
  accionesFichaEnPestanaNueva,
}: CustomerSelectorProps) {
  const t = useTranslations('posVenta.cliente');
  const { organization } = useOrganization();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  // Fase 4D (Desktop sin red): registro rápido local en vez del formulario completo.
  const [showOfflineCreate, setShowOfflineCreate] = useState(false);
  const [abiertoInterno, setAbiertoInterno] = useState(false);
  const abierto = open ?? abiertoInterno;
  const cambiarAbierto = (v: boolean) => {
    if (open === undefined) setAbiertoInterno(v);
    onOpenChange?.(v);
  };
  const [espacios, setEspacios] = useState<OccupiedSpace[]>([]);
  // Filas completas de la última búsqueda: el picker devuelve el id, la pantalla necesita el cliente.
  const porId = useRef(new Map<string, ClienteBusqueda>());

  const aPicker = (c: ClienteBusqueda): ClientePicker => ({
    id: c.id,
    nombre: c.full_name,
    documento: lineaSecundaria(
      c.doc_type && c.doc_number ? `${c.doc_type} ${c.doc_number}` : null,
      c.customer_type === 'company' && c.primary_contact_name
        ? t('contacto', { nombre: c.primary_contact_name + (c.primary_contact_position ? ` (${c.primary_contact_position})` : '') })
        : null,
    ) || null,
    correo: c.email ?? null,
    telefono: c.phone ?? null,
    pendienteSync: !!c.pending_sync,
  });

  const buscar = useCallback(
    async (texto: string, senal: AbortSignal, _filtros: readonly string[], desde: number): Promise<PaginaEntidad<ClientePicker>> => {
      if (!organization?.id) return { items: [], total: 0 };
      const { customers, total, spaces } = await buscarClientesYEspacios(texto, organization.id, desde);
      if (senal.aborted) return { items: [], total: 0 };
      if (desde === 0) {
        porId.current = new Map(customers.map((c) => [c.id, c]));
        setEspacios(spaces);
      } else {
        for (const c of customers) porId.current.set(c.id, c);
      }
      return { items: customers.map(aPicker), total };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [organization?.id, t],
  );

  const crear = () => {
    cambiarAbierto(false);
    if (POSService.usesLocalCatalog()) setShowOfflineCreate(true);
    else setShowCreateDialog(true);
  };

  // Cuando el diálogo compartido crea un cliente, seleccionarlo
  const handleCustomerCreated = (customer: Customer) => {
    onCustomerSelect(customer);
  };

  // Seleccionar espacio ocupado: cliente desde los datos de la habitación (L34).
  const handleSelectRoom = (room: OccupiedSpace) => {
    onCustomerSelect(clienteDesdeHabitacion(room), room);
    cambiarAbierto(false);
  };

  const grupoExtra = (
    <div className="flex flex-col gap-1 border-t border-line p-2">
      {espacios.length > 0 && (
        <div role="group" aria-label={t('espaciosOcupados', { n: espacios.length })} className="flex flex-col gap-0.5">
          <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-fg-muted">{t('espaciosOcupados', { n: espacios.length })}</p>
          {espacios.map((room) => (
            <button
              key={`${room.space_id}-${room.reservation_id}`}
              type="button"
              onClick={() => handleSelectRoom(room)}
              className="flex items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <BedDouble aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success-text" strokeWidth={1.5} />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium text-fg">{room.space_label}</span>
                <span className="truncate text-xs text-fg-secondary">{lineaSecundaria(room.customer_name, room.customer_email)}</span>
              </span>
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={crear}
        className="flex items-center gap-2 rounded-md px-2 py-2 text-left text-sm font-medium text-brand hover:bg-brand-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <UserPlus aria-hidden="true" className="size-4" strokeWidth={1.5} />
        {t('crear')}
      </button>
    </div>
  );

  // Un cliente creado sin conexión todavía no tiene ficha en el servidor.
  const idFicha = accionesFichaEnPestanaNueva && selectedCustomer && !selectedCustomer.pending_sync ? selectedCustomer.id : null;
  const rutaFicha = idFicha ? `/app/clientes/${encodeURIComponent(idFicha)}` : null;

  return (
    <div className={className}>
      <CustomerPicker
        cliente={selectedCustomer ? aPicker(selectedCustomer as ClienteBusqueda) : null}
        buscar={buscar}
        onCambiar={(c) => {
          const cliente = porId.current.get(c.id);
          if (cliente) onCustomerSelect(cliente);
          cambiarAbierto(false);
        }}
        onQuitar={() => onCustomerSelect(undefined, undefined)}
        onVer={rutaFicha ? () => abrirEnPestanaNueva(rutaFicha) : undefined}
        onEditar={rutaFicha ? () => abrirEnPestanaNueva(`${rutaFicha}/editar`) : undefined}
        onCrear={crear}
        abierto={abierto}
        onAbiertoChange={cambiarAbierto}
        atajo={atajo}
        grupoExtra={grupoExtra}
        debounceMs={300}
      />

      {/* Fase 4D: Desktop sin red → registro rápido local */}
      <OfflineCustomerDialog open={showOfflineCreate} onOpenChange={setShowOfflineCreate} onCreated={handleCustomerCreated} />

      {/* Diálogo compartido: reutiliza el formulario COMPLETO de cliente */}
      {organization?.id && (
        <ClienteFormDialog
          open={showCreateDialog}
          onOpenChange={setShowCreateDialog}
          organizationId={organization.id}
          branchId={getCurrentBranchIdWithFallback() ?? undefined}
          onCreated={handleCustomerCreated}
        />
      )}
    </div>
  );
}
