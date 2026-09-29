'use client';

/**
 * «Elegir cliente» y «Elegir proveedor» del formulario de documento: la
 * pareja Venta/Compra del mismo diálogo (Figma `CustomerPicker` /
 * `SupplierPicker` Layout=dialog). Compartidos por la factura de venta, la
 * factura de compra y la orden de compra.
 *
 * - Chips: Persona · Empresa · Solo activos · Con saldo por cobrar|pagar.
 * - Filas: iniciales, nombre, insignia Persona/Empresa, NIT · DV, contacto y
 *   «Por cobrar|pagar $…» / «Al día».
 * - «+ Crear cliente|proveedor»: formulario rápido que vuelve con él elegido
 *   (el alta de la app: `crearClienteRapido` / `crearProveedorRapido`);
 *   «Más datos» abre el formulario completo de siempre.
 *
 * Los datos salen de las RPC de los listados con la sesión (RLS).
 */
import { useCallback, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { CustomerPicker, SupplierPicker, type ClientePicker, type ProveedorPicker } from '@/components/kit';
import { FormularioRapidoTercero } from '@/components/kit/documento/FormularioRapidoTercero';
import type { DatosTerceroRapido } from '@/components/kit/documento/edicionDocumentoLogica';
import { ClienteFormDialog, ProveedorFormDialog } from '@/components/shared/form-dialogs';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import type { FilaCliente } from '@/lib/services/clientesListadoService';
import type { ProveedorListadoItem, Supplier } from '@/lib/services/supplierService';
import {
  ClienteDuplicadoError,
  buscarClientesDocumento,
  buscarProveedoresDocumento,
  crearClienteRapido,
  crearProveedorRapido,
} from '@/lib/services/documentos/edicionDocumento';
import { crearFormateadorMoneda } from '@/lib/utils/moneda';

const DOC_CORTO: Record<string, string> = { cc: 'CC', nit: 'NIT', ce: 'CE', passport: 'PP', ti: 'TI', pep: 'PEP' };

/** «NIT 900.123.456-7», «CC 1.020.304.050». */
export function documentoTexto(tipo: string | null | undefined, numero: string | null | undefined, dv?: string | number | null): string | null {
  const n = (numero ?? '').trim();
  if (!n) return null;
  const miles = /^\d+$/.test(n) ? Number(n).toLocaleString('es-CO') : n;
  const t = DOC_CORTO[(tipo ?? '').toLowerCase()] ?? (tipo ? tipo.toUpperCase() : '');
  const d = dv !== null && dv !== undefined && String(dv).trim() !== '' ? `-${dv}` : '';
  return `${t ? `${t} ` : ''}${miles}${d}`;
}

export interface ClienteDocumento extends ClientePicker {
  plazoDias?: number | null;
}

export interface ProveedorDocumento extends ProveedorPicker {
  creditDays?: number | null;
}

// ─── Cliente ─────────────────────────────────────────────────────────────

export interface ElegirClienteProps {
  cliente: ClienteDocumento | null;
  onCambiar: (cliente: ClienteDocumento) => void;
  onQuitar?: () => void;
  sucursal: number | null;
  abierto?: boolean;
  onAbiertoChange?: (abierto: boolean) => void;
  onVer?: () => void;
  deshabilitado?: boolean;
  layout?: 'fila' | 'campo';
  id?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
}

export function ElegirCliente({ cliente, onCambiar, sucursal, layout = 'fila', ...resto }: ElegirClienteProps) {
  const t = useTranslations('kit.documentoEdicion.terceros');
  const tt = useTranslations('kit.documentoEdicion.tercero');
  const { code } = useMonedaOrganizacion();
  const formatear = useMemo(() => crearFormateadorMoneda(code), [code]);
  const [completo, setCompleto] = useState(false);

  const aPicker = useCallback(
    (f: FilaCliente): ClienteDocumento => ({
      id: f.id,
      nombre: (f.full_name || f.company_name || '').trim() || t('sinNombre'),
      documento: documentoTexto(f.identification_type, f.identification_number, f.customer_type === 'company' ? f.dv : null),
      correo: f.email,
      telefono: f.phone,
      contacto: f.contacto_nombre ? (f.contacto_cargo ? `${f.contacto_nombre} (${f.contacto_cargo})` : f.contacto_nombre) : null,
      tipo: f.customer_type === 'company' ? t('empresa') : t('persona'),
      saldoPorCobrar: Number(f.saldo) > 0 ? t('porCobrar', { saldo: formatear(Number(f.saldo)) }) : null,
      alDia: t('alDia'),
      plazoDias: f.plazo_dias,
    }),
    [t, formatear],
  );

  const buscar = useCallback(
    async (texto: string, _senal: AbortSignal, filtros: readonly string[], desde: number) => {
      const { filas, total } = await buscarClientesDocumento(getOrganizationId(), texto, filtros, desde);
      return { items: filas.map(aPicker), total };
    },
    [aPicker],
  );

  const mensajeError = (e: unknown) =>
    e instanceof ClienteDuplicadoError ? tt('errores.duplicadoCliente', { nombre: e.existente.nombre }) : tt('errorCrear');

  return (
    <>
      <CustomerPicker
        {...resto}
        layout={layout}
        cliente={cliente}
        buscar={buscar}
        onCambiar={(c) => onCambiar(c as ClienteDocumento)}
        atajo="F2"
        filtros={[
          { id: 'persona', etiqueta: t('persona') },
          { id: 'empresa', etiqueta: t('empresa') },
          { id: 'activos', etiqueta: t('soloActivos'), activoPorDefecto: true },
          { id: 'conSaldo', etiqueta: t('conSaldoCobrar') },
        ]}
        textoCrearNuevo={t('crearCliente')}
        textos={{ titulo: t('elegirCliente'), placeholder: t('elegirClienteAtajo') }}
        formularioCrear={({ texto, onCreado, onCancelar }) => (
          <FormularioRapidoTercero<ClienteDocumento>
            variante="cliente"
            texto={texto}
            onCrear={async (d: DatosTerceroRapido) => aPicker(await crearClienteRapido(getOrganizationId(), sucursal, d))}
            onCreado={onCreado}
            onCancelar={onCancelar}
            onMasDatos={() => setCompleto(true)}
            mensajeError={mensajeError}
          />
        )}
      />
      {completo && (
        <ClienteFormDialog
          open={completo}
          onOpenChange={setCompleto}
          organizationId={getOrganizationId()}
          branchId={sucursal ?? undefined}
          onCreated={(c: { id: string; full_name?: string | null; first_name?: string | null; last_name?: string | null; company_name?: string | null; email?: string | null; phone?: string | null }) => {
            setCompleto(false);
            onCambiar({
              id: c.id,
              nombre: (c.full_name || c.company_name || `${c.first_name ?? ''} ${c.last_name ?? ''}`).trim(),
              correo: c.email ?? null,
              telefono: c.phone ?? null,
            });
          }}
        />
      )}
    </>
  );
}

// ─── Proveedor ───────────────────────────────────────────────────────────

export interface ElegirProveedorProps {
  proveedor: ProveedorDocumento | null;
  onCambiar: (proveedor: ProveedorDocumento) => void;
  onQuitar?: () => void;
  abierto?: boolean;
  onAbiertoChange?: (abierto: boolean) => void;
  deshabilitado?: boolean;
  layout?: 'fila' | 'campo';
  id?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
}

export function ElegirProveedor({ proveedor, onCambiar, layout = 'fila', ...resto }: ElegirProveedorProps) {
  const t = useTranslations('kit.documentoEdicion.terceros');
  const { code } = useMonedaOrganizacion();
  const formatear = useMemo(() => crearFormateadorMoneda(code), [code]);
  const [completo, setCompleto] = useState(false);

  const aPicker = useCallback(
    (p: ProveedorListadoItem): ProveedorDocumento => ({
      id: String(p.id),
      nombre: p.name,
      nit: documentoTexto(p.doc_type || 'nit', p.nit, p.dv),
      contacto: p.contact,
      telefono: p.phone,
      tipo: p.supplier_type === 'person' ? t('persona') : t('empresa'),
      saldoPorPagar: Number(p.saldo) > 0 ? t('porPagar', { saldo: formatear(Number(p.saldo)) }) : null,
      alDia: t('alDia'),
      creditDays: p.credit_days,
    }),
    [t, formatear],
  );

  const buscar = useCallback(
    async (texto: string, _senal: AbortSignal, filtros: readonly string[]) => (await buscarProveedoresDocumento(getOrganizationId(), texto, filtros)).map(aPicker),
    [aPicker],
  );

  const deSupplier = (s: Supplier): ProveedorDocumento => ({
    id: String(s.id),
    nombre: s.name,
    nit: documentoTexto(s.doc_type || 'nit', s.nit, s.dv),
    contacto: s.contact ?? null,
    telefono: s.phone ?? null,
    creditDays: s.credit_days ?? null,
  });

  return (
    <>
      <SupplierPicker
        {...resto}
        layout={layout}
        proveedor={proveedor}
        buscar={buscar}
        onCambiar={(p) => onCambiar(p as ProveedorDocumento)}
        atajo="F2"
        filtros={[
          { id: 'empresa', etiqueta: t('empresa') },
          { id: 'persona', etiqueta: t('persona') },
          { id: 'activos', etiqueta: t('soloActivos'), activoPorDefecto: true },
          { id: 'conSaldo', etiqueta: t('conSaldoPagar') },
        ]}
        textoCrearNuevo={t('crearProveedor')}
        textos={{ titulo: t('elegirProveedor'), placeholder: t('elegirProveedorAtajo') }}
        formularioCrear={({ texto, onCreado, onCancelar }) => (
          <FormularioRapidoTercero<ProveedorDocumento>
            variante="proveedor"
            texto={texto}
            onCrear={async (d) => deSupplier(await crearProveedorRapido(getOrganizationId(), d))}
            onCreado={onCreado}
            onCancelar={onCancelar}
            onMasDatos={() => setCompleto(true)}
          />
        )}
      />
      {completo && (
        <ProveedorFormDialog
          open={completo}
          onOpenChange={setCompleto}
          onCreated={(s: Supplier) => {
            setCompleto(false);
            onCambiar(deSupplier(s));
          }}
        />
      )}
    </>
  );
}
