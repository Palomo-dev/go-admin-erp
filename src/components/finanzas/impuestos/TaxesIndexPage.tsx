"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Receipt, ArrowLeft } from 'lucide-react';
import TaxesTable from './TaxesTable';
import RetencionesTable from './RetencionesTable';
import { useImpuestosOrganizacion } from './useImpuestosOrganizacion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TabBar, idPanel, idPestana } from '@/components/kit';

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
    <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/app/finanzas">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
          <Receipt className="h-6 w-6 text-blue-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Gestión de Impuestos
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            {loading ? 'Finanzas / Impuestos' : t('resumen', { impuestos: impuestos.length, retenciones: retenciones.length })}
          </p>
        </div>
      </div>

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

      {/* Content */}
      <div
        role="tabpanel"
        id={idPanel(ID_TABS, 'impuestos')}
        aria-labelledby={idPestana(ID_TABS, 'impuestos')}
        hidden={pestana !== 'impuestos'}
      >
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <TaxesTable taxes={impuestos} loading={loading} organizationId={organizationId} onRefresh={recargar} />
          </CardContent>
        </Card>
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
