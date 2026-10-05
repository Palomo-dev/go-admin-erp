'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { FileBarChart, MessageCircle, Plus, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { PageHeader, RowActionsMenu, TabBar, clasesBoton, idPanel, idPestana, type AccionFila, type Miga } from '@/components/kit';
import { Skeleton } from '@/components/ui/skeleton';
import { clienteReportes } from '@/lib/services/reportes/clienteReportes';
import { contarCierresVigentes, listarGuardados, usuarioDeSesion } from '@/lib/services/reportes/lecturasReportes';
import { ProveedorAccionesReportes, type PedidoCierreUi, type PedidoEnvioUi } from './accionesReportes';
import { BarraFiltros } from './BarraFiltros';
import { InicioReportes } from './InicioReportes';
import { useEtiquetaPeriodo } from './SelectorPeriodo';
import { rutaCentro } from './rutasReportes';
import { useContextoReportes, type ContextoReportes } from './useContextoReportes';
import { useFiltrosReportes } from './useFiltrosReportes';

// Lo que no se ve en la primera pintura del inicio se descarga cuando hace
// falta: las otras pestañas, los dos diálogos y el asistente (que arrastra
// recharts por las gráficas de sus respuestas).
function EsqueletoPestana() {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-3">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-2/3" />
    </div>
  );
}
const FavoritosTab = dynamic(() => import('./FavoritosTab').then((m) => m.FavoritosTab), { loading: EsqueletoPestana });
const CierresTab = dynamic(() => import('./CierresTab').then((m) => m.CierresTab), { loading: EsqueletoPestana });
const ProgramadosTab = dynamic(() => import('./ProgramadosTab').then((m) => m.ProgramadosTab), { loading: EsqueletoPestana });
const HistorialTab = dynamic(() => import('./HistorialTab').then((m) => m.HistorialTab), { loading: EsqueletoPestana });
const GenerarCierreDialog = dynamic(() => import('./GenerarCierreDialog').then((m) => m.GenerarCierreDialog));
const ProgramarEnvioDialog = dynamic(() => import('./ProgramarEnvioDialog').then((m) => m.ProgramarEnvioDialog));
const ReportesChatSheet = dynamic(() => import('./chat/ReportesChatSheet').then((m) => m.ReportesChatSheet));

const PESTANAS = ['inicio', 'favoritos', 'cierres', 'programados', 'historial'] as const;
export type PestanaReportes = (typeof PESTANAS)[number];

function pestanaDe(valor: string | null): PestanaReportes {
  return (PESTANAS as readonly string[]).includes(valor ?? '') ? (valor as PestanaReportes) : 'inicio';
}

interface PropsCentro {
  titulo?: string;
  subtitulo?: string;
  migas?: Miga[];
  children?: React.ReactNode;
}

/**
 * @param ctx Contexto ya leído por la pantalla que envuelve (la del grupo): se
 *   reutiliza en vez de leer dos veces la organización, el plan y los permisos.
 */
export function CentroReportes({ ctx, ...props }: PropsCentro & { ctx?: ContextoReportes }) {
  return ctx ? <CuerpoCentro {...props} ctx={ctx} /> : <CentroConContexto {...props} />;
}

function CentroConContexto(props: PropsCentro) {
  const ctx = useContextoReportes();
  return <CuerpoCentro {...props} ctx={ctx} />;
}

