'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { usePathname, useRouter } from 'next/navigation';
import { FileBarChart, MessageCircle, Plus, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { PageHeader, RowActionsMenu, TabBar, clasesBoton, idPanel, idPestana, type AccionFila, type Miga } from '@/components/kit';
import { Skeleton } from '@/components/ui/skeleton';
import { abrirAsistente, type ContextoAsistente } from '@/lib/ai/assistant/panelUi';
import { clienteReportes } from '@/lib/services/reportes/clienteReportes';
import { filtrosEfectivos } from '@/lib/services/reportes/filtrosUrl';
import { contarCierresVigentes, listarGuardados } from '@/lib/services/reportes/lecturasReportes';
import { getReporteById } from '@/lib/services/reportes/reportesCatalogo';
import { ProveedorAccionesReportes, type PedidoAsistenteUi, type PedidoCierreUi, type PedidoEnvioUi } from './accionesReportes';
import { BarraFiltros } from './BarraFiltros';
import { InicioReportes } from './InicioReportes';
import { useEtiquetaPeriodo } from './SelectorPeriodo';
import { rutaCentro } from './rutasReportes';
import { useContextoReportes, type ContextoReportes } from './useContextoReportes';
import { useFiltrosReportes } from './useFiltrosReportes';

// Lo que no se ve en la primera pintura del inicio se descarga cuando hace
// falta: las otras pestañas y los dos diálogos. Las preguntas van al GO
// Asistente del shell (Figma Reportes §22), no a un chat de reportes aparte.
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

const PESTANAS = ['inicio', 'favoritos', 'cierres', 'programados', 'historial'] as const;
export type PestanaReportes = (typeof PESTANAS)[number];

function pestanaDe(valor: string | null): PestanaReportes {
  return (PESTANAS as readonly string[]).includes(valor ?? '') ? (valor as PestanaReportes) : 'inicio';
}

interface PropsCentro {
  /** Reporte abierto en el visor: es el que se le pasa al GO Asistente. */
  reporteId?: string;
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

function CuerpoCentro({ reporteId, titulo, subtitulo, migas, children, ctx }: PropsCentro & { ctx: ContextoReportes }) {
  const t = useTranslations('reportes');
  const router = useRouter();
  // La misma ruta con la que el panel decide si el contexto sigue vigente.
  const ruta = usePathname() ?? '';
  const { filtros, hoy, cambiar, cambiarParametro, queryFiltros, parametro } = useFiltrosReportes();
  const etiqueta = useEtiquetaPeriodo();
  const pestana = pestanaDe(parametro('pestana'));
  const [recarga, setRecarga] = useState(0);
  const [cierre, setCierre] = useState<PedidoCierreUi | null>(null);
  const [envio, setEnvio] = useState<PedidoEnvioUi | null>(null);
  // Los diálogos se montan la primera vez que se abren y se quedan montados
  // (conservan su estado y su animación de cierre).
  const [montados, setMontados] = useState({ cierre: false, envio: false });
  const abrirCierre = useCallback((pedido?: PedidoCierreUi) => {
    setMontados((m) => (m.cierre ? m : { ...m, cierre: true }));
    setCierre(pedido ?? {});
  }, []);
  const abrirEnvio = useCallback((pedido?: PedidoEnvioUi) => {
    setMontados((m) => (m.envio ? m : { ...m, envio: true }));
    setEnvio(pedido ?? {});
  }, []);
  /** Contexto del asistente con el reporte, el periodo, la sucursal y la vista vigentes. */
  const contextoParaAsistente = (pedido: PedidoAsistenteUi): ContextoAsistente => {
    const def = getReporteById(pedido.reporteId ?? reporteId ?? '');
    const sucursalElegida = ctx.resolverSucursal(filtros);
    const efectivos = def ? filtrosEfectivos(def, filtros, sucursalElegida) : { ...filtros, sucursal: sucursalElegida };
    return {
      origen: 'reportes',
      reporte: def
        ? {
            id: def.id,
            titulo: def.titulo,
            grupo: def.grupo,
            comparativo: def.filtros.includes('comparativo'),
            porSucursal: def.alcance === 'sucursal' && def.filtros.includes('sucursal') && ctx.sucursales.length > 1,
          }
        : null,
      periodo: {
        tipo: efectivos.periodo.tipo,
        fechaInicio: efectivos.periodo.fechaInicio,
        fechaFin: efectivos.periodo.fechaFin,
        horaInicio: efectivos.periodo.horaInicio ?? null,
        horaFin: efectivos.periodo.horaFin ?? null,
        etiqueta: etiqueta.periodo(efectivos.periodo),
      },
      sucursal: { id: efectivos.sucursal, nombre: ctx.nombreSucursal(efectivos.sucursal) },
      vista: pedido.vista !== undefined ? pedido.vista : efectivos.vista,
      ruta,
    };
  };
  const armarContexto = useRef(contextoParaAsistente);
  armarContexto.current = contextoParaAsistente;
  const pedidoAsistente = useRef<PedidoAsistenteUi | null>(null);
  const claveAsistente = useRef('');
  /**
   * «Preguntar a GO Asistente» (Figma Reportes 22-01): abre el asistente del
   * shell con este reporte y sus filtros. Es dato de la página: el servidor
   * revalida la sucursal y la lista blanca de reportes.
   */
  const abrirAsistenteReporte = useCallback((pedido: PedidoAsistenteUi = {}) => {
    pedidoAsistente.current = pedido;
    const contexto = armarContexto.current(pedido);
    claveAsistente.current = JSON.stringify(contexto);
    abrirAsistente(contexto);
  }, []);
  // Abierto desde aquí, si cambian el periodo, la sucursal o la vista, el chip
  // del asistente se actualiza sin volver a abrir un panel que se cerró.
  useEffect(() => {
    if (!pedidoAsistente.current) return;
    const contexto = contextoParaAsistente(pedidoAsistente.current);
    const clave = JSON.stringify(contexto);
    if (clave === claveAsistente.current) return;
    claveAsistente.current = clave;
    abrirAsistente(contexto, { abrir: false });
  });
  const [contadores, setContadores] = useState({ favoritos: 0, cierres: 0, programados: 0 });

  const recargar = () => setRecarga((n) => n + 1);
  const acciones = useMemo(
    () => ({
      abrirCierre,
      abrirEnvio,
      abrirAsistente: abrirAsistenteReporte,
      recarga,
      recargar,
    }),
    [recarga, abrirCierre, abrirEnvio, abrirAsistenteReporte],
  );

  // «Programar envío» desde una respuesta del asistente llega como
  // `?programar=1` en la ruta del reporte: se abre el diálogo y se limpia.
  const pedirProgramar = parametro('programar') === '1';
  useEffect(() => {
    if (!pedirProgramar) return;
    abrirEnvio(reporteId ? { reportId: reporteId } : undefined);
    cambiarParametro('programar', null);
    // Solo al llegar con el parámetro.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedirProgramar]);

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

  const mas: AccionFila[] = [
    { id: 'preguntar', etiqueta: t('preguntar'), descripcion: t('preguntarDescripcion'), icono: MessageCircle, onSelect: () => abrirAsistenteReporte() },
  ];
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
    </ProveedorAccionesReportes>
  );
}
