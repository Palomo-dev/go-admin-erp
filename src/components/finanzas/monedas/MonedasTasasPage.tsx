'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowRightLeft, CalendarPlus, Coins, Download, Plus, RefreshCw } from 'lucide-react';
import { Dialogo, PageHeader, RowActionsMenu, TabBar, clasesBoton, idPanel, idPestana, type AccionFila } from '@/components/kit';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { sincronizarTasasDeCambio } from '@/lib/services/tasasCambioCliente';
import { listarMonedasOrganizacion, type MonedaOrganizacion } from '@/lib/services/monedasTasasService';
import PestanaMonedas from './CurrencyTable';
import PestanaTasas from './ExchangeRatesTable';
import { ExchangeRateHistory as PestanaHistorico } from './ExchangeRateHistory';
import DialogoAgregarMoneda from './CurrencySelector';
import { DialogoTasaManual } from './DialogoTasaManual';
import CurrencyConverter from './CurrencyConverter';
import { useSincronizarCatalogo } from './piezasTasas';
import { useFormatoTasas } from './useFormatoTasas';

type Pestana = 'monedas' | 'tasas' | 'historico';
const ID_TABS = 'monedas-tasas';

/**
 * Finanzas › Monedas y tasas (Finanzas R2, M1–M5; capturas
 * docs/design/figma/82-finanzas-r2-13..17). Tres pestañas: Monedas, Tasas e
 * Histórico. Sustituye a las cuatro de antes («Preferencias» repetía la moneda
 * base y la pestaña de tasas mencionaba un «Sincronizar Ahora» que no existía).
 *
 * Dónde quedó cada acción de la pantalla anterior:
 *   - Agregar moneda (buscador + select) → diálogo «Agregar moneda» (M3).
 *   - Establecer base, tasa automática sí/no, quitar → menú de cada moneda.
 *   - Preferencias › moneda predeterminada → «Usar como moneda base» (misma RPC).
 *   - Convertidor de monedas → «⋯ › Convertir importe».
 *   - Sincronizar tasas (solo plataforma) → «⋯ › Sincronizar catálogo» y los
 *     estados vacíos de Tasas e Histórico.
 *   - Exportar CSV del histórico → botón «Exportar» de la cabecera (M2).
 *   - Gráfico de 30 días → arriba de la tabla del Histórico (M2).
 */
