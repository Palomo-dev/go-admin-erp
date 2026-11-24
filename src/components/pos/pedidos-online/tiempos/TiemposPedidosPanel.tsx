'use client';

/**
 * Configuración › Punto de venta › Pedidos online (Figma pág. «10 Configuración», sección
 * 3011:35924; T1 3011:36563). Tiempos por defecto por tipo de entrega, la confirmación
 * automática y los tiempos propios de cada sede (T3, `DialogoTiemposSede`).
 *
 * Se guarda en `organization_settings` (`pedidos_online_tiempos`) por
 * `GET/PUT /api/pos/pedidos-online-tiempos` (permiso resuelto en el servidor). Sin nada guardado
 * se ven los valores de fábrica, que son los de hoy: nada cambia hasta que el negocio los edite.
 * Dentro del diálogo, la barra «N cambios sin guardar · Descartar · Guardar cambios» la pinta el
 * diálogo (`useRegistrarCambios`); fuera, `SettingsSaveBar`.
 */
import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { AvisoTonal, EmptyState, SettingGroup, SettingRow, SettingsSaveBar } from '@/components/kit';
import { clasesBoton } from '@/components/kit/botonClases';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import { contarCambios, useDentroDelDialogo, useRegistrarCambios } from '@/components/configuracion/dialogo/cambiosSinGuardar';
import { tiemposDeFabrica, verticalDeTipo, type Tiempo, type VerticalTiempos } from '@/lib/pos/pedidosWeb/tiemposPedidos';
import { TablaTiempos } from './TablaTiempos';
import { DialogoTiemposSede } from './DialogoTiemposSede';
import { ajustesDesde, borradorDesde, cambiarTiempo, tiposDistintos, type BorradorTiempos, type TiemposCompletos } from './borradorTiempos';
import { pedirTiempos, TiemposError, type SedeTiempos } from './useTiemposPedidos';

interface Estado {
  original: BorradorTiempos;
  editado: BorradorTiempos;
  sedes: SedeTiempos[];
  vertical: VerticalTiempos;
  puedeEditar: boolean;
}

