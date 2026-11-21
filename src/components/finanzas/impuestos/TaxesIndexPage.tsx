"use client";

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Download, Percent, Plus, RefreshCw } from 'lucide-react';
import TaxesTable from './TaxesTable';
import RetencionesTable from './RetencionesTable';
import { useImpuestosOrganizacion } from './useImpuestosOrganizacion';
import { plantillasPendientes } from './impuestosLogica';
import { PageHeader, RowActionsMenu, TabBar, clasesBoton, idPanel, idPestana, type AccionFila } from '@/components/kit';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabase/config';
import { usePermisosFinanzas } from '@/lib/finanzas/usePermisosFinanzas';

type Pestana = 'impuestos' | 'retenciones';
const ID_TABS = 'impuestos-org';

/**
 * Finanzas › Impuestos. Dos pestañas (Figma 1012:86383 y 1012:87187, B-I2):
 * «Impuestos» (lo que se ofrece al producto, al POS y a las facturas) y
 * «Retenciones» (ReteFuente, ReteIVA, ReteICA: nunca se suman al precio). Una
 * sola lectura; la separación es la clase `kind`.
 *
 * Las acciones de gestión solo se muestran con permiso de finanzas (crear o
 * aprobar), el mismo que exige la base en `fn_impuestos_exigir_gestion`.
 */
const TaxesIndexPage = () => {
  const t = useTranslations('impuestosRetenciones');
  const ti = useTranslations('finanzasImpuestos');
  const { toast } = useToast();
  const permisos = usePermisosFinanzas();
  const puedeGestionar = permisos.crear || permisos.aprobar;
  const [pestana, setPestana] = useState<Pestana>('impuestos');
  const [solicitudNuevo, setSolicitudNuevo] = useState(0);
  const [cargandoPlantilla, setCargandoPlantilla] = useState(false);
  const { organizationId, todos, impuestos, retenciones, uso, plantillas, loading, error, sinPermiso, recargar } = useImpuestosOrganizacion();

  const pendientes = plantillasPendientes(plantillas, todos);
  const tarifaDefecto = impuestos.find((x) => x.is_default && x.is_active);
  const pais = plantillas[0]?.country ?? '';

  // `initialize_organization_taxes`: crea las plantillas del país que la
  // organización aún no tiene (no toca las existentes; exige permiso de impuestos).
  const cargarPlantilla = async () => {
    if (!organizationId) return;
    setCargandoPlantilla(true);
    try {
      const { error: rpcError } = await supabase.rpc('initialize_organization_taxes', { org_id: organizationId });
      if (rpcError) throw rpcError;
      await recargar();
      toast({ description: ti('plantilla.cargada', { pais }) });
    } catch (err) {
      console.error('Error al cargar la plantilla de impuestos:', err);
      toast({ title: ti('toast.errorTitulo'), description: ti('plantilla.error'), variant: 'destructive' });
    } finally {
      setCargandoPlantilla(false);
    }
  };

  const nuevo = () => setSolicitudNuevo((n) => n + 1);
  const menu: AccionFila[] = [
    { id: 'actualizar', etiqueta: ti('acciones.actualizar'), icono: RefreshCw, onSelect: () => void recargar() },
    ...(puedeGestionar && pendientes > 0 && pais && pestana === 'impuestos'
      ? [{ id: 'plantilla', etiqueta: ti('plantilla.cargar', { pais }), icono: Download, onSelect: () => void cargarPlantilla() }]
      : []),
  ];

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 lg:gap-5">
      {/* Cabecera del kit con las pestañas debajo (Figma 1012:86383, aprobado 830:526193). */}
      <PageHeader
        titulo={t('titulo')}
        icono={Percent}
        migas={[{ etiqueta: t('migas.finanzas'), href: '/app/finanzas' }, { etiqueta: t('titulo') }]}
        subtitulo={
          loading
            ? undefined
            : [
                ti('subtitulo', { impuestos: impuestos.length, retenciones: retenciones.length }),
                tarifaDefecto ? ti('subtituloTarifa', { tarifa: tarifaDefecto.name }) : ti('subtituloSinTarifa'),
              ].join(' · ')
        }
        cargando={loading}
        acciones={
          <>
            {puedeGestionar && pendientes > 0 && pais && pestana === 'impuestos' && (
              <button
                type="button"
                className={clasesBoton({ variante: 'secundario', className: 'hidden md:inline-flex' })}
                onClick={() => void cargarPlantilla()}
                disabled={cargandoPlantilla || !organizationId}
              >
                <Download className="size-4" aria-hidden="true" strokeWidth={1.5} />
                {ti('plantilla.cargar', { pais })}
              </button>
            )}
            {puedeGestionar && pestana === 'impuestos' && (
              <button
                type="button"
                className={clasesBoton({ variante: 'primario' })}
                onClick={nuevo}
                disabled={!organizationId || sinPermiso}
              >
                <Plus className="size-4" aria-hidden="true" strokeWidth={1.5} />
                {ti('nuevo')}
              </button>
            )}
            <RowActionsMenu acciones={menu} orientacion="horizontal" titulo={t('titulo')} />
          </>
        }
        movil={{
          menu: [
            ...(puedeGestionar && pestana === 'impuestos' && organizationId && !sinPermiso
              ? [{ id: 'nuevo', etiqueta: ti('nuevo'), icono: Plus, onSelect: nuevo }]
              : []),
            ...menu,
          ],
          subtitulo: loading ? undefined : ti('subtituloMovil', { impuestos: impuestos.length, activos: impuestos.filter((x) => x.is_active).length }),
        }}
        debajo={
          <TabBar
            id={ID_TABS}
            etiqueta={t('pestanas.etiqueta')}
            valor={pestana}
            onValorChange={setPestana}
            pestanas={[
              { valor: 'impuestos', etiqueta: ti('pestanas.impuestos'), contador: loading ? undefined : impuestos.length },
              { valor: 'retenciones', etiqueta: t('pestanas.retenciones'), contador: loading ? undefined : retenciones.length },
            ]}
          />
        }
      />

      <div
        role="tabpanel"
        id={idPanel(ID_TABS, 'impuestos')}
        aria-labelledby={idPestana(ID_TABS, 'impuestos')}
        hidden={pestana !== 'impuestos'}
      >
        <TaxesTable
          taxes={impuestos}
          plantillas={plantillas}
          uso={uso}
          loading={loading}
          error={error}
          sinPermiso={sinPermiso}
          organizationId={organizationId}
          puedeGestionar={puedeGestionar}
          solicitudNuevo={solicitudNuevo}
          onRefresh={recargar}
        />
      </div>
      <div
        role="tabpanel"
        id={idPanel(ID_TABS, 'retenciones')}
        aria-labelledby={idPestana(ID_TABS, 'retenciones')}
        hidden={pestana !== 'retenciones'}
      >
        <RetencionesTable
          retenciones={retenciones}
          loading={loading}
          error={error}
          organizationId={organizationId}
          onRefresh={recargar}
        />
      </div>
    </div>
  );
};

export default TaxesIndexPage;
