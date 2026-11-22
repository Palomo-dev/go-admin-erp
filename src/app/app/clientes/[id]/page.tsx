'use client';

/**
 * Ficha del cliente (Figma 06 Clientes, sección «Detalle de cliente» 319:2837,
 * aprobada; CRM 772:19838 / 772:20971 / 772:21523):
 *
 * - Cabecera del kit: nombre con su estado (Cliente · Lead · Inactivo),
 *   «Cliente desde <fecha> · <Sucursal> · <documento>», «Editar», «Registrar
 *   pago» y el menú «⋯» de 332:119080.
 * - «Registrar pago» abre el cobro único de cartera (`RegistrarPagoConectado`,
 *   destino «tercero»: todas las cuentas abiertas del cliente con reparto
 *   FIFO). Sin saldo, deshabilitado con su motivo. Permisos del servidor.
 * - Tarjeta de identidad, pestañas en el orden del Figma con la elegida en
 *   `?pestana=` (los valores viejos `info`, `timeline` y `cuentas` siguen
 *   abriendo su pestaña) y la columna derecha con tareas y salud.
 * - Carga (332:116573) y error (332:117692) con el kit.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Building2, HandCoins, Pencil, User } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase/config';
import { Breadcrumbs, EmptyState, PageHeader, RowActionsMenu, TabBar, idPanel, idPestana, useOpcionUrl, type PestanaTab } from '@/components/kit';
import { documentoCliente } from '@/lib/services/clientesListadoService';
import { useOperacionesClientes } from '@/components/clientes/listado/useOperacionesClientes';
import { EliminarClientesDialog } from '@/components/clientes/listado/EliminarClientesDialog';
import { todayInTz } from '@/lib/utils/dateDisplay';

import ClienteHeader from '@/components/clientes/id/ClienteHeader';
import ResumenTab from '@/components/clientes/id/ResumenTab';
import TimelineTab from '@/components/clientes/id/TimelineTab';
import CuentasTab from '@/components/clientes/id/CuentasTab';
import NotasArchivosTab from '@/components/clientes/id/NotasArchivosTab';
import TareasSidebar from '@/components/clientes/id/TareasSidebar';
import InfoTab from '@/components/clientes/id/InfoTab';
import OportunidadesTab from '@/components/clientes/id/OportunidadesTab';
import { SaludClienteCard } from '@/components/clientes/id/SaludClienteCard';
import { construirAccionesFicha } from '@/components/clientes/id/accionesFicha';
import { TONO_ESTADO_FICHA, estadoFicha } from '@/components/clientes/id/fichaLogica';
import { motivoSinCobro, useCarteraFicha } from '@/components/clientes/id/useCarteraFicha';
import { CompanyContactsManager } from '@/components/clientes/CompanyContactsManager';
import { mensajeError, useFechasFicha } from '@/components/clientes/id/useFechasFicha';
import { useFichaClienteCrm } from '@/components/crm/ficha/useFichaClienteCrm';
import { CustomerFoliosSection } from '@/components/crm/clientes/CustomerFoliosSection';
import { DocumentUploader } from '@/components/crm/documents/DocumentUploader';
import { RegistrarPagoConectado } from '@/components/finanzas/pagos/RegistrarPagoConectado';
import { EstadoCuentaDialog } from '@/components/finanzas/cartera/EstadoCuentaDialog';

interface Cliente {
  id: string;
  organization_id: number;
  first_name: string;
  last_name: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  notes: string;
  tags: string[] | null;
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
  do_not_call?: boolean | null;
  health_score?: number | null;
  branch_id?: number | null;
  branch?: { name: string | null } | { name: string | null }[] | null;
}

/** Por qué no cargó la ficha: un código que se traduce o el mensaje de Supabase. */
type ErrorFicha = { codigo: 'sinId' | 'noExiste' | 'carga' } | { mensaje: string };

/** Pestañas en el orden del Figma (331:113171). */
const PESTANAS = ['resumen', 'informacion', 'actividad', 'finanzas', 'oportunidades', 'contactos', 'notas'] as const;
type Pestana = (typeof PESTANAS)[number];
/** Valores de `?pestana=` anteriores: los enlaces ya compartidos siguen abriendo su pestaña. */
const ALIAS_PESTANA = { info: 'informacion', timeline: 'actividad', cuentas: 'finanzas' } as const satisfies Record<string, Pestana>;
const VALORES_URL = [...PESTANAS, ...(Object.keys(ALIAS_PESTANA) as (keyof typeof ALIAS_PESTANA)[])] as const;
type ValorUrl = (typeof VALORES_URL)[number];
/** Clave de cada pestaña en `clientes.ficha.pestanas`. */
const ETIQUETA: Record<Pestana, string> = {
  resumen: 'resumen',
  informacion: 'info',
  actividad: 'actividad',
  finanzas: 'finanzas',
  oportunidades: 'oportunidades',
  contactos: 'contactos',
  notas: 'notasDocumentos',
};
const ID_PESTANAS = 'ficha-cliente';
const uno = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

