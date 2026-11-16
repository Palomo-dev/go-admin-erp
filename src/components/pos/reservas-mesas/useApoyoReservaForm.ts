'use client';

/**
 * Lo que `ReservaFormDialog` necesita de una sede: ajustes efectivos
 * (recordatorio, turnos, grupo grande), sus mesas, mesas libres a una hora y la
 * búsqueda / alta rápida de clientes. Lo comparten POS › Reservas de mesas y
 * «Crear reserva de grupo» del detalle rápido de un lead (CRM), para que el
 * formulario se comporte igual en los dos sitios (CLAUDE.md, regla 7).
 *
 * Todo pasa por los servicios de siempre: `reservasMesasService`,
 * `buscarClientes`, `crearClienteRapido` y `GET /api/pos/reservas-mesas/configuracion`.
 */
import { useCallback, useEffect, useState } from 'react';
import type { ClientePicker } from '@/components/kit/CustomerPicker';
import { supabase } from '@/lib/supabase/config';
import { buscarClientes } from '@/lib/services/customers/busquedaClientesService';
import { crearClienteRapido } from '@/lib/services/documentos/edicionDocumento';
import type { AjustesReservaDto } from '@/lib/services/restaurantBookingSettingsService';
import { reservasMesasService } from './reservasMesasService';
import type { MesaOpcion } from './ReservaFormDialog';

export interface ApoyoReservaForm {
  ajustesSede: AjustesReservaDto | null;
  mesasSede: MesaOpcion[];
  buscarClientes: (texto: string) => Promise<ClientePicker[]>;
  buscarPorTelefono: (telefono: string) => Promise<{ cliente: ClientePicker; visitas: number | null } | null>;
  crearCliente: (d: { nombres: string; apellidos: string; telefono: string; correo: string }) => Promise<ClientePicker>;
  mesasLibres: (fecha: string, hora: string, personas: number, duracion: number, excluir?: string) => Promise<MesaOpcion[]>;
}

/**
 * @param organizationId organización de la sesión (null mientras carga).
 * @param branchId sede de la reserva (null: sin sede, no hay mesas).
 * @param activo false para no pedir nada (diálogo cerrado).
 * @param recarga cualquier valor que, al cambiar, vuelve a pedir ajustes y mesas.
 */
export function useApoyoReservaForm(organizationId: number | null | undefined, branchId: number | null, activo = true, recarga?: unknown): ApoyoReservaForm {
  const [ajustesSede, setAjustesSede] = useState<AjustesReservaDto | null>(null);
  const [mesasSede, setMesasSede] = useState<MesaOpcion[]>([]);

  useEffect(() => {
    if (!organizationId || !activo) return;
    let vivo = true;
    const qs = branchId != null ? `?branchId=${branchId}` : '';
    fetch(`/api/pos/reservas-mesas/configuracion${qs}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { sede?: { efectiva?: AjustesReservaDto } } | null) => vivo && setAjustesSede(d?.sede?.efectiva ?? null))
      .catch(() => vivo && setAjustesSede(null));
    if (branchId != null) {
      supabase
        .from('restaurant_tables')
        .select('id, name, zone, capacity')
        .eq('organization_id', organizationId)
        .eq('branch_id', branchId)
        .order('name')
        .then(({ data }) => vivo && setMesasSede((data ?? []) as MesaOpcion[]));
    } else {
      setMesasSede([]);
    }
    return () => {
      vivo = false;
    };
  }, [organizationId, branchId, activo, recarga]);

  const buscar = useCallback(
    async (texto: string): Promise<ClientePicker[]> => {
      if (!organizationId || texto.trim().length < 2) return [];
      const { filas } = await buscarClientes(supabase, { organizationId, texto, limite: 20 });
      return filas.map((c) => ({
        id: c.id,
        nombre: c.full_name || [c.first_name, c.last_name].filter(Boolean).join(' ') || c.email || c.id,
        documento: c.identification_number ?? null,
        correo: c.email ?? null,
        telefono: c.phone ?? null,
      }));
    },
    [organizationId],
  );
  const buscarPorTelefono = useCallback(
    async (telefono: string) => {
      const encontrados = await buscar(telefono.replace(/\D/g, '').slice(-10));
      const c = encontrados[0];
      if (!c) return null;
      const visitas = await reservasMesasService.contarVisitas(c.id).catch(() => null);
      return { cliente: c, visitas };
    },
    [buscar],
  );
  const crearCliente = useCallback(
    async (d: { nombres: string; apellidos: string; telefono: string; correo: string }): Promise<ClientePicker> => {
      if (!organizationId) throw new Error('organizacion');
      const fila = await crearClienteRapido(organizationId, branchId, {
        tipo: 'persona',
        tipoDocumento: '',
        numeroDocumento: '',
        dv: '',
        nombres: d.nombres,
        apellidos: d.apellidos,
        razonSocial: '',
        contacto: '',
        correo: d.correo,
        telefono: d.telefono,
        diasCredito: null,
      });
      return { id: fila.id, nombre: fila.full_name ?? `${d.nombres} ${d.apellidos}`, correo: fila.email ?? d.correo, telefono: fila.phone ?? d.telefono };
    },
    [organizationId, branchId],
  );
  const mesasLibres = useCallback(
    async (f: string, h: string, n: number, dur: number, excluir?: string) => {
      if (branchId == null) return [];
      return reservasMesasService.getAvailableTables(f, h, n, branchId, excluir, dur);
    },
    [branchId],
  );

  return { ajustesSede, mesasSede, buscarClientes: buscar, buscarPorTelefono, crearCliente, mesasLibres };
}
