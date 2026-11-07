'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Download, ListChecks, Plus, RefreshCw } from 'lucide-react';
import {
  FilterChips,
  FilterPanel,
  FormField,
  ListToolbar,
  PageHeader,
  RowActionsMenu,
  SearchInput,
  TabBar,
  clasesBoton,
  idPanel,
  idPestana,
  type AccionFila,
} from '@/components/kit';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { aCsv, descargarCsv } from '@/lib/finanzas/csv';
import {
  ESTADOS_DISPERSION,
  esEstadoConocido,
  esMedioConocido,
  filasCsvDispersiones,
  filtrarDispersiones,
  type EstadoDispersion,
} from './cobrosLogica';
import { useCobrosDispersiones } from './useCobrosDispersiones';
import { DispersionesPestana } from './DispersionesPestana';
import { CuentaAbonoPestana } from './CuentaAbonoPestana';

export type PestanaCobros = 'dispersiones' | 'cuenta';
const ID_TABS = 'cobros-dispersiones';

/**
 * Finanzas › Tesorería › Cobros y dispersiones (Finanzas ronda 2, A7–A10;
 * capturas 82-finanzas-r2-07…10). Una pantalla con dos pestañas; las rutas
 * `/payfac/dispersiones` y `/payfac/cuentas` abren cada una la suya.
 */
