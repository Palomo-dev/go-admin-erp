'use client';

/**
 * Consignaciones (Inventario) — pestañas Entregadas · Recibidas · Por aceptar
 * (Figma R1 `2404:146165`; la entregada es la de R4-B, `2335:138595`). Acciones:
 * «Vincular organización» (R6), «Recibir mercancía» (R4) y, en Entregadas,
 * «Nueva nota». En el celular el kit oculta el PageHeader por debajo de `lg`:
 * las acciones van en `movil.menu`.
 *
 * Mientras las migraciones no se apliquen: «pendiente de activar», sin ceros.
 */
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ClipboardList, Link2, PackageOpen, Plus } from 'lucide-react';
import { AvisoTonal, PageHeader, TabBar, clasesBoton, idPanel, idPestana, useOpcionUrl, type AccionFila } from '@/components/kit';
import { usePermisosFinanzas } from '@/lib/finanzas/usePermisosFinanzas';
import { ErrorPeticionSaldoFavor } from '@/components/finanzas/saldos-a-favor/saldosAFavorService';
import { ListadoConsignaciones } from '@/components/finanzas/consignaciones/ListadoConsignaciones';
import { PESTANAS_CONSIGNACION, rutaRecibida, type PestanaConsignacion, type RespuestaRecibidas } from '@/lib/inventario/consignaciones/recibidas';
import { consignacionesRecibidasService } from './consignacionesRecibidasService';
import { ListadoRecibidas } from './ListadoRecibidas';
import { ListadoPorAceptar } from './ListadoPorAceptar';
import { RecibirMercanciaDialog } from './RecibirMercanciaDialog';
import { VincularOrganizacionDialog } from './VincularOrganizacionDialog';

const NS = 'consignacionesR4';
const ID_TABS = 'consignaciones';

export function ConsignacionesPagina() {
  const t = useTranslations(NS);
  const router = useRouter();
  const permisos = usePermisosFinanzas();
  const [pestana, setPestana] = useOpcionUrl<PestanaConsignacion>('pestana', PESTANAS_CONSIGNACION, 'entregadas');
  const [datos, setDatos] = useState<RespuestaRecibidas | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [recarga, setRecarga] = useState(0);
  const [recibir, setRecibir] = useState(false);
  const [vincular, setVincular] = useState(false);
  const [nuevaEntregada, setNuevaEntregada] = useState(0);
  const recargar = useCallback(() => setRecarga((n) => n + 1), []);

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    consignacionesRecibidasService
      .listar()
      .then((r) => {
        if (!vigente) return;
        setDatos(r);
        setError(null);
      })
      .catch((e) => vigente && setError(e instanceof ErrorPeticionSaldoFavor ? String(e.codigo) : 'error_desconocido'))
      .finally(() => vigente && setCargando(false));
    return () => {
      vigente = false;
    };
  }, [recarga]);

  const pendiente = datos?.pendiente === true || error === 'pendiente_de_activar';
  const estadoError = error === 'sin_permiso' ? 'sinPermiso' : error && !pendiente ? 'error' : null;
  const puedeCrear = permisos.crear && !pendiente;
  const notas = datos?.notas ?? [];
  const porAceptar = datos?.porAceptar ?? [];

  const menuMovil: AccionFila[] = [
    { id: 'recibir', etiqueta: t('acciones.recibir'), icono: PackageOpen, onSelect: () => setRecibir(true), oculta: !permisos.crear, deshabilitada: pendiente },
    { id: 'nueva', etiqueta: t('acciones.nuevaEntregada'), icono: Plus, onSelect: () => setNuevaEntregada((n) => n + 1), oculta: !permisos.crear || pestana !== 'entregadas', deshabilitada: pendiente },
    { id: 'vincular', etiqueta: t('acciones.vincular'), icono: Link2, onSelect: () => setVincular(true), oculta: !permisos.crear, deshabilitada: pendiente },
  ];

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 lg:gap-5">
      <PageHeader
        titulo={t('titulo')}
        subtitulo={t('subtitulo')}
        icono={ClipboardList}
        cargando={cargando}
        migas={[{ etiqueta: t('migas.inventario'), href: '/app/inventario' }, { etiqueta: t('migas.consignaciones') }, { etiqueta: t(`pestanas.${pestana === 'por-aceptar' ? 'porAceptar' : pestana}`) }]}
        acciones={
          permisos.crear ? (
            <>
              <button type="button" onClick={() => setVincular(true)} disabled={pendiente} className={clasesBoton({ variante: 'secundario' })}>
                <Link2 aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('acciones.vincular')}
              </button>
              <button type="button" onClick={() => setRecibir(true)} disabled={pendiente} className={clasesBoton({ variante: 'primario' })}>
                <PackageOpen aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('acciones.recibir')}
              </button>
            </>
          ) : undefined
        }
        movil={{ subtitulo: t('subtitulo'), menu: menuMovil }}
      />

      <TabBar<PestanaConsignacion>
        id={ID_TABS}
        etiqueta={t('pestanas.etiqueta')}
        valor={pestana}
        onValorChange={setPestana}
        pestanas={[
          { valor: 'entregadas', etiqueta: t('pestanas.entregadas') },
          { valor: 'recibidas', etiqueta: t('pestanas.recibidas'), contador: pendiente ? undefined : notas.length },
          { valor: 'por-aceptar', etiqueta: t('pestanas.porAceptar'), contador: pendiente ? undefined : porAceptar.length },
        ]}
      />

      {pendiente && pestana !== 'entregadas' && <AvisoTonal tono="advertencia" rol="status" titulo={t('pendiente.titulo')} descripcion={t('pendiente.descripcion')} />}

      <div role="tabpanel" id={idPanel(ID_TABS, pestana)} aria-labelledby={idPestana(ID_TABS, pestana)}>
        {pestana === 'entregadas' && <ListadoConsignaciones incrustada abrirNueva={nuevaEntregada} />}
        {pestana === 'recibidas' && !pendiente && (
          <ListadoRecibidas notas={notas} cargando={cargando} estadoError={estadoError} puedeCrear={puedeCrear} onRecibir={() => setRecibir(true)} onReintentar={recargar} />
        )}
        {pestana === 'por-aceptar' && !pendiente && <ListadoPorAceptar documentos={porAceptar} cargando={cargando} estadoError={estadoError} onReintentar={recargar} />}
      </div>

      <RecibirMercanciaDialog abierto={recibir} onAbiertoChange={setRecibir} onRecibida={(r) => router.push(rutaRecibida(r.nota_id))} />
      <VincularOrganizacionDialog abierto={vincular} onAbiertoChange={setVincular} />
    </div>
  );
}
