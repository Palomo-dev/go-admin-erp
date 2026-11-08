'use client';

/**
 * Pasos 2 y 3 del asistente de Meta (diseño 85-42 «Activos» y 85-43 «Qué se envía»). Se abren al
 * volver del OAuth existente (`/api/integrations/meta/oauth/callback` redirige con
 * `?conectar=meta&conexion=<id>`). Los datos salen de `GET/POST /api/integrations/conexiones/meta`
 * (Graph API real con el token de la conexión, que nunca llega al navegador).
 * «Prospectos del CRM» no tiene envío a Meta hoy: se muestra deshabilitado, sin fingir.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AvisoTonal, FormField, StatusBadge } from '@/components/kit';
import { Switch } from '@/components/ui/switch';
import type { ItemCatalogo } from '@/lib/services/integrations/conexiones/clienteConexiones';
import { apiAsistentes, type ActivosMetaUi } from './apiAsistentes';
import { MarcoAsistente } from './MarcoAsistente';
import { useNombreServicio } from './useNombreServicio';

const CLASES_SELECT =
  'h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50';

export interface PasosMetaProps {
  item: ItemCatalogo;
  conexionId: string;
  abierto: boolean;
  onCerrar: () => void;
  onConectado: (conexionId: string | null) => void;
}

type Paso = 'activos' | 'envios';

export function PasosMeta({ item, conexionId, abierto, onCerrar, onConectado }: PasosMetaProps) {
  const t = useTranslations('integracionesConexiones');
  const nombre = useNombreServicio(item);
  const [paso, setPaso] = useState<Paso>('activos');
  const [datos, setDatos] = useState<ActivosMetaUi | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sel, setSel] = useState({ negocio: '', cuenta: '', catalogo: '', pixel: '' });
  const [envios, setEnvios] = useState({ catalogo: true, compras: true });

  const cargar = useCallback(
    async (filtro: { negocio?: string; cuenta?: string } = {}) => {
      setCargando(true);
      setError(null);
      try {
        const d = await apiAsistentes.activosMeta(conexionId, filtro);
        setDatos(d);
        setSel((s) => ({
          negocio: filtro.negocio ?? d.seleccion.negocio,
          cuenta: filtro.cuenta ?? (filtro.negocio ? d.cuentas[0]?.id ?? '' : d.seleccion.cuenta),
          catalogo: s.catalogo && (s.catalogo === 'nuevo' || d.catalogos.some((c) => c.id === s.catalogo)) ? s.catalogo : d.seleccion.catalogo || 'nuevo',
          pixel: s.pixel && (s.pixel === 'nuevo' || d.pixeles.some((p) => p.id === s.pixel)) ? s.pixel : d.seleccion.pixel || 'nuevo',
        }));
        setEnvios(d.envios);
      } catch (e) {
        setError(e instanceof Error ? e.message : t('asistente.meta.errorCarga'));
      } finally {
        setCargando(false);
      }
    },
    [conexionId, t],
  );

  useEffect(() => {
    if (abierto) {
      setPaso('activos');
      void cargar();
    }
  }, [abierto, cargar]);

  const pasos = useMemo(
    () => [
      { valor: 'cuenta', etiqueta: t('asistente.meta.pasos.cuenta') },
      { valor: 'activos', etiqueta: t('asistente.meta.pasos.activos') },
      { valor: 'envios', etiqueta: t('asistente.meta.pasos.envios') },
    ],
    [t],
  );

  const completo = !!(sel.negocio && sel.cuenta && sel.catalogo && sel.pixel);

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    try {
      await apiAsistentes.guardarActivosMeta({ conexion: conexionId, ...sel, envios });
      onConectado(conexionId);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('asistente.meta.errorGuardar'));
    } finally {
      setGuardando(false);
    }
  };

  const botones =
    paso === 'activos'
      ? [
          { etiqueta: t('comun.cancelar'), onClick: onCerrar },
          { etiqueta: t('comun.siguiente'), onClick: () => setPaso('envios'), deshabilitado: !completo || cargando || !datos?.autorizada },
        ]
      : [
          { etiqueta: t('comun.atras'), onClick: () => setPaso('activos'), deshabilitado: guardando },
          { etiqueta: t('asistente.meta.activar'), onClick: () => void guardar(), cargando: guardando },
        ];

  return (
    <MarcoAsistente
      abierto={abierto}
      onCerrar={onCerrar}
      servicioId={item.id}
      titulo={t('asistente.comun.titulo', { nombre })}
      subtitulo={paso === 'activos' ? t('asistente.meta.subtituloActivos') : t('asistente.meta.subtituloEnvios')}
      pasos={pasos}
      actual={paso}
      botones={botones}
      ocupado={guardando}
    >
      {error && <AvisoTonal tono="peligro" rol="alert" titulo={error} />}

      {paso === 'activos' && (
        <>
          {!cargando && datos && !datos.autorizada && (
            <AvisoTonal tono="advertencia" rol="alert" titulo={t('asistente.meta.sinAutorizar.titulo')} descripcion={t('asistente.meta.sinAutorizar.descripcion')} />
          )}
          {datos?.autorizada && (
            <div>
              <StatusBadge estado="active" etiqueta={t('asistente.meta.autorizado')} />
            </div>
          )}
          <FormField etiqueta={t('asistente.meta.negocio')} obligatorio>
            {(campo) => (
              <select
                {...campo}
                className={CLASES_SELECT}
                value={sel.negocio}
                disabled={cargando || !datos?.autorizada}
                onChange={(e) => void cargar({ negocio: e.target.value })}
              >
                {(datos?.negocios ?? []).map((n) => (
                  <option key={n.id} value={n.id}>{n.nombre}</option>
                ))}
              </select>
            )}
          </FormField>
          <FormField etiqueta={t('asistente.meta.cuenta')} obligatorio>
            {(campo) => (
              <select
                {...campo}
                className={CLASES_SELECT}
                value={sel.cuenta}
                disabled={cargando || !datos?.cuentas.length}
                onChange={(e) => void cargar({ negocio: sel.negocio, cuenta: e.target.value })}
              >
                {(datos?.cuentas ?? []).map((a) => (
                  <option key={a.id} value={a.id}>{a.moneda ? `${a.nombre} · ${a.moneda}` : a.nombre}</option>
                ))}
              </select>
            )}
          </FormField>
          <FormField etiqueta={t('asistente.meta.catalogo')} obligatorio ayuda={sel.catalogo === 'nuevo' ? t('asistente.meta.catalogoNuevoAyuda') : undefined}>
            {(campo) => (
              <select {...campo} className={CLASES_SELECT} value={sel.catalogo} disabled={cargando || !datos?.autorizada} onChange={(e) => setSel((s) => ({ ...s, catalogo: e.target.value }))}>
                <option value="nuevo">{t('asistente.meta.catalogoNuevo')}</option>
                {(datos?.catalogos ?? []).map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
            )}
          </FormField>
          <FormField etiqueta={t('asistente.meta.pixel')} obligatorio ayuda={t('asistente.meta.pixelAyuda')}>
            {(campo) => (
              <select {...campo} className={CLASES_SELECT} value={sel.pixel} disabled={cargando || !datos?.autorizada} onChange={(e) => setSel((s) => ({ ...s, pixel: e.target.value }))}>
                <option value="nuevo">{t('asistente.meta.pixelNuevo')}</option>
                {(datos?.pixeles ?? []).map((p) => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))}
              </select>
            )}
          </FormField>
        </>
      )}

      {paso === 'envios' && (
        <div className="flex flex-col gap-4">
          <FilaInterruptor
            id="meta-catalogo"
            titulo={t('asistente.meta.envioCatalogo.titulo')}
            descripcion={t('asistente.meta.envioCatalogo.descripcion')}
            valor={envios.catalogo}
            onChange={(v) => setEnvios((x) => ({ ...x, catalogo: v }))}
          />
          {envios.catalogo && (
            <FormField etiqueta={t('asistente.meta.productos')} obligatorio ayuda={t('asistente.meta.productosAyuda')}>
              {(campo) => (
                <select {...campo} className={CLASES_SELECT} value="todos" disabled>
                  <option value="todos">
                    {datos?.productosTienda != null
                      ? t('asistente.meta.productosTodos', { n: datos.productosTienda })
                      : t('asistente.meta.productosTodosSinConteo')}
                  </option>
                </select>
              )}
            </FormField>
          )}
          <FilaInterruptor
            id="meta-compras"
            titulo={t('asistente.meta.envioCompras.titulo')}
            descripcion={t('asistente.meta.envioCompras.descripcion')}
            valor={envios.compras}
            onChange={(v) => setEnvios((x) => ({ ...x, compras: v }))}
          />
          <FilaInterruptor
            id="meta-prospectos"
            titulo={t('asistente.meta.envioProspectos.titulo')}
            descripcion={t('asistente.meta.envioProspectos.descripcion')}
            valor={false}
            deshabilitado
            onChange={() => undefined}
          />
          <AvisoTonal tono="informacion" titulo={t('asistente.meta.privacidad.titulo')} descripcion={t('asistente.meta.privacidad.descripcion')} />
        </div>
      )}
    </MarcoAsistente>
  );
}

function FilaInterruptor({
  id,
  titulo,
  descripcion,
  valor,
  onChange,
  deshabilitado,
}: {
  id: string;
  titulo: string;
  descripcion: string;
  valor: boolean;
  onChange: (v: boolean) => void;
  deshabilitado?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <label htmlFor={id} className="text-sm font-medium text-fg">
          {titulo}
        </label>
        <p id={`${id}-desc`} className="text-[13px] leading-[18px] text-fg-secondary">
          {descripcion}
        </p>
      </div>
      <Switch id={id} aria-describedby={`${id}-desc`} checked={valor} disabled={deshabilitado} onCheckedChange={onChange} />
    </div>
  );
}
