'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowRightLeft, Eye, Landmark, Link2, Loader2, RefreshCw, ShieldAlert, ShieldCheck, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import {
  AvisoTonal,
  DataTable,
  DialogoMotivo,
  KpiStrip,
  PageHeader,
  RowActionsMenu,
  StatCard,
  StatusBadge,
  TabBar,
  clasesBoton,
  idPanel,
  idPestana,
  useOpcionUrl,
  type AccionFila,
  type ColumnaTabla,
} from '@/components/kit';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { crearFormateadorMoneda } from '@/lib/utils/moneda';
import {
  diasParaVencer,
  estadoAutorizacion,
  puedeRenovar,
  puedeRevocar,
  type EstadoAutorizacion,
  type EstadoCuentaConectada,
  type FilaCuentaConectada,
} from '@/lib/services/integrations/openFinance/conexionBancariaLogica';
import { useConexionBancaria, type AutorizacionFila } from './useConexionBancaria';

/**
 * Conectar banco (Figma 82-finanzas-r2-03…06). Reemplaza el tablero de
 * /finanzas/open-finance y la página suelta /open-finance/consents.
 *
 * Lo que hacían y dónde quedó:
 * - Estado del servicio (proveedor, links, última sincronización) → subtítulo y cifras.
 * - Variables de entorno → fuera: van a la consola de la plataforma, no al cliente.
 * - «Sincronizar ahora» + «Refrescar saldos» → un solo «Sincronizar ahora».
 * - Transacciones pendientes de importar → cifra «Por llevar a GO Admin» (enlace a conciliación).
 * - Módulos (consentimientos, tesorería, anomalías) → pestaña «Autorizaciones» y menú «⋯».
 * - Consentimientos: listar, renovar (≤ 7 días), revocar con motivo → pestaña «Autorizaciones».
 * - Filtros por estado y tipo y 4 cifras de consentimientos → no siguen: la tabla
 *   muestra el estado de cada autorización (pocas filas por organización).
 */

const ID_PESTANAS = 'conectar-banco';
const PESTANAS = ['bancos', 'autorizaciones'] as const;
type Pestana = (typeof PESTANAS)[number];

const RUTA_TESORERIA = '/app/finanzas/bancos/tesoreria';
const RUTA_ALERTAS = '/app/finanzas/bancos?tab=alertas';
const RUTA_CONCILIACION = '/app/finanzas/conciliacion-bancaria';

const TONO_CUENTA: Record<EstadoCuentaConectada, 'exito' | 'advertencia' | 'peligro'> = {
  activa: 'exito',
  sinVincular: 'advertencia',
  fallo: 'peligro',
};

const TONO_AUTORIZACION: Record<EstadoAutorizacion, 'exito' | 'advertencia' | 'neutro' | 'peligro'> = {
  activa: 'exito',
  porVencer: 'advertencia',
  revocada: 'neutro',
  vencida: 'peligro',
};

