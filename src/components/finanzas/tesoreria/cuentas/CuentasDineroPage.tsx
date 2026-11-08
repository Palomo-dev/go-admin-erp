'use client';

/**
 * Cuentas de dinero (Tesorería v2, `1007:83724` listo · `1007:84611` cierre
 * ciego · `1007:85454` vacío · `1007:86159` móvil): cajas abiertas del POS +
 * cuentas bancarias, con las pestañas Cuentas · Posición · Alertas.
 *
 * Sustituye a `/finanzas/bancos` (redirige aquí con su pestaña), a la
 * «Tesorería consolidada» (`/bancos/tesoreria` → `?tab=posicion`) y a la página
 * de nueva cuenta (`/bancos/cuentas/nuevo` → `?nueva=1`). La pestaña Alertas es
 * la de la ronda 2 (`AlertasPanel`), sin cambios.
 *
 * Acciones de la pantalla vieja que se conservan: ver cuenta y sus movimientos,
 * nueva cuenta, actualizar (también las alertas), ir a conciliación. Activar /
 * desactivar pasa al detalle de la cuenta (pestaña Datos). «Exportar» (sin
 * `onClick` en la vieja) ahora exporta los saldos.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Download, Landmark, Plus, RefreshCw, ShieldAlert, TrendingUp, Wallet } from 'lucide-react';
import {
  AvisoTonal,
  BranchBadgeActiva,
  EmptyState,
  KpiStrip,
  PageHeader,
  RowActionsMenu,
  SearchInput,
  Skeleton,
  StatCard,
  TabBar,
  clasesBoton,
  idPanel,
  idPestana,
  useOpcionUrl,
  useParametrosUrl,
} from '@/components/kit';
import { AlertasPanel } from '@/components/finanzas/bancos/alertas/AlertasPanel';
import { useAlertasBancarias } from '@/components/finanzas/bancos/alertas/useAlertasBancarias';
import { BancosService, type BankAccount } from '@/components/finanzas/bancos/BancosService';
import { useBranch } from '@/lib/context/BranchContext';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { formatMoneda } from '@/lib/utils/moneda';
import {
  cajaVencida,
  filtrarCuentas,
  horasAbierta,
  mascaraCuenta,
  resumirCuentasDinero,
  type CajaDinero,
} from '@/lib/finanzas/tesoreria/cuentasDinero';
import { PESTANAS_CUENTAS, RUTA_NUEVA_CONCILIACION, RUTAS_TESORERIA, rutaCuentaBancaria, type PestanaCuentas } from '@/lib/finanzas/tesoreria/rutas';
import { ConsignarCajaDialogo, CuentaDineroCard, descargarCsv, useCajasDinero } from '../compartido';
import { CuentaBancariaPanel } from './CuentaBancariaPanel';
import { PosicionTesoreria } from './PosicionTesoreria';

const ID = 'cuentas-dinero';

function celda(v: string | number): string {
  const s = String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function CuentasDineroPage() {
  const t = useTranslations('finanzasTesoreriaR3.cuentas');
  const tc = useTranslations('finanzasTesoreriaR3.comun');
  const tb = useTranslations('finanzasTesoreriaR3.cuentaBancaria.form.tipos');
  const router = useRouter();
  const { branchFilter } = useBranch();
  const { code: monedaBase, formatear, paraDocumento } = useMonedaOrganizacion();
  const { formatDateTime, getToday } = useFormatDate();
  const alertas = useAlertasBancarias();
  const { cajas, modo, estado: estadoCajas, recargar: recargarCajas } = useCajasDinero();
  const [pestana, setPestana] = useOpcionUrl<PestanaCuentas>('tab', PESTANAS_CUENTAS, 'cuentas');
  const { leer, fijar } = useParametrosUrl();
  const panelNueva = leer('nueva') === '1';
  const [bancos, setBancos] = useState<BankAccount[]>([]);
  const [porConciliar, setPorConciliar] = useState(0);
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'error'>('cargando');
  const [termino, setTermino] = useState('');
  const [consignar, setConsignar] = useState<number | null | false>(false);
  const [ahora, setAhora] = useState(() => Date.now());

  const cargar = useCallback(async () => {
    setEstado('cargando');
    try {
      const [b, s] = await Promise.all([
        BancosService.obtenerCuentasBancarias(branchFilter),
        BancosService.obtenerEstadisticas(branchFilter).catch(() => null),
      ]);
      setBancos(b);
      setPorConciliar(s?.pending_reconciliations ?? 0);
      setEstado('listo');
      setAhora(Date.now());
    } catch {
      setEstado('error');
    }
  }, [branchFilter]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const actualizar = async () => {
    await Promise.all([cargar(), recargarCajas(), alertas.recargar()]);
    toast.success(tc('actualizado'));
  };

  // Las cajas no se filtran por la sucursal del encabezado en el servidor: se filtran aquí.
  const cajasSucursal = useMemo(
    () => (branchFilter == null ? cajas : cajas.filter((c) => c.sucursal === null || c.sucursal.id === branchFilter)),
    [cajas, branchFilter],
  );
  const resumen = useMemo(() => resumirCuentasDinero(bancos, cajasSucursal, monedaBase, ahora), [bancos, cajasSucursal, monedaBase, ahora]);
  const visibles = useMemo(() => filtrarCuentas(cajasSucursal, bancos, termino), [cajasSucursal, bancos, termino]);
  const cargando = estado === 'cargando' || estadoCajas === 'cargando';
  const vacio = estado === 'listo' && estadoCajas !== 'cargando' && bancos.length === 0 && cajasSucursal.length === 0;

  const exportar = () => {
    const lineas = [[t('csv.tipo'), t('csv.nombre'), t('csv.detalle'), t('csv.moneda'), t('csv.saldo')].map(celda).join(',')];
    for (const c of cajasSucursal) {
      lineas.push([tc('caja'), c.sucursal?.nombre ?? t('cajaGlobal'), c.responsable.nombre ?? '', monedaBase, c.saldo ?? t('oculto')].map(celda).join(','));
    }
    for (const b of bancos) {
      lineas.push([tc('banco'), b.name, `${b.bank_name ?? ''} ${mascaraCuenta(b.account_number)}`.trim(), b.currency ?? monedaBase, b.balance].map(celda).join(','));
    }
    descargarCsv(`cuentas_de_dinero_${getToday()}.csv`, lineas.join('\n'));
  };

  const tarjetaCaja = (c: CajaDinero) => {
    const vencida = cajaVencida(c.abierta_desde, ahora);
    const nombre = c.sucursal?.nombre ? t('caja.nombre', { sucursal: c.sucursal.nombre }) : t('cajaGlobal');
    return (
      <CuentaDineroCard
        key={c.sesion_id}
        tipo="caja"
        nombre={nombre}
        detalle={t('caja.detalle', { responsable: c.responsable.nombre ?? '—', desde: formatDateTime(c.abierta_desde) })}
        etiquetaSaldo={t('caja.esperado')}
        saldo={c.saldo === null ? t('oculto') : formatear(c.saldo)}
        pie={c.saldo === null ? t('caja.ocultoAyuda') : t('caja.turno', { id: c.sesion_id })}
        estado={vencida ? { etiqueta: t('caja.vencida', { horas: horasAbierta(c.abierta_desde, ahora) }), tono: 'advertencia' } : { etiqueta: t('caja.abierta'), tono: 'exito' }}
        href={c.href}
        acciones={[
          { etiqueta: t('caja.verTurno'), href: c.href },
          vencida ? { etiqueta: t('caja.cerrarArqueo'), href: c.href } : { etiqueta: t('caja.consignar'), onClick: () => setConsignar(c.sesion_id) },
        ]}
      />
    );
  };

  const tarjetaBanco = (b: BankAccount) => {
    const ctxMoneda = paraDocumento(b.currency);
    const moneda = { formatear: (v: number) => formatMoneda(v, ctxMoneda) };
    const tipo = b.account_type && tb.has(b.account_type) ? tb(b.account_type) : b.account_type ?? '';
    const sinPuc = !b.account_code;
    return (
      <CuentaDineroCard
        key={b.id}
        tipo="banco"
        nombre={b.name}
        detalle={[tipo, mascaraCuenta(b.account_number), b.currency ?? monedaBase].filter(Boolean).join(' · ')}
        etiquetaSaldo={t('banco.saldoLibros')}
        saldo={moneda.formatear(Number(b.balance))}
        pie={!b.is_active ? t('banco.inactivaPie') : sinPuc ? t('banco.sinCuentaContable') : t('banco.cuentaContable', { codigo: b.account_code ?? '' })}
        tonoPie={b.is_active && sinPuc ? 'advertencia' : 'neutro'}
        estado={b.is_active ? { etiqueta: t('banco.activa'), tono: 'exito' } : { etiqueta: t('banco.inactiva'), tono: 'neutro' }}
        href={rutaCuentaBancaria(b.id)}
        acciones={
          b.is_active
            ? [
                { etiqueta: t('banco.verMovimientos'), href: rutaCuentaBancaria(b.id) },
                sinPuc
                  ? { etiqueta: t('banco.asignarCuenta'), href: `${rutaCuentaBancaria(b.id)}?tab=datos` }
                  : { etiqueta: t('banco.conciliar'), href: `${RUTA_NUEVA_CONCILIACION}?cuenta=${b.id}` },
              ]
            : [{ etiqueta: t('banco.verCuenta'), href: rutaCuentaBancaria(b.id) }]
        }
      />
    );
  };

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        titulo={t('titulo')}
        subtitulo={
          estado === 'listo'
            ? t('subtitulo', { cajas: resumen.cajasAbiertas, bancos: resumen.bancos, modo: t(`modo.${modo}`) })
            : t('subtituloCorto')
        }
        icono={Wallet}
        migas={[{ etiqueta: tc('migas.finanzas'), href: '/app/finanzas' }, { etiqueta: tc('migas.tesoreria'), href: RUTAS_TESORERIA.movimientos }, { etiqueta: t('titulo') }]}
        movil={{ accionesEnFila: true }}
        acciones={
          <>
            <button type="button" onClick={exportar} disabled={cargando || vacio} className={clasesBoton({ variante: 'secundario' })}>
              <Download className="h-4 w-4" aria-hidden />
              {t('exportar')}
            </button>
            <button type="button" onClick={() => fijar({ nueva: '1' })} className={clasesBoton({ variante: 'primario' })}>
              <Plus className="h-4 w-4" aria-hidden />
              {t('nuevaCuenta')}
            </button>
            <RowActionsMenu
              acciones={[
                { id: 'actualizar', etiqueta: tc('actualizar'), icono: RefreshCw, onSelect: () => void actualizar() },
                { id: 'conciliacion', etiqueta: t('irConciliacion'), icono: TrendingUp, onSelect: () => router.push(RUTAS_TESORERIA.conciliacion) },
              ]}
              titulo={t('titulo')}
              orientacion="horizontal"
              tamano="md"
            />
          </>
        }
        debajo={
          <div className="space-y-3">
            <BranchBadgeActiva />
            <TabBar
              id={ID}
              etiqueta={t('pestanas.etiqueta')}
              valor={pestana}
              onValorChange={setPestana}
              pestanas={[
                { valor: 'cuentas', etiqueta: t('pestanas.cuentas'), icono: Landmark, contador: estado === 'listo' ? bancos.length + cajasSucursal.length : undefined },
                { valor: 'posicion', etiqueta: t('pestanas.posicion'), icono: TrendingUp },
                { valor: 'alertas', etiqueta: t('pestanas.alertas'), icono: ShieldAlert, contador: alertas.estado === 'listo' ? alertas.cifras.abiertas : undefined },
              ]}
            />
          </div>
        }
      />

      <div role="tabpanel" id={idPanel(ID, 'cuentas')} aria-labelledby={idPestana(ID, 'cuentas')} hidden={pestana !== 'cuentas'} className="space-y-6">
        {estado === 'error' ? (
          <EmptyState variante="error" titulo={t('error.titulo')} descripcion={t('error.descripcion')} onReintentar={() => void cargar()} />
        ) : vacio ? (
          <EmptyState
            icono={Wallet}
            titulo={t('vacio.titulo')}
            descripcion={t('vacio.descripcion')}
            accion={{ etiqueta: t('nuevaCuenta'), onClick: () => fijar({ nueva: '1' }), icono: Plus }}
            accionSecundaria={{ etiqueta: t('vacio.abrirCaja'), href: '/app/pos/cajas' }}
          />
        ) : (
          <>
            <KpiStrip etiqueta={t('kpi.etiqueta')}>
              <StatCard
                etiqueta={t('kpi.disponible')}
                valor={formatear(resumen.disponible)}
                detalle={resumen.cajasOcultas > 0 ? t('kpi.disponibleSinCajas') : t('kpi.disponibleAyuda', { moneda: monedaBase })}
                cargando={cargando}
              />
              <StatCard
                etiqueta={t('kpi.bancos')}
                valor={formatear(resumen.enBancos)}
                detalle={
                  resumen.sinCuentaContable > 0
                    ? t('kpi.bancosSinPuc', { n: resumen.bancosActivos, sin: resumen.sinCuentaContable })
                    : t('kpi.bancosAyuda', { n: resumen.bancosActivos })
                }
                tono={resumen.sinCuentaContable > 0 ? 'advertencia' : 'neutro'}
                cargando={cargando}
              />
              <StatCard
                etiqueta={t('kpi.cajas')}
                valor={resumen.enCajas === null ? t('oculto') : formatear(resumen.enCajas)}
                detalle={
                  resumen.cajasVencidas > 0
                    ? t('kpi.cajasVencidas', { n: resumen.cajasAbiertas, vencidas: resumen.cajasVencidas })
                    : t('kpi.cajasAyuda', { n: resumen.cajasAbiertas })
                }
                tono={resumen.cajasVencidas > 0 ? 'advertencia' : 'neutro'}
                cargando={cargando}
              />
              <StatCard
                etiqueta={t('kpi.porConciliar')}
                valor={porConciliar}
                detalle={t('kpi.porConciliarAyuda')}
                href={RUTAS_TESORERIA.conciliacion}
                cargando={cargando}
              />
            </KpiStrip>

            {resumen.bancosOtraMoneda > 0 && <AvisoTonal tono="informacion" titulo={t('otraMoneda', { n: resumen.bancosOtraMoneda })} compacto />}

            <SearchInput value={termino} onChange={setTermino} placeholder={t('buscar')} etiqueta={t('buscar')} />

            <section aria-labelledby="titulo-cajas" className="space-y-3">
              <h2 id="titulo-cajas" className="flex flex-wrap items-baseline gap-2 text-base font-semibold text-fg">
                {t('cajas.titulo')}
                <span className="text-sm font-normal text-fg-secondary">{t(`cajas.ayuda.${modo}`)}</span>
              </h2>
              {estadoCajas === 'cargando' ? (
                <Skeleton className="h-40 w-full" />
              ) : estadoCajas === 'error' ? (
                <AvisoTonal tono="peligro" titulo={t('cajas.error')} accion={{ etiqueta: tc('reintentar'), onClick: () => void recargarCajas() }} />
              ) : estadoCajas === 'sinPermiso' ? (
                <AvisoTonal tono="informacion" titulo={tc('sinPermiso.titulo')} descripcion={tc('sinPermiso.descripcion')} />
              ) : visibles.cajas.length === 0 ? (
                <p className="text-sm text-fg-secondary">{termino ? t('sinResultados') : t('cajas.vacio')}</p>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{visibles.cajas.map(tarjetaCaja)}</div>
              )}
            </section>

            <section aria-labelledby="titulo-bancos" className="space-y-3">
              <h2 id="titulo-bancos" className="flex flex-wrap items-baseline gap-2 text-base font-semibold text-fg">
                {t('bancos.titulo')}
                <span className="text-sm font-normal text-fg-secondary">{t('bancos.ayuda')}</span>
              </h2>
              {estado === 'cargando' ? (
                <Skeleton className="h-40 w-full" />
              ) : visibles.bancos.length === 0 ? (
                <p className="text-sm text-fg-secondary">{termino ? t('sinResultados') : t('bancos.vacio')}</p>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{visibles.bancos.map(tarjetaBanco)}</div>
              )}
            </section>
          </>
        )}
      </div>

      <div role="tabpanel" id={idPanel(ID, 'posicion')} aria-labelledby={idPestana(ID, 'posicion')} hidden={pestana !== 'posicion'}>
        <PosicionTesoreria activa={pestana === 'posicion'} />
      </div>

      <div role="tabpanel" id={idPanel(ID, 'alertas')} aria-labelledby={idPestana(ID, 'alertas')} hidden={pestana !== 'alertas'}>
        <AlertasPanel alertas={alertas} onMovimientoAnulado={() => void cargar()} />
      </div>

      <CuentaBancariaPanel
        abierto={panelNueva}
        onAbiertoChange={(a) => !a && fijar({ nueva: null })}
        onGuardada={(id) => {
          fijar({ nueva: null });
          void cargar();
          router.push(rutaCuentaBancaria(id));
        }}
      />
      <ConsignarCajaDialogo
        abierto={consignar !== false}
        sesionInicial={consignar || null}
        onAbiertoChange={(a) => !a && setConsignar(false)}
        onHecha={() => {
          setConsignar(false);
          void cargar();
          void recargarCajas();
        }}
      />
    </div>
  );
}