export default function CobrosDispersionesPage({ pestanaInicial = 'dispersiones' }: { pestanaInicial?: PestanaCobros }) {
  const t = useTranslations('finanzasCobrosR2');
  const { organization } = useOrganization();
  const { formatDate, getToday } = useFormatDate();
  const [pestana, setPestana] = useState<PestanaCobros>(pestanaInicial);
  const [busqueda, setBusqueda] = useState('');
  const [estado, setEstado] = useState<EstadoDispersion | null>(null);
  const [nuevaCuentaAbierta, setNuevaCuentaAbierta] = useState(false);

  const datos = useCobrosDispersiones(Boolean(organization?.id));
  const filtradas = useMemo(
    () => filtrarDispersiones(datos.dispersiones, { estado, texto: busqueda }),
    [datos.dispersiones, estado, busqueda],
  );

  const etiquetaEstado = (e: string) => (esEstadoConocido(e) ? t(`dispersiones.estados.${e}`) : e);
  const etiquetaMedio = (m: string) => (esMedioConocido(m) ? t(`dispersiones.medios.${m}`) : m);

  const exportar = () => {
    const filas = filasCsvDispersiones(
      filtradas,
      [
        t('dispersiones.columnas.referencia'),
        t('dispersiones.csv.periodoInicio'),
        t('dispersiones.csv.periodoFin'),
        t('dispersiones.columnas.recaudado'),
        t('dispersiones.columnas.comision'),
        t('dispersiones.columnas.neto'),
        t('dispersiones.csv.moneda'),
        t('dispersiones.columnas.medio'),
        t('dispersiones.columnas.estado'),
        t('dispersiones.columnas.fecha'),
      ],
      { fecha: (iso) => (iso ? formatDate(iso) : ''), medio: etiquetaMedio, estado: etiquetaEstado },
    );
    descargarCsv(`dispersiones-${getToday()}.csv`, aCsv(filas));
  };

  const recargar = () => {
    void datos.cargarDispersiones();
    void datos.cargarCuentas();
  };

  const menuCabecera: AccionFila[] = [
    { id: 'recargar', etiqueta: t('acciones.recargar'), icono: RefreshCw, onSelect: recargar },
  ];

  const acciones = (
    <div className="flex items-center gap-2">
      {pestana === 'dispersiones' ? (
        <button
          type="button"
          className={clasesBoton({ variante: 'secundario', tamano: 'md' })}
          onClick={exportar}
          disabled={datos.cargandoDispersiones || filtradas.length === 0}
          title={filtradas.length === 0 ? t('acciones.exportarSinDatos') : undefined}
        >
          <Download aria-hidden className="size-4" />
          {t('acciones.exportar')}
        </button>
      ) : (
        <button type="button" className={clasesBoton({ variante: 'primario', tamano: 'md' })} onClick={() => setNuevaCuentaAbierta(true)}>
          <Plus aria-hidden className="size-4" />
          {t('cuenta.nueva')}
        </button>
      )}
      <RowActionsMenu acciones={menuCabecera} orientacion="horizontal" tamano="md" titulo={t('titulo')} />
    </div>
  );

  const chips = estado ? [{ clave: 'estado', etiqueta: `${t('dispersiones.filtros.estado')}: ${etiquetaEstado(estado)}` }] : [];

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 lg:gap-5">
      <PageHeader
        titulo={t('titulo')}
        subtitulo={t('subtitulo')}
        icono={ListChecks}
        migas={[
          { etiqueta: t('migas.finanzas'), href: '/app/finanzas' },
          { etiqueta: t('migas.tesoreria') },
          { etiqueta: t('titulo') },
        ]}
        acciones={acciones}
      />

      {pestana === 'dispersiones' && (
        <ListToolbar
          busqueda={
            <SearchInput
              value={busqueda}
              onChange={setBusqueda}
              onValueChange={setBusqueda}
              placeholder={t('dispersiones.buscar')}
              etiqueta={t('dispersiones.buscar')}
            />
          }
          filtros={
            <FilterPanel conteo={estado ? 1 : 0} onLimpiar={() => setEstado(null)} textoVerResultados={t('dispersiones.filtros.ver', { n: filtradas.length })}>
              <FormField etiqueta={t('dispersiones.filtros.estado')}>
                {(c) => (
                  <Select value={estado ?? 'todos'} onValueChange={(v) => setEstado(v === 'todos' ? null : (v as EstadoDispersion))}>
                    <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">{t('dispersiones.filtros.todos')}</SelectItem>
                      {ESTADOS_DISPERSION.map((e) => (
                        <SelectItem key={e} value={e}>
                          {t(`dispersiones.estados.${e}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </FormField>
            </FilterPanel>
          }
          chips={chips.length > 0 ? <FilterChips chips={chips} onQuitar={() => setEstado(null)} onLimpiarTodo={() => setEstado(null)} /> : undefined}
        />
      )}

      <TabBar
        id={ID_TABS}
        etiqueta={t('pestanas.etiqueta')}
        valor={pestana}
        onValorChange={setPestana}
        pestanas={[
          { valor: 'dispersiones', etiqueta: t('pestanas.dispersiones') },
          { valor: 'cuenta', etiqueta: t('pestanas.cuenta') },
        ]}
      />

      <div role="tabpanel" id={idPanel(ID_TABS, 'dispersiones')} aria-labelledby={idPestana(ID_TABS, 'dispersiones')} hidden={pestana !== 'dispersiones'}>
        <DispersionesPestana
          resumen={datos.resumen}
          dispersiones={datos.dispersiones}
          filtradas={filtradas}
          cargando={datos.cargandoDispersiones}
          error={datos.errorDispersiones}
          onReintentar={() => void datos.cargarDispersiones()}
          hayFiltros={Boolean(estado || busqueda.trim())}
          busqueda={busqueda}
          onLimpiarFiltros={() => {
            setEstado(null);
            setBusqueda('');
          }}
          onRevisarCuenta={() => setPestana('cuenta')}
          etiquetaEstado={etiquetaEstado}
          etiquetaMedio={etiquetaMedio}
        />
      </div>

      <div role="tabpanel" id={idPanel(ID_TABS, 'cuenta')} aria-labelledby={idPestana(ID_TABS, 'cuenta')} hidden={pestana !== 'cuenta'}>
        <CuentaAbonoPestana
          cuentas={datos.cuentas}
          cargando={datos.cargandoCuentas}
          error={datos.errorCuentas}
          onRecargar={() => void datos.cargarCuentas()}
          dispersiones={datos.dispersiones}
          nuevaAbierta={nuevaCuentaAbierta}
          onNuevaAbiertaChange={setNuevaCuentaAbierta}
        />
      </div>
    </div>
  );
}
