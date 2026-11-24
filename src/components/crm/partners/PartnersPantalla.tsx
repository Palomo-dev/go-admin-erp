'use client';

/**
 * /app/crm/partners — Partners del CRM (Figma «CRM · Red y gestión», fila 2:
 * 1316:773848 Directorio, 1319:94585 Comisiones y niveles, 1411:41956 vacío,
 * 1411:42449 cargando, 1411:42968 error). Cabecera con «Exportar» y «Nuevo
 * partner», pestañas Partners · Deals · Comisiones · Niveles (en la URL,
 * `?pestana=`). «Comisiones» y los montos por pagar solo para admin/manager
 * (`can_manage`, decidido en el servidor). Toda escritura va por
 * `/api/crm/partners/**`; ninguna comisión es dinero movido.
 */

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Briefcase, Download, Pencil, Plus } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { PageHeader } from '@/components/kit/PageHeader';
import { TabBar } from '@/components/kit/TabBar';
import { EmptyState } from '@/components/kit/EmptyState';
import { clasesBoton } from '@/components/kit/botonClases';
import type { EstadoTabla } from '@/components/kit/DataTable';
import { useOpcionUrl } from '@/components/kit/useParametroUrl';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { todayInTz } from '@/lib/utils/dateDisplay';
import type { PartnerView } from '@/lib/services/crm/partnerService';
import { DealsTabla } from './DealsTabla';
import { NivelesLista } from './NivelesLista';
import { PartnerEditor } from './PartnerEditor';
import { PartnersComisiones } from './PartnersComisiones';
import { PartnersDirectorio } from './PartnersDirectorio';
import { RegisterDealDialog } from './RegisterDealDialog';
import { TierEditor } from './TierEditor';
import { usePartners } from './usePartners';
import { claveErrorPartners } from './redPartnersErrores';
import {
  FILTROS_PARTNERS_INICIALES,
  PESTANAS_PARTNERS,
  csvPartners,
  filtrarPartners,
  kpisPartners,
  monedaDeals,
  pestanaPartners,
  type DealFila,
  type FiltrosPartners,
  type PestanaPartners,
} from './redPartnersLogica';