export function TiemposPedidosPanel() {
  const t = useTranslations('pedidosOnlineTiempos');
  const { toast } = useToast();
  const enDialogo = useDentroDelDialogo();
  const [estado, setEstado] = React.useState<Estado | null>(null);
  const [error, setError] = React.useState(false);
  const [guardando, setGuardando] = React.useState(false);
  const [sedeAbierta, setSedeAbierta] = React.useState<SedeTiempos | null>(null);

  const cargar = React.useCallback(() => {
    setError(false);
    pedirTiempos()
      .then((r) => {
        const vertical = verticalDeTipo(r.tipoOrganizacion);
        const b = borradorDesde(r.ajustes, vertical);
        setEstado({ original: b, editado: b, sedes: r.sedes, vertical, puedeEditar: r.puedeEditar });
      })
      .catch(() => setError(true));
  }, []);
  React.useEffect(cargar, [cargar]);

  const cambios = estado ? contarCambios(estado.original, estado.editado) : 0;
  const guardar = async () => {
    if (!estado) return;
    setGuardando(true);
    try {
      await pedirTiempos({ method: 'PUT', body: JSON.stringify({ ajustes: ajustesDesde(estado.editado) }) });
      setEstado((e) => (e ? { ...e, original: e.editado } : e));
      toast({ title: t('guardado') });
    } catch (err) {
      const codigo = err instanceof TiemposError ? err.codigo : 'error';
      toast({ title: t('errorGuardar'), description: codigo === 'sin_permiso' ? t('soloLectura') : undefined, variant: 'destructive' });
    } finally {
      setGuardando(false);
    }
  };
  const descartar = () => setEstado((e) => (e ? { ...e, editado: e.original } : e));
  useRegistrarCambios({ cambios, guardando, guardar, descartar });

  if (error) return <EmptyState variante="error" titulo={t('errorCargar')} onReintentar={cargar} compacto />;
  if (!estado) {
    return (
      <div className="flex justify-center py-10" role="status" aria-label={t('cargando')}>
        <Loader2 aria-hidden="true" className="size-5 animate-spin text-fg-muted" />
      </div>
    );
  }

  const { editado, puedeEditar, vertical } = estado;
  const editar = (f: (b: BorradorTiempos) => BorradorTiempos) => setEstado((e) => (e ? { ...e, editado: f(e.editado) } : e));
  const corto = (x: Tiempo) => t(`corto.${x.unidad}`, { n: x.valor });

  const resumenSede = (propios: TiemposCompletos) => {
    const tipos = tiposDistintos(propios, editado.por_tipo);
    if (tipos.length === 0) return t('sedes.igualesGenerales');
    return tipos
      .map((tipo) =>
        tipo === 'recoger'
          ? t('sedes.resumen.recoger', { alistar: corto(propios.recoger.alistar) })
          : t(`sedes.resumen.${tipo}`, { alistar: corto(propios[tipo].alistar), entrega: propios[tipo].entrega ? corto(propios[tipo].entrega!) : '—' }),
      )
      .join(' · ');
  };

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      {!puedeEditar && <AvisoTonal tono="neutro" titulo={t('soloLectura')} compacto />}

      <section className="flex flex-col gap-3" aria-labelledby="tiempos-por-defecto">
        <div className="flex flex-col gap-1">
          <h3 id="tiempos-por-defecto" className="text-base font-semibold text-fg">
            {t('porDefecto.titulo')}
          </h3>
          <p className="text-[13px] leading-[18px] text-fg-secondary">{t('porDefecto.descripcion')}</p>
        </div>
        <TablaTiempos
          idPrefijo="tiempos-generales"
          valores={editado.por_tipo}
          deshabilitado={!puedeEditar}
          conDescripcion
          onCambiar={(tipo, campo, tiempo) => editar((b) => ({ ...b, por_tipo: cambiarTiempo(b.por_tipo, tipo, campo, tiempo) }))}
        />
        <div className="flex flex-wrap items-center gap-3 rounded-lg bg-subtle px-3 py-2.5">
          <p className="min-w-0 flex-1 basis-64 text-[13px] leading-[18px] text-fg-secondary">{t('fabrica.nota')}</p>
          <button
            type="button"
            disabled={!puedeEditar}
            onClick={() => editar((b) => ({ ...b, por_tipo: tiemposDeFabrica(vertical) }))}
            className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}
          >
            {t('fabrica.restablecer')}
          </button>
        </div>
      </section>

      <section className="flex flex-col gap-2" aria-labelledby="tiempos-automatica">
        <div className="flex flex-col gap-1">
          <h3 id="tiempos-automatica" className="text-base font-semibold text-fg">
            {t('automatica.titulo')}
          </h3>
          <p className="text-[13px] leading-[18px] text-fg-secondary">{t('automatica.descripcion')}</p>
        </div>
        <SettingGroup etiqueta={t('automatica.titulo')}>
          <SettingRow titulo={t('automatica.usar.titulo')} descripcion={t('automatica.usar.descripcion')} htmlFor="tiempos-usar-automatica">
            <Switch
              id="tiempos-usar-automatica"
              checked={editado.usar_en_confirmacion_automatica}
              disabled={!puedeEditar}
              onCheckedChange={(v) => editar((b) => ({ ...b, usar_en_confirmacion_automatica: v === true }))}
            />
          </SettingRow>
          <SettingRow titulo={t('automatica.apertura.titulo')} descripcion={t('automatica.apertura.descripcion')} htmlFor="tiempos-contar-apertura">
            <Switch
              id="tiempos-contar-apertura"
              checked={editado.contar_desde_apertura}
              disabled={!puedeEditar}
              onCheckedChange={(v) => editar((b) => ({ ...b, contar_desde_apertura: v === true }))}
            />
          </SettingRow>
        </SettingGroup>
      </section>

      <section className="flex flex-col gap-2" aria-labelledby="tiempos-por-sede">
        <div className="flex flex-col gap-1">
          <h3 id="tiempos-por-sede" className="text-base font-semibold text-fg">
            {t('sedes.titulo')}
          </h3>
          <p className="text-[13px] leading-[18px] text-fg-secondary">{t('sedes.descripcion')}</p>
        </div>
        {estado.sedes.length === 0 ? (
          <p className="text-sm text-fg-secondary">{t('sedes.vacio')}</p>
        ) : (
          <ul className="flex flex-col border-t border-line">
            {estado.sedes.map((sede) => {
              const propios = editado.por_sede[String(sede.id)] ?? null;
              return (
                <li key={sede.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-line py-3">
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-fg">{sede.nombre}</span>
                      {propios && (
                        <Badge tono="marca" apariencia="suave" tamano="sm">
                          {t('sedes.propios')}
                        </Badge>
                      )}
                    </div>
                    <span className="text-[13px] leading-[18px] text-fg-secondary">{propios ? resumenSede(propios) : t('sedes.generales')}</span>
                  </div>
                  <button
                    type="button"
                    disabled={!puedeEditar}
                    onClick={() => setSedeAbierta(sede)}
                    aria-label={t(propios ? 'sedes.editarAria' : 'sedes.personalizarAria', { sede: sede.nombre })}
                    className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}
                  >
                    {propios ? t('sedes.editar') : t('sedes.personalizar')}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {sedeAbierta && (
        <DialogoTiemposSede
          abierto={!!sedeAbierta}
          onAbiertoChange={(v) => !v && setSedeAbierta(null)}
          sede={sedeAbierta}
          generales={editado.por_tipo}
          propios={editado.por_sede[String(sedeAbierta.id)] ?? null}
          deshabilitado={!puedeEditar}
          onGuardar={(propios) =>
            editar((b) => {
              const por_sede = { ...b.por_sede };
              if (propios) por_sede[String(sedeAbierta.id)] = propios;
              else delete por_sede[String(sedeAbierta.id)];
              return { ...b, por_sede };
            })
          }
        />
      )}

      {!enDialogo && puedeEditar && <SettingsSaveBar cambios={cambios} onGuardar={() => void guardar()} onDescartar={descartar} guardando={guardando} />}
    </div>
  );
}