export function ConectarBancoPage() {
  const t = useTranslations('finanzasBancosR2');
  const router = useRouter();
  const { formatDate, formatDateTime } = useFormatDate();
  const moneda = useMonedaOrganizacion();
  const datos = useConexionBancaria();
  const [pestana, setPestana] = useOpcionUrl<Pestana>('tab', PESTANAS, 'bancos');
  const [sincronizando, setSincronizando] = useState(false);
  const [renovando, setRenovando] = useState<string | null>(null);
  const [aRevocar, setARevocar] = useState<AutorizacionFila | null>(null);
  const [revocando, setRevocando] = useState(false);
  const [errorRevocar, setErrorRevocar] = useState<string | null>(null);

  // «Por vencer» y «Renovar» se calculan contra el reloj de cada render.
  const ahora = new Date();
  const vigentes = datos.autorizaciones.filter((a) => puedeRevocar(a, ahora)).length;
  const conectado = datos.cifras.bancosConectados > 0;
  const cargando = datos.estado === 'cargando';

  const textoError = (codigo: string) =>
    t.has(`conectar.errores.${codigo}`) ? t(`conectar.errores.${codigo}`) : t('conectar.errores.desconocido');

  const sincronizar = async () => {
    setSincronizando(true);
    const r = await datos.sincronizar();
    setSincronizando(false);
    if (r.movimientos && r.saldos) toast.success(t('conectar.sincronizado'));
    else if (r.movimientos || r.saldos) toast.warning(r.movimientos ? t('conectar.sinSaldos') : t('conectar.sinMovimientos'));
    else toast.error(t('conectar.errorSincronizar'));
  };

  const renovar = async (a: AutorizacionFila) => {
    setRenovando(a.id);
    const r = await datos.renovar(a.id);
    setRenovando(null);
    if (r.ok) toast.success(t('autorizaciones.renovada'));
    else toast.error(textoError(r.codigo));
  };

  const confirmarRevocar = async (motivo: string) => {
    if (!aRevocar) return;
    setRevocando(true);
    setErrorRevocar(null);
    const r = await datos.revocar(aRevocar.id, motivo);
    setRevocando(false);
    if (r.ok) {
      toast.success(t('revocar.revocada'));
      setARevocar(null);
    } else {
      setErrorRevocar(textoError(r.codigo));
    }
  };

  const banco = (a: AutorizacionFila) => (a.link?.institution_name ?? '').trim() || t('autorizaciones.sinBanco');
  const paraQue = (a: AutorizacionFila) =>
    t.has(`autorizaciones.tipos.${a.consent_type}`) ? t(`autorizaciones.tipos.${a.consent_type}`) : a.purpose ?? '—';

  // ---------------------------------------------------------------------------
  // Cabecera
  // ---------------------------------------------------------------------------

  const menuCabecera: AccionFila[] = [
    { id: 'tesoreria', etiqueta: t('conectar.menu.tesoreria'), icono: Wallet, onSelect: () => router.push(RUTA_TESORERIA) },
    { id: 'alertas', etiqueta: t('conectar.menu.alertas'), icono: ShieldAlert, onSelect: () => router.push(RUTA_ALERTAS) },
    { id: 'conciliacion', etiqueta: t('conectar.menu.conciliacion'), icono: ArrowRightLeft, onSelect: () => router.push(RUTA_CONCILIACION) },
  ];

  // No hay flujo para conectar un banco desde la app (el inicio de sesión con
  // el banco está deshabilitado hasta el rediseño de la sesión bancaria): el
  // botón se ve, explica por qué no está disponible y no inventa un flujo.
  const botonConectar = (variante: 'primario' | 'secundario', etiqueta: string) => (
    <button type="button" disabled title={t('conectar.conectarNoDisponible')} className={clasesBoton({ variante })}>
      <Link2 aria-hidden="true" className="size-4" strokeWidth={1.5} />
      {etiqueta}
      <span className="sr-only">{t('conectar.conectarNoDisponible')}</span>
    </button>
  );

  const subtitulo = cargando
    ? undefined
    : conectado
      ? datos.ultimaSincronizacion
        ? t('conectar.subtituloConectado', { n: datos.cifras.bancosConectados, fecha: formatDateTime(datos.ultimaSincronizacion) })
        : t('conectar.subtituloSinSincronizar', { n: datos.cifras.bancosConectados })
      : t('conectar.subtitulo');

  const acciones = (
    <div className="flex items-center gap-2">
      {conectado && pestana === 'bancos' && (
        <button type="button" onClick={() => void sincronizar()} disabled={sincronizando} aria-busy={sincronizando || undefined} className={clasesBoton({ variante: 'secundario' })}>
          {sincronizando ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <RefreshCw aria-hidden="true" className="size-4" strokeWidth={1.5} />}
          {t('conectar.sincronizar')}
        </button>
      )}
      {conectado && botonConectar('primario', t('conectar.conectarOtro'))}
      <RowActionsMenu acciones={menuCabecera} orientacion="horizontal" tamano="md" titulo={t('conectar.titulo')} />
    </div>
  );

  // ---------------------------------------------------------------------------
  // Pestaña Bancos
  // ---------------------------------------------------------------------------

  const columnasBancos: ColumnaTabla<FilaCuentaConectada>[] = [
    { id: 'banco', encabezado: t('conectar.tabla.banco'), celda: (f) => <span className="font-medium text-fg">{f.banco}</span> },
    {
      id: 'cuentaBanco',
      encabezado: t('conectar.tabla.cuentaBanco'),
      celda: (f) => [f.tipoCuenta ? (t.has(`conectar.tiposCuenta.${f.tipoCuenta}`) ? t(`conectar.tiposCuenta.${f.tipoCuenta}`) : f.tipoCuenta) : null, f.numeroCorto].filter(Boolean).join(' ') || '—',
    },
    {
      id: 'cuentaGo',
      encabezado: t('conectar.tabla.cuentaGo'),
      ocultarDebajo: 'md',
      celda: (f) =>
        f.cuentaGo
          ? [f.cuentaGo.nombre, f.cuentaGo.codigo].filter(Boolean).join(' · ')
          : <span className="text-fg-secondary">{t('conectar.tabla.sinVincular')}</span>,
    },
    {
      id: 'saldo',
      encabezado: t('conectar.tabla.saldo'),
      variante: 'importe',
      celda: (f) => (f.saldo === null ? '—' : (f.moneda ? crearFormateadorMoneda(f.moneda) : moneda.formatear)(f.saldo)),
    },
    {
      id: 'sincronizacion',
      encabezado: t('conectar.tabla.sincronizacion'),
      ocultarDebajo: 'lg',
      celda: (f) => (f.ultimaSincronizacion ? formatDateTime(f.ultimaSincronizacion) : t('conectar.tabla.nunca')),
    },
    {
      id: 'estado',
      encabezado: t('conectar.tabla.estado'),
      celda: (f) => <StatusBadge estado={f.estado} tono={TONO_CUENTA[f.estado]} tamano="sm" etiqueta={t(`conectar.estados.${f.estado}`)} />,
    },
  ];

  const accionesCuenta = (f: FilaCuentaConectada): AccionFila[] => [
    {
      id: 'verCuenta',
      etiqueta: t('conectar.fila.verCuenta'),
      icono: Eye,
      onSelect: () => router.push(`/app/finanzas/bancos/cuentas/${f.cuentaGoId}`),
      oculta: f.cuentaGoId === null,
    },
    {
      id: 'autorizaciones',
      etiqueta: t('conectar.fila.autorizaciones'),
      icono: ShieldCheck,
      onSelect: () => setPestana('autorizaciones'),
    },
  ];

  const sinVincular = datos.filas.filter((f) => f.estado === 'sinVincular').length;

  const panelBancos = conectado ? (
    <div className="flex flex-col gap-4">
      <KpiStrip columnas={4} etiqueta={t('conectar.cifras.etiqueta')}>
        <StatCard etiqueta={t('conectar.cifras.bancos')} valor={datos.cifras.bancosConectados} tamano="sm" />
        <StatCard etiqueta={t('conectar.cifras.cuentas')} valor={datos.cifras.cuentasVinculadas} tamano="sm" />
        <StatCard etiqueta={t('conectar.cifras.movimientos')} valor={datos.movimientos30 ?? '—'} tamano="sm" />
        <StatCard
          etiqueta={t('conectar.cifras.porLlevar')}
          valor={datos.salud?.pendingTransactions ?? 0}
          detalle={(datos.salud?.pendingTransactions ?? 0) > 0 ? t('conectar.cifras.porLlevarDetalle') : undefined}
          tono={(datos.salud?.pendingTransactions ?? 0) > 0 ? 'advertencia' : 'neutro'}
          href={(datos.salud?.pendingTransactions ?? 0) > 0 ? RUTA_CONCILIACION : undefined}
          tamano="sm"
        />
      </KpiStrip>

      <DataTable
        etiqueta={t('conectar.tabla.etiqueta')}
        columnas={columnasBancos}
        filas={datos.filas}
        obtenerId={(f) => f.id}
        estado={datos.estado === 'error' ? 'error' : 'listo'}
        acciones={accionesCuenta}
        etiquetaFila={(f) => `${f.banco} ${f.numeroCorto ?? ''}`.trim()}
        onReintentar={() => void datos.recargar()}
        vacio={{ titulo: t('conectar.tabla.vacioTitulo'), descripcion: t('conectar.tabla.vacioDescripcion'), icono: Landmark }}
        tarjetaMovil={(f) => (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-fg">
                {f.banco} {f.numeroCorto}
              </span>
              <StatusBadge estado={f.estado} tono={TONO_CUENTA[f.estado]} tamano="sm" etiqueta={t(`conectar.estados.${f.estado}`)} />
            </div>
            <span className="text-sm text-fg-secondary">
              {f.cuentaGo ? [f.cuentaGo.nombre, f.cuentaGo.codigo].filter(Boolean).join(' · ') : t('conectar.tabla.sinVincular')}
            </span>
            <span className="tabular-nums text-fg">
              {f.saldo === null ? '—' : (f.moneda ? crearFormateadorMoneda(f.moneda) : moneda.formatear)(f.saldo)}
            </span>
          </div>
        )}
      />

      {sinVincular > 0 && (
        <AvisoTonal tono="advertencia" compacto titulo={t('conectar.sinVincularAviso.titulo', { n: sinVincular })} descripcion={t('conectar.sinVincularAviso.descripcion')} />
      )}

      {datos.conFallo.map((nombre) => (
        <AvisoTonal
          key={nombre}
          tono="peligro"
          rol="alert"
          titulo={t('conectar.fallo.titulo', { banco: nombre })}
          descripcion={t('conectar.fallo.descripcion')}
          accion={{ etiqueta: t('conectar.fallo.verAutorizaciones'), onClick: () => setPestana('autorizaciones') }}
        />
      ))}
    </div>
  ) : (
    <div className="flex flex-col gap-4">
      <AvisoTonal
        tono="informacion"
        titulo={t('conectar.servicio.titulo')}
        descripcion={
          <>
            {t('conectar.servicio.descripcion')}
            <span className="mt-1 block text-fg-secondary">
              {t('conectar.conectarNoDisponible')}
            </span>
          </>
        }
      />
      <div className="flex justify-start">{botonConectar('secundario', t('conectar.conectar'))}</div>
      {datos.salud && !datos.salud.isConfigured && (
        <AvisoTonal tono="neutro" compacto titulo={t('conectar.noActivo.titulo')} descripcion={t('conectar.noActivo.descripcion')} />
      )}
      <div className="overflow-hidden rounded-xl border border-line bg-surface">
        <table className="w-full text-sm" aria-label={t('conectar.beneficios.etiqueta')}>
          <thead className="bg-subtle text-left text-[13px] text-fg-secondary">
            <tr>
              <th scope="col" className="px-3 py-2.5 font-medium">{t('conectar.beneficios.queObtienes')}</th>
              <th scope="col" className="px-3 py-2.5 font-medium">{t('conectar.beneficios.comoSeUsa')}</th>
            </tr>
          </thead>
          <tbody>
            {(['movimientos', 'saldo', 'duplicados'] as const).map((k) => (
              <tr key={k} className="border-t border-line">
                <td className="px-3 py-3 font-medium text-fg">{t(`conectar.beneficios.${k}.titulo`)}</td>
                <td className="px-3 py-3 text-fg-secondary">{t(`conectar.beneficios.${k}.descripcion`)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  // ---------------------------------------------------------------------------
  // Pestaña Autorizaciones
  // ---------------------------------------------------------------------------

  const columnasAut: ColumnaTabla<AutorizacionFila>[] = [
    { id: 'banco', encabezado: t('autorizaciones.tabla.banco'), celda: (a) => <span className="font-medium text-fg">{banco(a)}</span> },
    { id: 'paraQue', encabezado: t('autorizaciones.tabla.paraQue'), ocultarDebajo: 'md', celda: (a) => <span title={a.purpose ?? undefined}>{paraQue(a)}</span> },
    {
      id: 'autorizada',
      encabezado: t('autorizaciones.tabla.autorizada'),
      ocultarDebajo: 'lg',
      celda: (a) => [a.granted_at ? formatDate(a.granted_at) : null, a.granted_by_name].filter(Boolean).join(' · ') || '—',
    },
    {
      id: 'vence',
      encabezado: t('autorizaciones.tabla.vence'),
      celda: (a) => {
        if (!a.expires_at) return '—';
        const estado = estadoAutorizacion(a, ahora);
        const dias = diasParaVencer(a.expires_at, ahora);
        return estado === 'porVencer' && dias !== null
          ? t('autorizaciones.tabla.venceEn', { fecha: formatDate(a.expires_at), dias })
          : formatDate(a.expires_at);
      },
    },
    {
      id: 'estado',
      encabezado: t('autorizaciones.tabla.estado'),
      celda: (a) => {
        const e = estadoAutorizacion(a, ahora);
        return <StatusBadge estado={e} tono={TONO_AUTORIZACION[e]} tamano="sm" etiqueta={t(`autorizaciones.estados.${e}`)} />;
      },
    },
    {
      id: 'acciones',
      encabezado: '',
      alinear: 'derecha',
      celda: (a) => {
        if (a.status === 'revoked') {
          return a.revoked_reason ? (
            <span className="text-sm text-fg-secondary">{t('autorizaciones.tabla.motivo', { motivo: a.revoked_reason })}</span>
          ) : null;
        }
        return (
          <span className="inline-flex items-center gap-1 text-sm">
            {puedeRenovar(a, ahora) && (
              <>
                <button
                  type="button"
                  onClick={() => void renovar(a)}
                  disabled={renovando === a.id}
                  className="rounded font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50"
                >
                  {renovando === a.id ? t('autorizaciones.renovando') : t('autorizaciones.renovar')}
                </button>
                <span aria-hidden="true" className="text-fg-muted">·</span>
              </>
            )}
            {puedeRevocar(a, ahora) && (
              <button
                type="button"
                onClick={() => {
                  setErrorRevocar(null);
                  setARevocar(a);
                }}
                className="rounded font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                {t('autorizaciones.revocar')}
              </button>
            )}
          </span>
        );
      },
    },
  ];

  const panelAutorizaciones = (
    <div className="flex flex-col gap-4">
      <AvisoTonal tono="informacion" titulo={t('autorizaciones.aviso.titulo')} descripcion={t('autorizaciones.aviso.descripcion')} />
      <DataTable
        etiqueta={t('autorizaciones.tabla.etiqueta')}
        columnas={columnasAut}
        filas={datos.autorizaciones}
        obtenerId={(a) => a.id}
        estado={datos.estadoAutorizaciones === 'cargando' ? 'cargando' : datos.estadoAutorizaciones === 'error' ? 'error' : 'listo'}
        onReintentar={() => void datos.recargar()}
        vacio={{ titulo: t('autorizaciones.tabla.vacioTitulo'), descripcion: t('autorizaciones.tabla.vacioDescripcion'), icono: ShieldCheck }}
        tarjetaMovil={(a) => {
          const e = estadoAutorizacion(a, ahora);
          return (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-fg">{banco(a)}</span>
                <StatusBadge estado={e} tono={TONO_AUTORIZACION[e]} tamano="sm" etiqueta={t(`autorizaciones.estados.${e}`)} />
              </div>
              <span className="text-sm text-fg-secondary">
                {paraQue(a)} · {a.expires_at ? formatDate(a.expires_at) : '—'}
              </span>
              {columnasAut[columnasAut.length - 1].celda(a, 0)}
            </div>
          );
        }}
      />
    </div>
  );

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 lg:gap-5">
      <PageHeader
        titulo={t('conectar.titulo')}
        subtitulo={subtitulo}
        icono={Link2}
        cargando={cargando}
        migas={[
          { etiqueta: t('migas.finanzas'), href: '/app/finanzas' },
          { etiqueta: t('migas.tesoreria'), href: '/app/finanzas/bancos' },
          { etiqueta: t('conectar.titulo') },
        ]}
        acciones={acciones}
        debajo={
          conectado || datos.autorizaciones.length > 0 ? (
            <TabBar
              id={ID_PESTANAS}
              etiqueta={t('conectar.pestanas.etiqueta')}
              valor={pestana}
              onValorChange={setPestana}
              pestanas={[
                { valor: 'bancos', etiqueta: t('conectar.pestanas.bancos') },
                {
                  valor: 'autorizaciones',
                  etiqueta: t('conectar.pestanas.autorizaciones'),
                  contador: datos.estadoAutorizaciones === 'listo' ? vigentes : undefined,
                },
              ]}
            />
          ) : undefined
        }
      />

      {datos.estado === 'error' && !conectado && pestana === 'bancos' ? (
        <AvisoTonal
          tono="peligro"
          titulo={t('conectar.errorCarga.titulo')}
          descripcion={t('conectar.errorCarga.descripcion')}
          accion={{ etiqueta: t('conectar.errorCarga.reintentar'), onClick: () => void datos.recargar() }}
        />
      ) : null}

      <div role="tabpanel" id={idPanel(ID_PESTANAS, 'bancos')} aria-labelledby={idPestana(ID_PESTANAS, 'bancos')} hidden={pestana !== 'bancos'}>
        {cargando ? <DataTable etiqueta={t('conectar.tabla.etiqueta')} columnas={columnasBancos} filas={[]} obtenerId={(f) => f.id} estado="cargando" /> : datos.estado === 'error' && !conectado ? null : panelBancos}
      </div>
      <div
        role="tabpanel"
        id={idPanel(ID_PESTANAS, 'autorizaciones')}
        aria-labelledby={idPestana(ID_PESTANAS, 'autorizaciones')}
        hidden={pestana !== 'autorizaciones'}
      >
        {panelAutorizaciones}
      </div>

      <DialogoMotivo
        abierto={aRevocar !== null}
        onAbiertoChange={(v) => {
          if (!v && !revocando) setARevocar(null);
        }}
        titulo={t('revocar.titulo')}
        descripcion={aRevocar ? t('revocar.descripcion', { banco: banco(aRevocar), paraQue: paraQue(aRevocar) }) : undefined}
        textoConfirmar={t('revocar.boton')}
        etiquetaMotivo={t('revocar.motivo')}
        placeholder={t('revocar.placeholder')}
        icono={ShieldAlert}
        cargando={revocando}
        error={errorRevocar}
        onConfirmar={(motivo) => void confirmarRevocar(motivo)}
      >
        <AvisoTonal tono="advertencia" compacto titulo={t('revocar.aviso.titulo')} descripcion={t('revocar.aviso.descripcion')} />
      </DialogoMotivo>
    </div>
  );
}