export function PartnersPantalla() {
  const t = useTranslations('crm.redPartners');
  const { timezone } = useFormatDate();
  const monedaOrg = useMonedaOrganizacion();
  const d = usePartners();
  const [pestanaUrl, setPestana] = useOpcionUrl<PestanaPartners>('pestana', PESTANAS_PARTNERS, 'partners');
  const [filtros, setFiltros] = useState<FiltrosPartners>(FILTROS_PARTNERS_INICIALES);
  const [nuevo, setNuevo] = useState(false);
  const [niveles, setNiveles] = useState(false);
  const [registrarPara, setRegistrarPara] = useState<PartnerView | null>(null);

  const pestana = pestanaPartners(pestanaUrl, d.canManage);
  const deals = d.deals as unknown as DealFila[];
  const anio = Number(todayInTz(timezone).slice(0, 4));
  const { moneda } = monedaDeals(deals, monedaOrg.code);
  const kpis = useMemo(() => (d.cargado ? kpisPartners(d.partners, deals, anio, timezone) : null), [d.cargado, d.partners, deals, anio, timezone]);

  const sinPermiso = d.error?.status === 403;
  const conError = !!d.error && !d.cargado && !sinPermiso;
  const vacio = d.cargado && !d.error && d.partners.length === 0;
  const estado: EstadoTabla = sinPermiso ? 'sinPermiso' : conError ? 'error' : d.cargando && !d.cargado ? 'cargando' : 'listo';
  const registrar = registrarPara ? d.partners.find((p) => p.id === registrarPara.id) ?? registrarPara : null;

  const exportar = () => {
    const filas = filtrarPartners(d.partners, filtros);
    if (filas.length === 0) {
      toast({ title: t('exportar.vacio') });
      return;
    }
    const csv = csvPartners(
      filas,
      [t('csv.nombre'), t('csv.empresa'), t('csv.correo'), t('csv.telefono'), t('csv.nivel'), t('csv.comision'), t('csv.deals'), t('csv.revenue'), t('csv.porPagar'), t('csv.estado')],
      { activo: t('estado.activo'), inactivo: t('estado.inactivo'), sinNivel: t('nivel.sinNivel') },
    );
    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'partners.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const reactivar = async (p: PartnerView) => {
    try {
      await d.savePartner({ is_active: true }, p.id);
      toast({ title: t('acciones.reactivado', { nombre: p.name }) });
    } catch (e) {
      toast({ title: t('acciones.errorReactivar'), description: t(claveErrorPartners(e)), variant: 'destructive' });
    }
  };

  const migas = [
    { etiqueta: t('migas.crm'), href: '/app/crm' },
    pestana === 'partners' ? { etiqueta: t('titulo') } : { etiqueta: t('titulo'), href: '/app/crm/partners' },
    ...(pestana === 'partners' ? [] : [{ etiqueta: t(`tabs.${pestana}`) }]),
  ];

  const pestanas = [
    { valor: 'partners' as const, etiqueta: t('tabs.partners'), contador: d.cargado ? d.partners.length : undefined },
    { valor: 'deals' as const, etiqueta: t('tabs.deals'), contador: d.cargado ? deals.length : undefined },
    ...(d.canManage ? [{ valor: 'comisiones' as const, etiqueta: t('tabs.comisiones') }] : []),
    { valor: 'niveles' as const, etiqueta: t('tabs.niveles'), contador: d.cargado ? d.tiers.length : undefined },
  ];

  const recargar = () => void d.recargar();

  return (
    <div className="flex min-h-full flex-col gap-4 bg-canvas p-4 lg:p-6">
      <PageHeader
        titulo={t('titulo')}
        subtitulo={t('subtitulo')}
        migas={migas}
        cargando={d.cargando && d.cargado}
        acciones={
          !sinPermiso && (
            <>
              <button type="button" onClick={exportar} disabled={!d.cargado} className={clasesBoton({ variante: 'secundario' })}>
                <Download aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('acciones.exportar')}
              </button>
              {d.canManage && (
                <button type="button" onClick={() => setNuevo(true)} className={clasesBoton()}>
                  <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
                  {t('acciones.nuevo')}
                </button>
              )}
            </>
          )
        }
        movil={{
          titulo: t('titulo'),
          subtitulo: d.cargado ? t('subtituloMovil', { n: d.partners.length }) : undefined,
          accion: d.canManage ? (
            <button type="button" onClick={() => setNuevo(true)} aria-label={t('acciones.nuevo')} className="flex size-10 items-center justify-center rounded-lg text-fg hover:bg-hover">
              <Plus aria-hidden="true" className="size-5" strokeWidth={1.5} />
            </button>
          ) : undefined,
        }}
      />

      {!sinPermiso && <TabBar<PestanaPartners> id="partners" etiqueta={t('tabs.etiqueta')} pestanas={pestanas} valor={pestana} onValorChange={setPestana} />}

      {sinPermiso ? (
        <div className="rounded-xl border border-line bg-surface">
          <EmptyState variante="forbidden" titulo={t('estados.sinPermiso.titulo')} descripcion={t('estados.sinPermiso.descripcion')} accion={{ etiqueta: t('estados.sinPermiso.volver'), href: '/app/crm' }} />
        </div>
      ) : vacio && pestana === 'partners' ? (
        <div className="rounded-xl border border-line bg-surface">
          <EmptyState
            variante="empty"
            icono={Briefcase}
            titulo={t('estados.vacio.titulo')}
            descripcion={t('estados.vacio.descripcion')}
            accion={d.canManage ? { etiqueta: t('acciones.nuevo'), icono: Plus, onClick: () => setNuevo(true) } : undefined}
            accionSecundaria={{ etiqueta: t('estados.vacio.configurarNiveles'), onClick: () => setNiveles(true) }}
          />
        </div>
      ) : pestana === 'partners' ? (
        <PartnersDirectorio
          partners={d.partners}
          tiers={d.tiers}
          kpis={kpis}
          anio={anio}
          moneda={moneda}
          estado={estado}
          puedeGestionar={d.canManage}
          filtros={filtros}
          onFiltros={setFiltros}
          onRegistrarDeal={setRegistrarPara}
          onReactivar={(p) => void reactivar(p)}
          onReintentar={recargar}
        />
      ) : pestana === 'deals' ? (
        <DealsTabla
          deals={deals}
          estado={estado}
          conPartner
          puedeGestionar={d.canManage}
          onTransicion={d.transitionDeal}
          onReintentar={recargar}
          vacio={{ titulo: t('dealsTab.vacio'), descripcion: t('dealsTab.vacioDescripcion') }}
        />
      ) : pestana === 'comisiones' ? (
        conError ? (
          <div className="rounded-xl border border-line bg-surface">
            <EmptyState variante="error" titulo={t('estados.error.titulo')} descripcion={t('estados.error.descripcion')} onReintentar={recargar} />
          </div>
        ) : (
          <PartnersComisiones
            partners={d.partners}
            deals={deals}
            tiers={d.tiers}
            zona={timezone}
            anioActual={anio}
            moneda={moneda}
            cargando={estado === 'cargando'}
            puedeGestionar={d.canManage}
            onEditarNiveles={() => setNiveles(true)}
          />
        )
      ) : conError ? (
        <div className="rounded-xl border border-line bg-surface">
          <EmptyState variante="error" titulo={t('estados.error.titulo')} descripcion={t('estados.error.descripcion')} onReintentar={recargar} />
        </div>
      ) : (
        <section aria-labelledby="partners-niveles" className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-1">
              <h2 id="partners-niveles" className="text-base font-semibold text-fg">{t('tabs.niveles')}</h2>
              <p className="text-[13px] text-fg-secondary">{t('nivelesTab.descripcion')}</p>
            </div>
            {d.canManage && (
              <button type="button" onClick={() => setNiveles(true)} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
                <Pencil aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {d.tiers.length ? t('nivelesTab.editar') : t('estados.vacio.configurarNiveles')}
              </button>
            )}
          </div>
          <NivelesLista tiers={d.tiers} partners={d.partners} moneda={moneda} cargando={estado === 'cargando'} />
        </section>
      )}

      <PartnerEditor abierto={nuevo} partner={null} tiers={d.tiers} onAbiertoChange={setNuevo} onGuardar={d.savePartner} />
      <TierEditor abierto={niveles} tiers={d.tiers} canManage={d.canManage} onAbiertoChange={setNiveles} onGuardar={d.saveTier} onBorrar={d.deleteTier} />
      <RegisterDealDialog
        abierto={registrar !== null}
        partner={registrar}
        puedeAjustar={d.canManage}
        onAbiertoChange={(a) => {
          if (!a) setRegistrarPara(null);
        }}
        onRegistrar={d.registerDeal}
      />
      <span className="sr-only" aria-live="polite">{d.cargado ? t('anuncio', { n: d.partners.length }) : ''}</span>
    </div>
  );
}
