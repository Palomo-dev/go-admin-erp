"use client";

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Percent } from 'lucide-react';
import TaxesTable from './TaxesTable';
import RetencionesTable from './RetencionesTable';
import { useImpuestosOrganizacion } from './useImpuestosOrganizacion';
import { PageHeader, TabBar, idPanel, idPestana } from '@/components/kit';

type Pestana = 'impuestos' | 'retenciones';
const ID_TABS = 'impuestos-org';

/**
 * Finanzas › Impuestos. Dos pestañas (Figma 1012:86383 y 1012:87187, B-I2):
 * «Impuestos de venta y compra» (lo que se ofrece al producto, al POS y a las
 * facturas) y «Retenciones» (ReteFuente, ReteIVA, ReteICA: nunca se suman al
 * precio). Una sola lectura; la separación es la clase `kind`.
 */
const TaxesIndexPage = () => {
  const t = useTranslations('impuestosRetenciones');
  const [pestana, setPestana] = useState<Pestana>('impuestos');
  const { organizationId, impuestos, retenciones, loading, error, recargar } = useImpuestosOrganizacion();

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 lg:gap-5">
      {/* Cabecera del kit con las pestañas debajo (Figma 1012:86383, aprobado 830:526193). */}
      <PageHeader
        titulo={t('titulo')}
        icono={Percent}
        migas={[{ etiqueta: t('migas.finanzas'), href: '/app/finanzas' }, { etiqueta: t('titulo') }]}
        subtitulo={loading ? undefined : t('resumen', { impuestos: impuestos.length, retenciones: retenciones.length })}
        cargando={loading}
        debajo={
          <TabBar
            id={ID_TABS}
            etiqueta={t('pestanas.etiqueta')}
            valor={pestana}
            onValorChange={setPestana}
            pestanas={[
              { valor: 'impuestos', etiqueta: t('pestanas.impuestos'), contador: loading ? undefined : impuestos.length },
              { valor: 'retenciones', etiqueta: t('pestanas.retenciones'), contador: loading ? undefined : retenciones.length },
            ]}
          />
        }
      />

      {/* Content */}
      <div
        role="tabpanel"
        id={idPanel(ID_TABS, 'impuestos')}
        aria-labelledby={idPestana(ID_TABS, 'impuestos')}
        hidden={pestana !== 'impuestos'}
      >
        <TaxesTable taxes={impuestos} loading={loading} organizationId={organizationId} onRefresh={recargar} />
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
