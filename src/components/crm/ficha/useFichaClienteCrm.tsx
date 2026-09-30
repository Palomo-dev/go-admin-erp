'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { CalendarClock, Phone, ShoppingCart, StickyNote } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { clasesBoton } from '@/components/kit/botonClases';
import { OpportunityForm } from '@/components/crm/kit/OpportunityForm';
import type { AccionRapidaCrm } from '@/components/crm/kit/quickActionLogica';
import { AccionesRapidasCrm } from '@/components/crm/acciones/AccionesRapidasCrm';
import { claveError, emitirCambioCrm, EVENTO_CAMBIO_CRM, pedirCrm } from '@/components/crm/acciones/apiCrm';
import { puede } from '@/components/crm/acciones/catalogosCrmLogica';
import { useCatalogosCrm } from '@/components/crm/acciones/useCatalogosCrm';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';

/**
 * Bloque CRM de la ficha única del cliente (D1: `/app/clientes/[id]`; CRM ola
 * 3A, plan §4.11; Figma 772:19838, 772:20628, 772:20971 y 772:21523):
 *
 * - barra de acciones rápidas `Variant=cliente` con «Nueva oportunidad»;
 * - «Nueva oportunidad» → `OpportunityForm Layout=sheet Origen=cliente`
 *   (cliente fijado) → `POST /api/crm/opportunities`;
 * - vacío corregido del resumen: Nota, Registrar llamada y Registrar venta;
 * - «Nueva tarea» del panel de tareas → tarea rápida por `/api/crm/tasks`.
 *
 * Devuelve piezas que la página coloca donde el Figma las dibuja, y un
 * contador `recarga` que cambia con `crm:entity-changed`.
 */
export interface ClienteFichaCrm {
  id: string;
  nombre: string;
  email?: string | null;
  phone?: string | null;
  do_not_call?: boolean | null;
}

export function useFichaClienteCrm(cliente: ClienteFichaCrm | null) {
  const t = useTranslations('crm.fichaCliente');
  const te = useTranslations('crm.accionesRapidas.errores');
  const router = useRouter();
  const cat = useCatalogosCrm();
  const moneda = useMonedaOrganizacion();
  const [recarga, setRecarga] = useState(0);
  const [hoja, setHoja] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [abrir, setAbrir] = useState<{ accion: AccionRapidaCrm; clave: number } | null>(null);

  useEffect(() => {
    const oir = () => setRecarga((n) => n + 1);
    window.addEventListener(EVENTO_CAMBIO_CRM, oir);
    return () => window.removeEventListener(EVENTO_CAMBIO_CRM, oir);
  }, []);

  const puedeCrear = puede(cat.permisos, 'crm.opportunities.create') && cat.pipelines.length > 0;
  const nuevaOportunidad = () => {
    setError(null);
    setHoja(true);
  };
  const lanzar = (accion: AccionRapidaCrm) => setAbrir({ accion, clave: Date.now() });

  const crear = async (cuerpo: Record<string, unknown>) => {
    if (!cliente) return;
    setOcupado(true);
    setError(null);
    try {
      const { data } = await pedirCrm<{ id?: string }>('/api/crm/opportunities', { method: 'POST', cuerpo: { ...cuerpo, customer_id: cliente.id, origen: 'cliente' } });
      toast({ title: t('oportunidadCreada') });
      setHoja(false);
      emitirCambioCrm({ entidad: 'opportunity', id: data?.id ?? null, accion: 'crear' });
    } catch (e) {
      setError(te(claveError(e)));
    } finally {
      setOcupado(false);
    }
  };

  const clienteBarra = cliente ? { id: cliente.id, full_name: cliente.nombre, email: cliente.email, phone: cliente.phone, do_not_call: cliente.do_not_call } : null;

  const barra: ReactNode = cliente ? (
    <AccionesRapidasCrm variante="cliente" clienteId={cliente.id} cliente={clienteBarra} onNuevaOportunidad={nuevaOportunidad} puedeCrearOportunidad={puedeCrear} />
  ) : null;

  const vacioResumen: ReactNode = cliente ? (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-line bg-surface px-6 py-12 text-center">
      <span aria-hidden="true" className="flex size-12 items-center justify-center rounded-full bg-brand-tint text-brand">
        <CalendarClock className="size-6" strokeWidth={1.5} />
      </span>
      <h3 className="text-base font-semibold text-fg">{t('vacio.titulo')}</h3>
      <p className="max-w-md text-sm text-fg-secondary">{t('vacio.descripcion')}</p>
      <div className="flex flex-wrap justify-center gap-2">
        <button type="button" onClick={() => lanzar('nota')} className={clasesBoton({ variante: 'secundario' })}>
          <StickyNote aria-hidden="true" className="size-4" strokeWidth={1.5} />
          {t('vacio.nota')}
        </button>
        <button type="button" onClick={() => lanzar('llamar')} className={clasesBoton({ variante: 'secundario' })}>
          <Phone aria-hidden="true" className="size-4" strokeWidth={1.5} />
          {t('vacio.llamada')}
        </button>
        <button type="button" onClick={() => router.push('/app/pos')} className={clasesBoton()}>
          <ShoppingCart aria-hidden="true" className="size-4" strokeWidth={1.5} />
          {t('vacio.venta')}
        </button>
      </div>
    </div>
  ) : null;

  const dialogos: ReactNode = cliente ? (
    <>
      <OpportunityForm
        layout="sheet"
        origen="cliente"
        abierto={hoja}
        onAbiertoChange={(x) => !ocupado && setHoja(x)}
        prefill={{ customer_id: cliente.id }}
        contextoOrigen={{ titulo: t('desdeFicha', { nombre: cliente.nombre }) }}
        origenRef={{ customer_id: cliente.id }}
        pipelines={cat.pipelines}
        etapas={cat.etapas}
        usuarios={cat.usuarios}
        usuarioActualId={cat.usuarioId}
        monedaBase={moneda}
        clienteNombre={cliente.nombre}
        onEnviar={(c) => void crear(c as Record<string, unknown>)}
        onCancelar={() => setHoja(false)}
        ocupado={ocupado}
        error={error}
      />
      {abrir && (
        <AccionesRapidasCrm variante="cliente" sinBarra clienteId={cliente.id} cliente={clienteBarra} abrirAccion={abrir} onCerrado={() => setAbrir(null)} />
      )}
    </>
  ) : null;

  return {
    barra,
    vacioResumen,
    dialogos,
    recarga,
    onNuevaOportunidad: puedeCrear ? nuevaOportunidad : undefined,
    onNuevaTarea: cliente ? () => lanzar('tarea') : undefined,
  };
}
