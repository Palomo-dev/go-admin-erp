'use client';

/**
 * Identidades del CRM (Figma CRM 1436:19, 1438:721 y 1438:1130): posibles
 * duplicados y cómo se reconoce a cada cliente en cada canal. Todo se lee por
 * `/api/crm/**` (organización y permisos en el servidor); fusionar y deshacer
 * son RPC transaccionales (`crm_merge_customers`, `crm_unmerge_customer`).
 */

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { History, Merge, RefreshCw, X } from 'lucide-react';
import { PageHeader } from '@/components/kit/PageHeader';
import { SegmentedControl } from '@/components/kit/SegmentedControl';
import { clasesBoton } from '@/components/kit/botonClases';
import { cn } from '@/utils/Utils';
import { DuplicadosPanel, useDuplicados } from './DuplicadosPanel';
import { IdentidadesCanalPanel } from './IdentidadesCanalPanel';

type Pestana = 'duplicados' | 'canales';

export function IdentidadesPage() {
  const t = useTranslations('crm.duplicados.pantalla');
  const router = useRouter();
  const [pestana, setPestana] = useState<Pestana>('duplicados');
  const dup = useDuplicados();
  const buscando = dup.estado === 'cargando';
  const total = dup.datos?.grupos.length;

  return (
    <div className="flex min-h-full flex-col gap-4 bg-canvas p-4 lg:p-6">
      <PageHeader
        titulo={t('titulo')}
        subtitulo={t('subtitulo')}
        icono={Merge}
        migas={[{ etiqueta: t('migaCrm'), href: '/app/crm' }, { etiqueta: t('titulo') }]}
        acciones={
          <>
            {dup.datos?.puedeFusionar && (
              <Link href="/app/crm/identidades/historial" className={clasesBoton({ variante: 'secundario' })}>
                <History aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('historial')}
              </Link>
            )}
            <button
              type="button"
              onClick={() => {
                setPestana('duplicados');
                dup.recargar();
              }}
              disabled={buscando}
              className={clasesBoton()}
            >
              <RefreshCw aria-hidden="true" className={cn('size-4', buscando && 'animate-spin')} strokeWidth={1.5} />
              {t('buscarAhora')}
            </button>
            <Link href="/app/crm" aria-label={t('cerrar')} title={t('cerrar')} className={clasesBoton({ variante: 'secundario', className: 'size-10 px-0' })}>
              <X aria-hidden="true" className="size-4" strokeWidth={1.5} />
            </Link>
          </>
        }
        movil={{
          titulo: t('titulo'),
          menu: [
            { id: 'buscar', etiqueta: t('buscarAhora'), icono: RefreshCw, onSelect: () => { setPestana('duplicados'); dup.recargar(); } },
            ...(dup.datos?.puedeFusionar ? [{ id: 'historial', etiqueta: t('historial'), icono: History, onSelect: () => router?.push('/app/crm/identidades/historial') }] : []),
          ],
        }}
      />

      <SegmentedControl<Pestana>
        etiqueta={t('pestanas.etiqueta')}
        valor={pestana}
        onValorChange={setPestana}
        className="self-start"
        opciones={[
          { valor: 'duplicados', etiqueta: t('pestanas.duplicados'), contador: total },
          { valor: 'canales', etiqueta: t('pestanas.canales') },
        ]}
      />

      {pestana === 'duplicados' ? <DuplicadosPanel estado={dup.estado} datos={dup.datos} onRecargar={dup.recargar} /> : <IdentidadesCanalPanel />}
    </div>
  );
}