function CuerpoCentro({ titulo, subtitulo, migas, children, ctx }: PropsCentro & { ctx: ContextoReportes }) {
  const t = useTranslations('reportes');
  const router = useRouter();
  const { filtros, hoy, cambiar, cambiarParametro, queryFiltros, parametro } = useFiltrosReportes();
  const etiqueta = useEtiquetaPeriodo();
  const pestana = pestanaDe(parametro('pestana'));
  const [recarga, setRecarga] = useState(0);
  const [cierre, setCierre] = useState<PedidoCierreUi | null>(null);
  const [envio, setEnvio] = useState<PedidoEnvioUi | null>(null);
  const [chat, setChat] = useState(false);
  // Los diálogos y el asistente se montan la primera vez que se abren y se
  // quedan montados (conservan su estado y su animación de cierre).
  const [montados, setMontados] = useState({ cierre: false, envio: false, chat: false });
  const abrirCierre = useCallback((pedido?: PedidoCierreUi) => {
    setMontados((m) => (m.cierre ? m : { ...m, cierre: true }));
    setCierre(pedido ?? {});
  }, []);
  const abrirEnvio = useCallback((pedido?: PedidoEnvioUi) => {
    setMontados((m) => (m.envio ? m : { ...m, envio: true }));
    setEnvio(pedido ?? {});
  }, []);
  const abrirChat = useCallback(() => {
    setMontados((m) => (m.chat ? m : { ...m, chat: true }));
    setChat(true);
  }, []);
  const [usuario, setUsuario] = useState('');
  const [contadores, setContadores] = useState({ favoritos: 0, cierres: 0, programados: 0 });

  const recargar = () => setRecarga((n) => n + 1);
  const acciones = useMemo(
    () => ({
      abrirCierre,
      abrirEnvio,
      abrirChat,
      recarga,
      recargar,
    }),
    [recarga, abrirCierre, abrirEnvio, abrirChat],
  );

  useEffect(() => {
    let vivo = true;
    void usuarioDeSesion()
      .then((u) => vivo && setUsuario((u?.user_metadata?.full_name as string | undefined) || u?.email || ''))
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, []);

  useEffect(() => {
    if (!ctx.orgId) return;
    let vivo = true;
    void listarGuardados(ctx.orgId).then((l) => vivo && setContadores((c) => ({ ...c, favoritos: l.filter((f) => f.favorito).length }))).catch(() => undefined);
    void contarCierresVigentes(ctx.orgId).then((n) => vivo && setContadores((c) => ({ ...c, cierres: n }))).catch(() => undefined);
    void clienteReportes.programados().then((l) => vivo && setContadores((c) => ({ ...c, programados: l.length }))).catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [ctx.orgId, recarga]);

  const ir = (p: PestanaReportes) => {
    if (children) router.push(rutaCentro(queryFiltros(p === 'inicio' ? undefined : { pestana: p })));
    else cambiarParametro('pestana', p === 'inicio' ? null : p);
  };

  const mas: AccionFila[] = [{ id: 'chat', etiqueta: t('preguntar'), icono: MessageCircle, onSelect: abrirChat }];
  const query = queryFiltros();

  return (
    <ProveedorAccionesReportes value={acciones}>
      <div className="flex flex-col gap-4 p-4 sm:p-6">
        <PageHeader
          titulo={titulo ?? t('titulo')}
          icono={FileBarChart}
          subtitulo={subtitulo ?? `${t('inicio.conteo', { n: ctx.grupos.reduce((s, g) => s + g.reportes.length, 0) })} · ${etiqueta.periodo(filtros.periodo)}`}
          migas={[{ etiqueta: t('migaInicio'), href: '/app' }, { etiqueta: t('titulo'), href: children ? rutaCentro(query) : undefined }, ...(migas ?? [])]}
          cargando={ctx.cargando}
          acciones={
            <>
              <button type="button" className={clasesBoton({ variante: 'secundario', className: 'w-10 px-0' })} aria-label={t('actualizar')} onClick={recargar}>
                <RefreshCw aria-hidden className="size-4" strokeWidth={1.5} />
              </button>
              {!children && (
                <button type="button" className={clasesBoton({ variante: 'secundario' })} onClick={() => abrirEnvio()}>
                  {t('programarEnvios')}
                </button>
              )}
              <button type="button" className={clasesBoton({ variante: 'primario' })} onClick={() => abrirCierre()}>
                {t('generarCierre')}
              </button>
              <RowActionsMenu acciones={mas} orientacion="horizontal" tamano="md" titulo={t('masAcciones')} />
            </>
          }
          movil={{
            subtitulo: etiqueta.periodo(filtros.periodo),
            accion: (
              <button type="button" aria-label={t('generarCierre')} className="flex size-10 items-center justify-center rounded-lg text-fg" onClick={() => abrirCierre()}>
                <Plus aria-hidden className="size-5" strokeWidth={1.5} />
              </button>
            ),
          }}
          debajo={
            <TabBar
              id="reportes"
              etiqueta={t('pestanas.etiqueta')}
              valor={children ? 'inicio' : pestana}
              onValorChange={ir}
              pestanas={[
                { valor: 'inicio', etiqueta: t('pestanas.inicio') },
                { valor: 'favoritos', etiqueta: t('pestanas.favoritos'), contador: contadores.favoritos || undefined },
                { valor: 'cierres', etiqueta: t('pestanas.cierres'), contador: contadores.cierres || undefined },
                { valor: 'programados', etiqueta: t('pestanas.programados'), contador: contadores.programados || undefined },
                { valor: 'historial', etiqueta: t('pestanas.historial') },
              ]}
            />
          }
        />
        <div role="tabpanel" id={idPanel('reportes', children ? 'inicio' : pestana)} aria-labelledby={idPestana('reportes', children ? 'inicio' : pestana)}>
          {children ?? (
            <div className="flex flex-col gap-4">
              {pestana !== 'inicio' && <BarraFiltros filtros={filtros} onCambiar={cambiar} hoy={hoy} ctx={ctx} sinComparar={pestana !== 'historial'} />}
              {pestana === 'inicio' && <InicioReportes ctx={ctx} filtros={filtros} query={query} recarga={recarga} onVerHistorial={() => ir('historial')} />}
              {pestana === 'favoritos' && <FavoritosTab ctx={ctx} recarga={recarga} />}
              {pestana === 'cierres' && <CierresTab ctx={ctx} recarga={recarga} onRecargar={recargar} />}
              {pestana === 'programados' && <ProgramadosTab ctx={ctx} recarga={recarga} onRecargar={recargar} />}
              {pestana === 'historial' && <HistorialTab ctx={ctx} />}
            </div>
          )}
        </div>
      </div>
      {montados.cierre && (
        <GenerarCierreDialog pedido={cierre} onCerrar={() => setCierre(null)} ctx={ctx} periodoInicial={filtros.periodo} hoy={hoy} onListo={recargar} />
      )}
      {montados.envio && <ProgramarEnvioDialog pedido={envio} onCerrar={() => setEnvio(null)} ctx={ctx} onListo={recargar} />}
      {ctx.orgId && montados.chat && (
        <ReportesChatSheet
          open={chat}
          onOpenChange={setChat}
          organizationId={ctx.orgId}
          organizationName={ctx.nombreOrganizacion}
          userName={usuario || t('historial.usuario')}
          userRole="usuario"
          periodoActual={filtros.periodo}
          modulosActivos={ctx.codigos}
          branchId={ctx.resolverSucursal(filtros)}
        />
      )}
    </ProveedorAccionesReportes>
  );
}
