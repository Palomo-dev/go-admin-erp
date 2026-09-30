'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileBarChart, Plus, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { PageHeader, RowActionsMenu, TabBar, clasesBoton, idPanel, idPestana, type AccionFila, type Miga } from '@/components/kit';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { supabase } from '@/lib/supabase/config';
import { clienteReportes } from '@/lib/services/reportes/clienteReportes';
import { listarCierres, listarGuardados } from '@/lib/services/reportes/lecturasReportes';
import { MessageCircle } from 'lucide-react';
import { ProveedorAccionesReportes, type PedidoCierreUi, type PedidoEnvioUi } from './accionesReportes';
import { BarraFiltros } from './BarraFiltros';
import { CierresTab } from './CierresTab';
import { FavoritosTab } from './FavoritosTab';
import { GenerarCierreDialog } from './GenerarCierreDialog';
import { HistorialTab } from './HistorialTab';
import { InicioReportes } from './InicioReportes';
import { ProgramadosTab } from './ProgramadosTab';
import { ProgramarEnvioDialog } from './ProgramarEnvioDialog';
import { ReportesChatSheet } from './chat/ReportesChatSheet';
import { useEtiquetaPeriodo } from './SelectorPeriodo';
import { rutaCentro } from './rutasReportes';
import { useContextoReportes } from './useContextoReportes';
import { useFiltrosReportes } from './useFiltrosReportes';

const PESTANAS = ['inicio', 'favoritos', 'cierres', 'programados', 'historial'] as const;
export type PestanaReportes = (typeof PESTANAS)[number];

function pestanaDe(valor: string | null): PestanaReportes {
  return (PESTANAS as readonly string[]).includes(valor ?? '') ? (valor as PestanaReportes) : 'inicio';
}

export function CentroReportes({ titulo, subtitulo, migas, children }: { titulo?: string; subtitulo?: string; migas?: Miga[]; children?: React.ReactNode }) {
  const t = useTranslations('reportes');
  const router = useRouter();
  const ctx = useContextoReportes();
  const { organization } = useOrganization();
  const { filtros, hoy, cambiar, cambiarParametro, queryFiltros, parametro } = useFiltrosReportes();
  const etiqueta = useEtiquetaPeriodo();
  const pestana = pestanaDe(parametro('pestana'));
  const [recarga, setRecarga] = useState(0);
  const [cierre, setCierre] = useState<PedidoCierreUi | null>(null);
  const [envio, setEnvio] = useState<PedidoEnvioUi | null>(null);
  const [chat, setChat] = useState(false);
  const [usuario, setUsuario] = useState('');
  const [contadores, setContadores] = useState({ favoritos: 0, cierres: 0, programados: 0 });

  const recargar = () => setRecarga((n) => n + 1);
  const acciones = useMemo(
    () => ({
      abrirCierre: (pedido?: PedidoCierreUi) => setCierre(pedido ?? {}),
      abrirEnvio: (pedido?: PedidoEnvioUi) => setEnvio(pedido ?? {}),
      abrirChat: () => setChat(true),
      recarga,
      recargar,
    }),
    [recarga],
  );

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      const u = data.user;
      setUsuario((u?.user_metadata?.full_name as string | undefined) || u?.email || '');
    });
  }, []);

  useEffect(() => {
    if (!ctx.orgId) return;
    let vivo = true;
    void listarGuardados(ctx.orgId).then((l) => vivo && setContadores((c) => ({ ...c, favoritos: l.filter((f) => f.favorito).length }))).catch(() => undefined);
    void listarCierres(ctx.orgId).then((l) => vivo && setContadores((c) => ({ ...c, cierres: l.filter((f) => f.estado !== 'reemplazado').length }))).catch(() => undefined);
    void clienteReportes.programados().then((l) => vivo && setContadores((c) => ({ ...c, programados: l.length }))).catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [ctx.orgId, recarga]);

  const ir = (p: PestanaReportes) => {
    if (children) router.push(rutaCentro(queryFiltros(p === 'inicio' ? undefined : { pestana: p })));
    else cambiarParametro('pestana', p === 'inicio' ? null : p);
  };

  const mas: AccionFila[] = [{ id: 'chat', etiqueta: t('preguntar'), icono: MessageCircle, onSelect: () => setChat(true) }];
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
                <button type="button" className={clasesBoton({ variante: 'secundario' })} onClick={() => setEnvio({})}>
                  {t('programarEnvios')}
                </button>
              )}
              <button type="button" className={clasesBoton({ variante: 'primario' })} onClick={() => setCierre({})}>
                {t('generarCierre')}
              </button>
              <RowActionsMenu acciones={mas} orientacion="horizontal" tamano="md" titulo={t('masAcciones')} />
            </>
          }
          movil={{
            subtitulo: etiqueta.periodo(filtros.periodo),
            accion: (
              <button type="button" aria-label={t('generarCierre')} className="flex size-10 items-center justify-center rounded-lg text-fg" onClick={() => setCierre({})}>
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
      <GenerarCierreDialog pedido={cierre} onCerrar={() => setCierre(null)} ctx={ctx} periodoInicial={filtros.periodo} hoy={hoy} onListo={recargar} />
      <ProgramarEnvioDialog pedido={envio} onCerrar={() => setEnvio(null)} ctx={ctx} onListo={recargar} />
      {ctx.orgId && (
        <ReportesChatSheet
          open={chat}
          onOpenChange={setChat}
          organizationId={ctx.orgId}
          organizationName={organization?.name}
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
