'use client';

/**
 * Integraciones › Conexiones (diseño 85-00, 01, 14 y 15): Catálogo · Mis conexiones ·
 * Actividad · Desarrolladores. Frente INT, 2026-11-07.
 *
 * Los datos salen SOLO de `/api/integrations/conexiones/**` (organización y permisos de la
 * sesión, en el servidor); el navegador nunca lee credenciales. La pestaña vive en `?tab=`;
 * `?conectar=<servicio>` abre la ficha de ese servicio (lo usan las redirecciones del formulario
 * avanzado y del Channel Manager); los callbacks OAuth vuelven con `?meta_success=` /
 * `?meta_error=` (y `tiktok_*`, `google_*`).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Link2, Plus, Upload } from 'lucide-react';
import { PageHeader, SearchInput, TabBar, idPanel, idPestana, useOpcionUrl, useParametrosUrl, clasesBoton } from '@/components/kit';
import {
  apiConexiones,
  type ConexionResumen,
  type ItemCatalogo,
} from '@/lib/services/integrations/conexiones/clienteConexiones';
import { PestanaCatalogo } from './catalogo/PestanaCatalogo';
import { FichaServicio } from './catalogo/FichaServicio';
import { PestanaMisConexiones } from './PestanaMisConexiones';
import { PestanaActividad } from './PestanaActividad';
import { PestanaDesarrolladores } from './PestanaDesarrolladores';
import { ImportarCsvDialogo } from './ImportarCsvDialogo';
import { AsistenteConexion } from '@/components/integraciones/conexiones-v2/asistentes';

const PESTANAS = ['catalogo', 'mis', 'actividad', 'desarrolladores'] as const;
type Pestana = (typeof PESTANAS)[number];

const PROVEEDORES_OAUTH = ['meta', 'tiktok', 'google'] as const;

export function ConexionesPagina() {
  const t = useTranslations('integracionesConexiones');
  const router = useRouter();
  const url = useParametrosUrl();
  const [tab] = useOpcionUrl('tab', PESTANAS, 'catalogo');
  const [busqueda, setBusqueda] = useState('');
  const [catalogo, setCatalogo] = useState<ItemCatalogo[]>([]);
  const [conexiones, setConexiones] = useState<ConexionResumen[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ficha, setFicha] = useState<ItemCatalogo | null>(null);
  const [asistente, setAsistente] = useState<ItemCatalogo | null>(null);
  const [asistenteConexion, setAsistenteConexion] = useState<string | undefined>(undefined);
  const [conectores, setConectores] = useState<{ id: string; nombre: string }[]>([]);
  const [importando, setImportando] = useState(false);

  const cambiarTab = (v: Pestana, extra: Record<string, string | null> = {}) =>
    url.fijar({ tab: v === 'catalogo' ? null : v, errores: null, conexion: null, ...extra });

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const datos = await apiConexiones.listar();
      setCatalogo(datos.catalogo);
      setConexiones(datos.conexiones);
      setConectores(datos.conectores ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('comun.errorCarga'));
    } finally {
      setCargando(false);
    }
  }, [t]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // Resultado de los callbacks OAuth (Meta, TikTok, Google Ads): aviso y URL limpia.
  const okOauth = PROVEEDORES_OAUTH.map((p) => url.leer(`${p}_success`)).find(Boolean) ?? null;
  const errorOauth = PROVEEDORES_OAUTH.map((p) => url.leer(`${p}_error`)).find(Boolean) ?? null;
  useEffect(() => {
    if (!okOauth && !errorOauth) return;
    if (errorOauth) toast.error(t('comun.oauthError'), { description: errorOauth });
    else {
      toast.success(t('comun.oauthOk'), { description: okOauth ?? undefined });
      void cargar();
    }
    const limpiar: Record<string, null> = {};
    for (const p of PROVEEDORES_OAUTH) {
      limpiar[`${p}_success`] = null;
      limpiar[`${p}_error`] = null;
    }
    url.fijar(limpiar, 'replace');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [okOauth, errorOauth]);

  // `?conectar=<id>` abre la ficha del servicio una vez cargado el catálogo. Con `&conexion=<uuid>`
  // (regreso del OAuth de Meta) abre directamente el asistente en el paso siguiente (85-42).
  const conectar = url.leer('conectar');
  const conexionUrl = url.leer('conexion');
  useEffect(() => {
    if (!conectar || catalogo.length === 0) return;
    const item = catalogo.find((i) => i.id === conectar || i.proveedor === conectar);
    if (item && conexionUrl && item.asistente === 'oauth') {
      setAsistenteConexion(conexionUrl);
      setAsistente(item);
    } else if (item) {
      setFicha(item);
    }
    url.fijar({ conectar: null, ...(tab === 'actividad' ? {} : { conexion: null }) }, 'replace');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conectar, catalogo]);

  /** Botón principal de la ficha: asistente propio, flujo de logística o enlace. */
  const abrirAsistente = useCallback(
    (item: ItemCatalogo) => {
      setFicha(null);
      if (item.asistente === 'logistica') {
        router.push(`/app/integraciones/conexiones/logistica?proveedor=${encodeURIComponent(item.id)}`);
        return;
      }
      if ((item.asistente === 'enlace' || item.asistente === 'avanzado') && item.enlace) {
        router.push(item.enlace);
        return;
      }
      setAsistenteConexion(undefined);
      setAsistente(item);
    },
    [router],
  );

  const nombreServicio = useCallback(
    (i: Pick<ItemCatalogo, 'id' | 'nombre'>) => (t.has(`servicios.${i.id}.nombre`) ? t(`servicios.${i.id}.nombre`) : i.nombre ?? i.id),
    [t],
  );

  const atencion = useMemo(() => conexiones.filter((c) => c.necesitaAtencion).length, [conexiones]);
  const conectadas = useMemo(() => conexiones.filter((c) => c.estado === 'connected').length, [conexiones]);

  const subtitulo =
    tab === 'mis'
      ? t('misConexiones.subtitulo', { conectadas, atencion })
      : tab === 'actividad'
        ? t('actividad.subtitulo')
        : tab === 'desarrolladores'
          ? t('desarrolladores.subtitulo')
          : t('catalogo.subtitulo');

  return (
    <div className="flex min-w-0 flex-col gap-4 p-4 sm:p-6">
      <PageHeader
        titulo={t('comun.titulo')}
        subtitulo={subtitulo}
        icono={Link2}
        migas={[{ etiqueta: t('comun.migaIntegraciones'), href: '/app/integraciones' }, { etiqueta: t('comun.titulo') }]}
        acciones={
          <div className="flex flex-wrap gap-2">
            <button type="button" className={clasesBoton({ variante: 'fantasma' })} onClick={() => setImportando(true)}>
              <Upload aria-hidden="true" className="mr-1.5 size-4" />
              {t('importar.abrir')}
            </button>
            <button type="button" className={clasesBoton({ variante: 'secundario' })} onClick={() => cambiarTab('catalogo')}>
              <Plus aria-hidden="true" className="mr-1.5 size-4" />
              {t('comun.conectar')}
            </button>
          </div>
        }
        debajo={
          <div className="flex flex-col gap-3">
            {tab !== 'desarrolladores' && (
              <SearchInput
                value={busqueda}
                onChange={setBusqueda}
                placeholder={tab === 'catalogo' ? t('catalogo.buscar') : t('misConexiones.buscar')}
                etiqueta={tab === 'catalogo' ? t('catalogo.buscar') : t('misConexiones.buscar')}
              />
            )}
            <TabBar
              id="conexiones"
              etiqueta={t('comun.pestanas')}
              valor={tab}
              onValorChange={(v) => cambiarTab(v)}
              pestanas={PESTANAS.map((v) => ({
                valor: v,
                etiqueta: t(`comun.tab.${v}`),
                contador: v === 'mis' && !cargando && !error ? conexiones.length : undefined,
              }))}
            />
          </div>
        }
      />

      <div role="tabpanel" id={idPanel('conexiones', tab)} aria-labelledby={idPestana('conexiones', tab)} className="min-w-0">
        {tab === 'catalogo' && (
          <PestanaCatalogo
            items={catalogo}
            cargando={cargando}
            error={error}
            busqueda={busqueda}
            onLimpiarBusqueda={() => setBusqueda('')}
            onReintentar={() => void cargar()}
            nombreServicio={nombreServicio}
            onAbrirFicha={setFicha}
          />
        )}
        {tab === 'mis' && (
          <PestanaMisConexiones
            conexiones={conexiones}
            cargando={cargando}
            error={error}
            busqueda={busqueda}
            onLimpiarBusqueda={() => setBusqueda('')}
            onReintentar={() => void cargar()}
            onVerErrores={() => cambiarTab('actividad', { errores: '1' })}
            onIrCatalogo={() => cambiarTab('catalogo')}
            onCambio={() => void cargar()}
          />
        )}
        {tab === 'actividad' && <PestanaActividad conexiones={conexiones} busqueda={busqueda} />}
        {tab === 'desarrolladores' && <PestanaDesarrolladores />}
      </div>

      <FichaServicio
        item={ficha}
        nombre={ficha ? nombreServicio(ficha) : ''}
        onCerrar={() => setFicha(null)}
        onConectar={abrirAsistente}
      />

      <ImportarCsvDialogo
        abierto={importando}
        onAbiertoChange={setImportando}
        conectores={conectores}
        onImportado={() => void cargar()}
      />
      {asistente && (
        <AsistenteConexion
          item={asistente}
          abierto={!!asistente}
          conexionId={asistenteConexion}
          onCerrar={() => {
            setAsistente(null);
            setAsistenteConexion(undefined);
          }}
          onConectado={(conexionId) => {
            setAsistente(null);
            setAsistenteConexion(undefined);
            void cargar();
            if (conexionId) router.push(`/app/integraciones/conexiones/${conexionId}`);
          }}
        />
      )}
    </div>
  );
}