export default function MonedasTasasPage() {
  const t = useTranslations('finanzasMonedasR2');
  const { organization } = useOrganization();
  const organizationId = organization?.id ?? null;
  const { code: monedaRespaldo, resuelta } = useMonedaOrganizacion();
  const { getToday } = useFormatDate();
  const hoy = getToday();

  const [pestana, setPestana] = useState<Pestana>('tasas');
  const [monedas, setMonedas] = useState<MonedaOrganizacion[]>([]);
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'error'>('cargando');
  const [version, setVersion] = useState(0);
  const [monedaHistorial, setMonedaHistorial] = useState<string | null>(null);
  const [agregarAbierto, setAgregarAbierto] = useState(false);
  const [tasaManual, setTasaManual] = useState<{ moneda: string | null; fecha: string } | null>(null);
  const [convertirAbierto, setConvertirAbierto] = useState(false);
  const [exportar, setExportar] = useState<(() => void) | null>(null);

  const cargarMonedas = useCallback(async () => {
    if (!organizationId) return;
    setEstado('cargando');
    try {
      setMonedas(await listarMonedasOrganizacion(organizationId));
      setEstado('listo');
    } catch (error) {
      console.error('Monedas y tasas: no se pudieron leer las monedas', error);
      setEstado('error');
    }
  }, [organizationId]);

  useEffect(() => {
    cargarMonedas();
  }, [cargarMonedas]);

  const base = monedas.find((m) => m.is_base)?.code ?? (resuelta ? monedaRespaldo : null);
  const formato = useFormatoTasas(base);
  const recargarTodo = useCallback(() => {
    cargarMonedas();
    setVersion((v) => v + 1);
  }, [cargarMonedas]);
  const { sincronizando, sincronizarCatalogo } = useSincronizarCatalogo(sincronizarTasasDeCambio, () => setVersion((v) => v + 1));
  // Un setter de estado trata una función como «actualizador»: se envuelve.
  const registrarExportar = useCallback((fn: (() => void) | null) => setExportar(() => fn), []);

  const verHistorial = (codigo: string) => {
    setMonedaHistorial(codigo);
    setPestana('historico');
  };
  const abrirTasaManual = (moneda: string | null, fecha = hoy) => setTasaManual({ moneda, fecha });
  const hayOtras = monedas.some((m) => !m.is_base);

  const menu: AccionFila[] = [
    { id: 'agregar', etiqueta: t('acciones.agregarMoneda'), icono: Plus, onSelect: () => setAgregarAbierto(true), oculta: pestana === 'monedas' },
    {
      id: 'tasa',
      etiqueta: t('acciones.registrarTasa'),
      icono: CalendarPlus,
      onSelect: () => abrirTasaManual(null),
      oculta: pestana === 'tasas',
      deshabilitada: !hayOtras,
      motivo: !hayOtras ? t('acciones.sinOtrasMonedas') : undefined,
    },
    { id: 'convertir', etiqueta: t('acciones.convertir'), icono: ArrowRightLeft, onSelect: () => setConvertirAbierto(true), separadorAntes: true },
    {
      id: 'sincronizar',
      etiqueta: sincronizando ? t('comun.sincronizando') : t('comun.sincronizar'),
      descripcion: t('acciones.sincronizarDescripcion'),
      icono: RefreshCw,
      onSelect: sincronizarCatalogo,
      deshabilitada: sincronizando,
      motivo: sincronizando ? t('comun.sincronizando') : undefined,
    },
  ];

  const primaria =
    pestana === 'monedas' ? (
      <button type="button" className={clasesBoton({ variante: 'primario' })} onClick={() => setAgregarAbierto(true)} disabled={!organizationId}>
        <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
        {t('acciones.agregarMoneda')}
      </button>
    ) : pestana === 'tasas' ? (
      <button
        type="button"
        className={clasesBoton({ variante: 'primario' })}
        onClick={() => abrirTasaManual(null)}
        disabled={!hayOtras}
        title={!hayOtras ? t('acciones.sinOtrasMonedas') : undefined}
      >
        {t('acciones.registrarTasa')}
      </button>
    ) : (
      <button
        type="button"
        className={clasesBoton({ variante: 'secundario' })}
        onClick={() => exportar?.()}
        disabled={!exportar}
        title={!exportar ? t('acciones.nadaQueExportar') : undefined}
      >
        <Download aria-hidden="true" className="size-4" strokeWidth={1.5} />
        {t('acciones.exportar')}
      </button>
    );

  const subtitulo = base
    ? pestana === 'tasas'
      ? t('subtituloTasas', { base })
      : t('subtitulo', { base })
    : undefined;

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 lg:gap-5">
      <PageHeader
        titulo={t('titulo')}
        icono={Coins}
        migas={[
          { etiqueta: t('migas.finanzas'), href: '/app/finanzas' },
          { etiqueta: t('migas.configuracion') },
          { etiqueta: t('titulo') },
        ]}
        subtitulo={subtitulo}
        cargando={estado === 'cargando'}
        volverA="/app/finanzas"
        acciones={
          <>
            {primaria}
            <RowActionsMenu acciones={menu} orientacion="horizontal" tamano="md" titulo={t('titulo')} />
          </>
        }
        movil={{
          subtitulo: base ? t('subtituloMovil', { base, dia: formato.dia(hoy) }) : undefined,
          accion: (
            <RowActionsMenu
              acciones={[
                ...(pestana === 'monedas'
                  ? [{ id: 'agregar-m', etiqueta: t('acciones.agregarMoneda'), icono: Plus, onSelect: () => setAgregarAbierto(true) }]
                  : []),
                ...(pestana === 'historico'
                  ? [{ id: 'exportar-m', etiqueta: t('acciones.exportar'), icono: Download, onSelect: () => exportar?.(), deshabilitada: !exportar, motivo: !exportar ? t('acciones.nadaQueExportar') : undefined }]
                  : []),
                ...menu.map((a) => (a.id === 'tasa' ? { ...a, oculta: false } : a)),
              ]}
              orientacion="horizontal"
              titulo={t('titulo')}
            />
          ),
        }}
        debajo={
          <TabBar
            id={ID_TABS}
            etiqueta={t('pestanas.etiqueta')}
            valor={pestana}
            onValorChange={setPestana}
            pestanas={[
              { valor: 'monedas', etiqueta: t('pestanas.monedas'), contador: estado === 'listo' ? monedas.length : undefined },
              { valor: 'tasas', etiqueta: t('pestanas.tasas') },
              { valor: 'historico', etiqueta: t('pestanas.historico') },
            ]}
          />
        }
      />

      {organizationId && (
        <>
          <div role="tabpanel" id={idPanel(ID_TABS, 'monedas')} aria-labelledby={idPestana(ID_TABS, 'monedas')} hidden={pestana !== 'monedas'}>
            <PestanaMonedas
              organizationId={organizationId}
              monedas={monedas}
              estado={estado}
              base={base ?? ''}
              onRecargar={recargarTodo}
              onAgregar={() => setAgregarAbierto(true)}
              onRegistrarTasa={(codigo) => abrirTasaManual(codigo)}
              onVerHistorial={verHistorial}
            />
          </div>
          <div role="tabpanel" id={idPanel(ID_TABS, 'tasas')} aria-labelledby={idPestana(ID_TABS, 'tasas')} hidden={pestana !== 'tasas'}>
            {base && pestana === 'tasas' && (
              <PestanaTasas
                organizationId={organizationId}
                base={base}
                monedas={monedas}
                hoy={hoy}
                version={version}
                onRegistrar={(codigo, fecha) => abrirTasaManual(codigo, fecha)}
                onVerHistorial={verHistorial}
                onAgregarMoneda={() => setAgregarAbierto(true)}
              />
            )}
          </div>
          <div role="tabpanel" id={idPanel(ID_TABS, 'historico')} aria-labelledby={idPestana(ID_TABS, 'historico')} hidden={pestana !== 'historico'}>
            {base && pestana === 'historico' && (
              <PestanaHistorico
                organizationId={organizationId}
                base={base}
                monedas={monedas}
                hoy={hoy}
                version={version}
                monedaPedida={monedaHistorial}
                onExportable={registrarExportar}
              />
            )}
          </div>

          {base && (
            <DialogoAgregarMoneda
              abierto={agregarAbierto}
              onAbiertoChange={setAgregarAbierto}
              organizationId={organizationId}
              base={base}
              onAgregada={() => recargarTodo()}
            />
          )}
          {base && tasaManual && (
            <DialogoTasaManual
              abierto={!!tasaManual}
              onAbiertoChange={(v) => !v && setTasaManual(null)}
              organizationId={organizationId}
              base={base}
              monedas={monedas}
              monedaInicial={tasaManual.moneda}
              fechaInicial={tasaManual.fecha}
              hoy={hoy}
              onRegistrada={() => setVersion((v) => v + 1)}
            />
          )}
        </>
      )}

      <Dialogo
        abierto={convertirAbierto}
        onAbiertoChange={setConvertirAbierto}
        titulo={t('convertir.titulo')}
        descripcion={t('convertir.descripcion')}
        ancho={672}
        textoCancelar={t('convertir.cerrar')}
        primario={{ etiqueta: t('convertir.listo'), onClick: () => setConvertirAbierto(false) }}
      >
        {convertirAbierto && <CurrencyConverter />}
      </Dialogo>
    </div>
  );
}
