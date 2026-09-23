'use client';

/**
 * Ficha del cliente (Figma 06 Clientes, DET-*): cabecera del kit
 * (PageHeader `detail` con migas reales, badge de estado, «Editar»,
 * «Registrar pago» y el menú «⋯» con las mismas acciones que el listado) y
 * las pestañas de siempre. Estados de carga y error con el kit.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { HandCoins, Pencil, User, Building2 } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase/config';
import { EmptyState, PageHeader, RowActionsMenu, StatusBadge } from '@/components/kit';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { formatDateInTz } from '@/lib/utils/dateDisplay';
import { documentoCliente } from '@/lib/services/clientesListadoService';
import {
  construirAccionesCliente,
  MOTIVO_REGISTRAR_PAGO,
} from '@/components/clientes/listado/accionesCliente';
import { useOperacionesClientes } from '@/components/clientes/listado/useOperacionesClientes';
import { EliminarClientesDialog } from '@/components/clientes/listado/EliminarClientesDialog';

import ClienteHeader from '@/components/clientes/id/ClienteHeader';
import ResumenTab from '@/components/clientes/id/ResumenTab';
import TimelineTab from '@/components/clientes/id/TimelineTab';
import CuentasTab from '@/components/clientes/id/CuentasTab';
import NotasArchivosTab from '@/components/clientes/id/NotasArchivosTab';
import TareasSidebar from '@/components/clientes/id/TareasSidebar';
import InfoTab from '@/components/clientes/id/InfoTab';
import OportunidadesTab from '@/components/clientes/id/OportunidadesTab';
import { CompanyContactsManager } from '@/components/clientes/CompanyContactsManager';

interface Cliente {
  id: string;
  organization_id: number;
  first_name: string;
  last_name: string;
  full_name: string;
  email: string;
  phone: string | null;
  address: string;
  city: string;
  notes: string;
  tags: string[];
  preferences: unknown;
  created_at: string;
  updated_at: string;
  avatar_url?: string | null;
  customer_type?: string | null;
  identification_type?: string | null;
  identification_number?: string | null;
  dv?: number | null;
  lifecycle_stage?: string | null;
  status?: string | null;
}

const PESTANA =
  'min-w-0 whitespace-nowrap rounded-md px-3 py-1.5 text-sm text-fg-secondary data-[state=active]:bg-surface data-[state=active]:text-fg data-[state=active]:shadow-sm';

export default function PerfilCliente() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  const { timezone } = useFormatDate();
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);
  const [eliminarAbierto, setEliminarAbierto] = useState(false);

  const recargar = useCallback(() => setRecarga((n) => n + 1), []);
  const idsCliente = useMemo(() => (id ? [id] : []), [id]);
  const { cambiarEstado, copiarId } = useOperacionesClientes(cliente?.organization_id ?? null, recargar);

  useEffect(() => {
    let cancelado = false;
    const cargar = async () => {
      if (!id) {
        setError('ID de cliente no encontrado');
        setLoading(false);
        return;
      }
      setError(null);
      const { data, error: err } = await supabase.from('customers').select('*').eq('id', id).maybeSingle();
      if (cancelado) return;
      if (err) setError(err.message || 'Error al cargar datos del cliente');
      else if (!data) setError('No existe o no pertenece a tu organización.');
      else setCliente(data as Cliente);
      setLoading(false);
    };
    void cargar();
    return () => {
      cancelado = true;
    };
  }, [id, recarga]);

  if (loading) {
    return (
      <div className="flex min-h-full flex-col gap-4 bg-canvas p-4 lg:gap-6 lg:p-6" aria-busy="true">
        <Skeleton className="h-4 w-48" />
        <div className="flex items-center gap-3">
          <Skeleton className="size-12 rounded-lg" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-6 w-64" />
            <Skeleton className="h-4 w-80" />
          </div>
        </div>
        <Skeleton className="h-36 w-full rounded-xl" />
        <Skeleton className="h-10 w-full rounded-lg" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !cliente) {
    return (
      <div className="flex min-h-full flex-col gap-4 bg-canvas p-4 lg:p-6">
        <PageHeader
          titulo="Cliente no encontrado"
          variante="detail"
          icono={User}
          migas={[{ etiqueta: 'Inicio', href: '/app/inicio' }, { etiqueta: 'Clientes', href: '/app/clientes' }]}
          movil={{ titulo: 'Cliente' }}
          volverA="/app/clientes"
        />
        <div className="rounded-xl border border-line bg-surface">
          <EmptyState
            variante="error"
            titulo="Cliente no encontrado"
            descripcion={error || 'No se pudo encontrar el cliente solicitado. Si tienes una sucursal seleccionada, prueba con «Todas».'}
            accion={{ etiqueta: 'Volver a clientes', href: '/app/clientes' }}
          />
        </div>
      </div>
    );
  }

  const nombre = cliente.full_name || `${cliente.first_name || ''} ${cliente.last_name || ''}`.trim() || 'Sin nombre';
  const esEmpresa = cliente.customer_type === 'company';
  const documento = documentoCliente({
    identification_type: cliente.identification_type ?? null,
    identification_number: cliente.identification_number ?? null,
    dv: cliente.dv ?? null,
  });
  const desde = formatDateInTz(cliente.created_at, timezone, { locale: 'es-CO', day: 'numeric', month: 'short', year: 'numeric' });
  const subtitulo = [desde && `Cliente desde ${desde}`, documento].filter(Boolean).join(' · ');

  const acciones = construirAccionesCliente(
    { id: cliente.id, nombre, phone: cliente.phone, status: cliente.status ?? 'active' },
    {
      navegar: (ruta) => router.push(ruta),
      onCambiarEstado: (c, estado) => void cambiarEstado([c.id], estado, c.nombre),
      onEliminar: () => setEliminarAbierto(true),
      onCopiarId: (c) => void copiarId(c.id),
      omitirVer: true,
    },
  );

  return (
    <div className="flex min-h-full flex-col gap-4 bg-canvas p-4 lg:gap-6 lg:p-6">
      <PageHeader
        titulo={nombre}
        subtitulo={subtitulo}
        variante="detail"
        icono={esEmpresa ? Building2 : User}
        badge={cliente.status === 'inactive' ? <StatusBadge estado="Inactivo" tamano="md" /> : undefined}
        migas={[
          { etiqueta: 'Inicio', href: '/app/inicio' },
          { etiqueta: 'Clientes', href: '/app/clientes' },
          { etiqueta: nombre },
        ]}
        volverA="/app/clientes"
        acciones={
          <>
            <Button asChild variant="outline" className="h-10">
              <Link href={`/app/clientes/${cliente.id}/editar`}>
                <Pencil aria-hidden="true" className="mr-2 size-4" />
                Editar
              </Link>
            </Button>
            <Button className="h-10" disabled title={MOTIVO_REGISTRAR_PAGO} aria-describedby="motivo-registrar-pago">
              <HandCoins aria-hidden="true" className="mr-2 size-4" />
              Registrar pago
            </Button>
            <span id="motivo-registrar-pago" className="sr-only">
              {MOTIVO_REGISTRAR_PAGO}
            </span>
            <RowActionsMenu acciones={acciones} orientacion="horizontal" tamano="md" titulo={nombre} />
          </>
        }
        movil={{
          titulo: nombre,
          subtitulo: documento ?? undefined,
          accion: <RowActionsMenu acciones={acciones} orientacion="horizontal" titulo={nombre} />,
        }}
      />

      <ClienteHeader cliente={cliente} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="col-span-1 min-w-0 lg:col-span-2">
          <Tabs defaultValue="resumen" className="w-full">
            <TabsList className="mb-6 flex h-auto w-full justify-start gap-1 overflow-x-auto rounded-lg border border-line bg-subtle p-1">
              <TabsTrigger value="resumen" className={PESTANA}>Resumen</TabsTrigger>
              <TabsTrigger value="info" className={PESTANA}>Información</TabsTrigger>
              <TabsTrigger value="oportunidades" className={PESTANA}>Oportunidades</TabsTrigger>
              <TabsTrigger value="timeline" className={PESTANA}>Actividad</TabsTrigger>
              <TabsTrigger value="cuentas" className={PESTANA}>Cuentas por cobrar</TabsTrigger>
              <TabsTrigger value="notas" className={PESTANA}>Notas y archivos</TabsTrigger>
              {esEmpresa && (
                <TabsTrigger value="contactos" className={PESTANA}>Contactos</TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="resumen">
              <ResumenTab clienteId={cliente.id} organizationId={cliente.organization_id} />
            </TabsContent>
            <TabsContent value="info">
              <InfoTab clienteId={cliente.id} organizationId={cliente.organization_id} />
            </TabsContent>
            <TabsContent value="oportunidades">
              <OportunidadesTab clienteId={cliente.id} organizationId={cliente.organization_id} />
            </TabsContent>
            <TabsContent value="timeline">
              <TimelineTab clienteId={cliente.id} organizationId={cliente.organization_id} />
            </TabsContent>
            <TabsContent value="cuentas">
              <CuentasTab clienteId={cliente.id} organizationId={cliente.organization_id} />
            </TabsContent>
            <TabsContent value="notas">
              <NotasArchivosTab clienteId={cliente.id} organizationId={cliente.organization_id} />
            </TabsContent>
            {esEmpresa && (
              <TabsContent value="contactos">
                <CompanyContactsManager companyId={cliente.id} organizationId={cliente.organization_id} />
              </TabsContent>
            )}
          </Tabs>
        </div>

        <div className="col-span-1">
          <TareasSidebar clienteId={cliente.id} organizationId={cliente.organization_id} />
        </div>
      </div>

      <EliminarClientesDialog
        abierto={eliminarAbierto}
        onAbiertoChange={setEliminarAbierto}
        organizationId={cliente.organization_id}
        ids={idsCliente}
        nombre={nombre}
        onHecho={({ eliminados }) => {
          if (eliminados > 0) router.push('/app/clientes');
          else recargar();
        }}
      />
    </div>
  );
}