export default function PerfilCliente() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  const t = useTranslations('clientes.ficha');
  const tCrm = useTranslations('crm.fichaCliente');
  const { instante, timezone } = useFechasFicha();
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ErrorFicha | null>(null);
  const [recarga, setRecarga] = useState(0);
  const [eliminarAbierto, setEliminarAbierto] = useState(false);
  const [pagoAbierto, setPagoAbierto] = useState(false);
  const [estadoCuentaAbierto, setEstadoCuentaAbierto] = useState(false);
  const [valorUrl, setValorUrl] = useOpcionUrl<ValorUrl>('pestana', VALORES_URL, 'resumen');

  const recargar = useCallback(() => setRecarga((n) => n + 1), []);
  const idsCliente = useMemo(() => (id ? [id] : []), [id]);
  const { cambiarEstado } = useOperacionesClientes(cliente?.organization_id ?? null, recargar);
  const cartera = useCarteraFicha(cliente?.id ?? null);
  // D1 (CRM ola 3A): esta es la ficha única; el bloque CRM vive aquí y /app/crm/clientes/[id] redirige.
  const crm = useFichaClienteCrm(
    cliente
      ? {
          id: cliente.id,
          nombre: cliente.full_name || `${cliente.first_name || ''} ${cliente.last_name || ''}`.trim(),
          email: cliente.email,
          phone: cliente.phone,
          do_not_call: cliente.do_not_call ?? null,
        }
      : null,
  );

  useEffect(() => {
    let cancelado = false;
    const cargar = async () => {
      if (!id) {
        setError({ codigo: 'sinId' });
        setLoading(false);
        return;
      }
      setError(null);
      const { data, error: err } = await supabase.from('customers').select('*, branch:branches(name)').eq('id', id).maybeSingle();
      if (cancelado) return;
      if (err) {
        const mensaje = mensajeError(err);
        setError(mensaje ? { mensaje } : { codigo: 'carga' });
      } else if (!data) setError({ codigo: 'noExiste' });
      else setCliente(data as Cliente);
      setLoading(false);
    };
    void cargar();
    return () => {
      cancelado = true;
    };
  }, [id, recarga]);

  if (loading) {
    // Figma 332:116573: migas, tarjeta de identidad, pestañas, KPIs y la columna derecha.
    return (
      <div className="flex min-h-full flex-col gap-4 bg-canvas p-4 lg:p-6" aria-busy="true">
        <Skeleton className="h-3 w-36" />
        <div className="flex items-center gap-3 rounded-xl border border-line bg-surface p-4">
          <Skeleton className="size-10 rounded-lg" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="hidden h-3 w-12 sm:block" />
        </div>
        <Skeleton className="h-3 w-36" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              {Array.from({ length: 3 }, (_, i) => (
                <Skeleton key={i} className="h-16 rounded-xl" />
              ))}
            </div>
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-8 w-full rounded-lg" />
            ))}
          </div>
          <div className="flex flex-col gap-3">
            <Skeleton className="h-28 rounded-xl" />
            <Skeleton className="h-28 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !cliente) {
    const noExiste = !error || ('codigo' in error && error.codigo === 'noExiste');
    return (
      <div className="flex min-h-full flex-col gap-4 bg-canvas p-4 lg:p-6">
        {/* Figma 332:117692: en escritorio solo las migas; en móvil (332:118911) la barra con «←». */}
        <Breadcrumbs
          className="hidden lg:block"
          migas={[
            { etiqueta: t('pagina.migas.inicio'), href: '/app/inicio' },
            { etiqueta: t('pagina.migas.clientes'), href: '/app/clientes' },
            { etiqueta: t('pagina.movilTitulo') },
          ]}
        />
        <PageHeader className="lg:hidden" titulo={t('pagina.movilTitulo')} variante="detail" movil={{ titulo: t('pagina.movilTitulo') }} volverA="/app/clientes" />
        <div className="flex-1 rounded-xl border border-line bg-surface">
          <EmptyState
            variante="error"
            titulo={t('pagina.noEncontrado')}
            descripcion={
              noExiste ? t('pagina.noEncontradoDetalle') : 'mensaje' in error ? error.mensaje : t(`pagina.errores.${error.codigo}`)
            }
            onReintentar={() => {
              setLoading(true);
              recargar();
            }}
            accionSecundaria={{ etiqueta: t('pagina.volverClientes'), href: '/app/clientes' }}
          />
        </div>
      </div>
    );
  }

  const nombre = cliente.full_name || `${cliente.first_name || ''} ${cliente.last_name || ''}`.trim() || t('comun.sinNombre');
  const esEmpresa = cliente.customer_type === 'company';
  const documento = documentoCliente({
    identification_type: cliente.identification_type ?? null,
    identification_number: cliente.identification_number ?? null,
    dv: cliente.dv ?? null,
  });
  const sucursal = uno(cliente.branch)?.name ?? null;
  const desde = instante(cliente.created_at, { day: 'numeric', month: 'short', year: 'numeric' });
  const subtitulo = [desde && t('pagina.clienteDesde', { fecha: desde }), sucursal, documento].filter(Boolean).join(' · ');
  const estado = estadoFicha(cliente);

  // «Contactos» solo existe en empresas: en una persona, `?pestana=contactos` abre «Resumen».
  const pedida: Pestana = valorUrl in ALIAS_PESTANA ? ALIAS_PESTANA[valorUrl as keyof typeof ALIAS_PESTANA] : (valorUrl as Pestana);
  const pestana: Pestana = pedida === 'contactos' && !esEmpresa ? 'resumen' : pedida;
  const pestanas: PestanaTab<Pestana>[] = PESTANAS.filter((p) => p !== 'contactos' || esEmpresa).map((p) => ({ valor: p, etiqueta: t(`pestanas.${ETIQUETA[p]}`) }));

  const sinCobro = motivoSinCobro(cartera);
  const MOTIVOS_COBRO = {
    cargando: t('motivos.cargandoCartera'),
    sinPermiso: t('motivos.sinPermisoCobro'),
    error: t('motivos.errorCartera'),
    sinSaldo: t('motivos.sinSaldo'),
  } as const;
  const motivoPago = sinCobro ? MOTIVOS_COBRO[sinCobro] : null;
  const motivoEstadoCuenta = cartera.estado === 'sinPermiso' ? t('motivos.sinPermisoCartera') : null;
  const abrirPago = () => {
    if (!motivoPago) setPagoAbierto(true);
  };
  const abrirEstadoCuenta = () => {
    if (!motivoEstadoCuenta) setEstadoCuentaAbierto(true);
  };

  const acciones = construirAccionesFicha({
    clienteId: cliente.id,
    inactivo: cliente.status === 'inactive',
    t: (clave) => t(clave),
    navegar: (ruta) => router.push(ruta),
    onRegistrarPago: abrirPago,
    motivoPago,
    onNuevaOportunidad: crm.onNuevaOportunidad,
    onEstadoCuenta: abrirEstadoCuenta,
    motivoEstadoCuenta,
    onCambiarEstado: (nuevo) => void cambiarEstado([cliente.id], nuevo, nombre),
    onEliminar: () => setEliminarAbierto(true),
  });

  return (
    <div className="flex min-h-full flex-col gap-3 bg-canvas p-4 lg:p-6">
      <PageHeader
        titulo={nombre}
        subtitulo={subtitulo}
        variante="detail"
        icono={esEmpresa ? Building2 : User}
        badge={
          <Badge tono={TONO_ESTADO_FICHA[estado].tono} apariencia={TONO_ESTADO_FICHA[estado].apariencia} tamano="md">
            {t(`estado.${estado}`)}
          </Badge>
        }
        migas={[
          { etiqueta: t('pagina.migas.inicio'), href: '/app/inicio' },
          { etiqueta: t('pagina.migas.clientes'), href: '/app/clientes' },
          { etiqueta: nombre },
        ]}
        volverA="/app/clientes"
        acciones={
          <>
            <Button asChild variant="outline" className="h-10">
              <Link href={`/app/clientes/${cliente.id}/editar`}>
                <Pencil aria-hidden="true" className="mr-2 size-4" strokeWidth={1.5} />
                {t('pagina.editar')}
              </Link>
            </Button>
            <Button
              className="h-10"
              disabled={!!motivoPago}
              onClick={abrirPago}
              title={motivoPago ?? undefined}
              aria-describedby={motivoPago ? 'motivo-registrar-pago' : undefined}
            >
              <HandCoins aria-hidden="true" className="mr-2 size-4" strokeWidth={1.5} />
              {t('pagina.registrarPago')}
            </Button>
            {motivoPago && (
              <span id="motivo-registrar-pago" className="sr-only">
                {motivoPago}
              </span>
            )}
            <RowActionsMenu acciones={acciones} orientacion="horizontal" tamano="md" titulo={nombre} />
          </>
        }
        movil={{
          titulo: nombre,
          subtitulo: documento ?? undefined,
          accion: <RowActionsMenu acciones={acciones} orientacion="vertical" titulo={nombre} />,
        }}
      />

      <ClienteHeader cliente={cliente} pie={crm.barra} />

      <TabBar id={ID_PESTANAS} etiqueta={t('pestanasAria')} valor={pestana} onValorChange={setValorUrl} pestanas={pestanas} className="mt-1" />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div role="tabpanel" id={idPanel(ID_PESTANAS, pestana)} aria-labelledby={idPestana(ID_PESTANAS, pestana)} tabIndex={0} className="min-w-0 focus-visible:outline-none">
          {/* Solo se monta la pestaña activa: cada una pide sus datos al abrirse. */}
          {pestana === 'resumen' && (
            <ResumenTab
              clienteId={cliente.id}
              organizationId={cliente.organization_id}
              vacio={crm.vacioResumen}
              cartera={cartera}
              onVerActividad={() => setValorUrl('actividad')}
            />
          )}
          {pestana === 'informacion' && <InfoTab clienteId={cliente.id} organizationId={cliente.organization_id} />}
          {pestana === 'actividad' && <TimelineTab key={crm.recarga} clienteId={cliente.id} organizationId={cliente.organization_id} />}
          {pestana === 'finanzas' && (
            <div className="flex flex-col gap-4">
              <CuentasTab
                clienteId={cliente.id}
                organizationId={cliente.organization_id}
                cartera={cartera}
                motivoPago={motivoPago}
                onRegistrarPago={abrirPago}
                onEstadoCuenta={abrirEstadoCuenta}
                motivoEstadoCuenta={motivoEstadoCuenta}
              />
              {/* Antes en /app/crm/clientes/[id] (D1): folios del PMS. */}
              <CustomerFoliosSection customerId={cliente.id} />
            </div>
          )}
          {pestana === 'oportunidades' && (
            <OportunidadesTab clienteId={cliente.id} organizationId={cliente.organization_id} onNuevaOportunidad={crm.onNuevaOportunidad} recarga={crm.recarga} />
          )}
          {pestana === 'contactos' && <CompanyContactsManager companyId={cliente.id} organizationId={cliente.organization_id} />}
          {pestana === 'notas' && (
            // Figma 332:116009: notas a la izquierda, documentos del cliente a la derecha.
            <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
              <NotasArchivosTab clienteId={cliente.id} organizationId={cliente.organization_id} />
              <DocumentUploader organizationId={cliente.organization_id} relatedType="customer" relatedId={cliente.id} title={tCrm('documentos')} />
            </div>
          )}
        </div>

        <aside aria-label={t('columnaLateral')} className="flex flex-col gap-3">
          <TareasSidebar clienteId={cliente.id} organizationId={cliente.organization_id} onNuevaTarea={crm.onNuevaTarea} recarga={crm.recarga} />
          {/* Figma 331:113288 (y 772:19838): «Salud del cliente» en la columna derecha. */}
          <SaludClienteCard customerId={cliente.id} lifecycleStage={cliente.lifecycle_stage ?? null} />
        </aside>
      </div>

      {crm.dialogos}

      {pagoAbierto && (
        <RegistrarPagoConectado
          abierto={pagoAbierto}
          onAbiertoChange={setPagoAbierto}
          destino={{ tipo: 'tercero', customerId: cliente.id }}
          origen="ficha_cliente"
          onRegistrado={() => cartera.recargar()}
        />
      )}

      <EstadoCuentaDialog
        abierto={estadoCuentaAbierto}
        onAbiertoChange={setEstadoCuentaAbierto}
        clienteId={cliente.id}
        clienteNombre={nombre}
        correo={cliente.email}
        hoy={todayInTz(timezone)}
      />

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
