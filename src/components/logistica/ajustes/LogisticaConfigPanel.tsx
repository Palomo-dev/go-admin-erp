'use client';

/**
 * Configuración › Logística (`logistica.general`). Ajustes del módulo, no catálogos: las zonas y
 * las reglas siguen en Logística (/app/logistica/zonas y /reglas), con el atajo «Configurar».
 *
 * Figma «22 Logística» › 10 (2933:9477): Seguimiento y entrega · Cobro del domicilio · Avisos al
 * cliente · Catálogos y proveedores. Ajustes con ancla (buscador y deep link): `sin-movimiento`,
 * `codigo-entrega` (interruptor que lee la base), `cargo-domicilio`, `envio-gratis`,
 * `peso-organizacion` y `avisos`. El cargo de domicilio y los avisos se explican y enlazan (los
 * decide un permiso de Roles o su propia sección).
 *
 * Lee y guarda por `GET/PUT /api/logistica/ajustes` (permiso resuelto en el servidor). Dentro del
 * diálogo, la barra «Descartar · Guardar» la pinta el diálogo (`useRegistrarCambios`).
 */
import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Bell, Link2 } from 'lucide-react';
import { AvisoTonal, CampoNumero, EmptyState, SegmentedControl, SettingGroup, SettingRow, SettingsSaveBar } from '@/components/kit';
import { clasesBoton } from '@/components/kit/botonClases';
import { Switch } from '@/components/ui/switch';
import { TarjetaEnlaceConfig } from '@/components/configuracion/TarjetaEnlaceConfig';
import { useToast } from '@/components/ui/use-toast';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { contarCambios, useDentroDelDialogo, useRegistrarCambios } from '@/components/configuracion/dialogo/cambiosSinGuardar';
import { abrirConfiguracion } from '@/components/configuracion/dialogo/abrirConfiguracion';
import { AJUSTES_LOGISTICA_POR_DEFECTO, HORAS_MAX, HORAS_MIN, type AjustesLogistica } from '@/lib/logistica/ajustesLogistica';
import type { PesoOrganizacion } from '@/lib/services/logistica/pesoMedidasService';
import type { AplicaEnvioGratis } from '@/lib/logistica/zonas';

interface Estado {
  ajustes: AjustesLogistica;
  peso: PesoOrganizacion;
}

const PESO_VACIO: PesoOrganizacion = { default_weight_kg: null, default_length_cm: null, default_width_cm: null, default_height_cm: null };

async function pedir(init: RequestInit = {}): Promise<{ ajustes: AjustesLogistica; peso: PesoOrganizacion | null; puedeEditar?: boolean }> {
  const h: Record<string, string> = {};
  if (init.body) h['Content-Type'] = 'application/json';
  const org = Number(getOrganizationId()) || null;
  if (org) h['x-organization-id'] = String(org);
  const r = await fetch('/api/logistica/ajustes', { credentials: 'same-origin', cache: 'no-store', ...init, headers: h });
  const cuerpo = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(typeof cuerpo?.code === 'string' ? cuerpo.code : 'error');
  return cuerpo;
}

export function LogisticaConfigPanel({ onAbrirEnlace }: { onAbrirEnlace?: (href: string) => void }) {
  const t = useTranslations('logistica.zonas.ajustes');
  const tv = useTranslations('logisticaVehiculo.ajustes');
  const tz = useTranslations('logistica.zonas');
  const { toast } = useToast();
  const enDialogo = useDentroDelDialogo();
  const [original, setOriginal] = React.useState<Estado | null>(null);
  const [editado, setEditado] = React.useState<Estado | null>(null);
  const [puedeEditar, setPuedeEditar] = React.useState(false);
  const [error, setError] = React.useState(false);
  const [guardando, setGuardando] = React.useState(false);

  const cargar = React.useCallback(() => {
    setError(false);
    pedir()
      .then((r) => {
        const e = { ajustes: r.ajustes ?? AJUSTES_LOGISTICA_POR_DEFECTO, peso: r.peso ?? PESO_VACIO };
        setOriginal(e);
        setEditado(e);
        setPuedeEditar(r.puedeEditar === true);
      })
      .catch(() => setError(true));
  }, []);
  React.useEffect(cargar, [cargar]);

  const cambios = original && editado ? contarCambios(original, editado) : 0;
  const guardar = async () => {
    if (!editado) return;
    setGuardando(true);
    try {
      const r = await pedir({ method: 'PUT', body: JSON.stringify(editado) });
      const e = { ajustes: r.ajustes, peso: editado.peso };
      setOriginal(e);
      setEditado(e);
      toast({ title: t('guardado') });
    } catch {
      toast({ title: t('errorGuardar'), variant: 'destructive' });
    } finally {
      setGuardando(false);
    }
  };
  const descartar = () => setEditado(original);
  useRegistrarCambios({ cambios, guardando, guardar, descartar });

  if (error) return <EmptyState variante="error" titulo={t('errorCargar')} onReintentar={cargar} compacto />;
  if (!editado) return <p className="text-sm text-fg-secondary">{t('cargando')}</p>;

  const cambiarAjuste = <K extends keyof AjustesLogistica>(k: K, v: AjustesLogistica[K]) =>
    setEditado((e) => (e ? { ...e, ajustes: { ...e.ajustes, [k]: v } } : e));
  const cambiarPeso = <K extends keyof PesoOrganizacion>(k: K, v: number | null) =>
    setEditado((e) => (e ? { ...e, peso: { ...e.peso, [k]: v && v > 0 ? v : null } } : e));
  const abrir = (href: string) => (onAbrirEnlace ? onAbrirEnlace(href) : (window.location.href = href));

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      {!puedeEditar && <AvisoTonal tono="neutro" titulo={t('soloLectura')} compacto />}

      {/* Figma «22 Logística» › 10 (2933:9477): cuatro bloques. */}
      <section className="flex flex-col gap-2" aria-labelledby="logistica-seguimiento">
        <h3 id="logistica-seguimiento" className="text-base font-semibold text-fg">{t('grupos.seguimiento')}</h3>
        <SettingGroup etiqueta={t('grupos.seguimiento')}>
          <SettingRow titulo={<span id="sin-movimiento">{t('sinMovimiento.titulo')}</span>} descripcion={t('sinMovimiento.descripcion')}>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex w-32 flex-col gap-1 text-xs text-fg-secondary">
                {t('sinMovimiento.transportadora')}
                <CampoNumero
                  id="logistica-horas-transportadora"
                  valor={editado.ajustes.horasSinMovimientoTransportadora}
                  onValorChange={(v) => cambiarAjuste('horasSinMovimientoTransportadora', Math.min(Math.max(Math.round(v ?? HORAS_MIN), HORAS_MIN), HORAS_MAX))}
                  decimales={0}
                  minimo={HORAS_MIN}
                  maximo={HORAS_MAX}
                  sufijo="h"
                  disabled={!puedeEditar}
                />
              </label>
              <label className="flex w-32 flex-col gap-1 text-xs text-fg-secondary">
                {t('sinMovimiento.propio')}
                <CampoNumero
                  id="logistica-horas-propio"
                  valor={editado.ajustes.horasSinMovimientoPropio}
                  onValorChange={(v) => cambiarAjuste('horasSinMovimientoPropio', Math.min(Math.max(Math.round(v ?? HORAS_MIN), HORAS_MIN), HORAS_MAX))}
                  decimales={0}
                  minimo={HORAS_MIN}
                  maximo={HORAS_MAX}
                  sufijo="h"
                  disabled={!puedeEditar}
                />
              </label>
            </div>
          </SettingRow>
          <SettingRow titulo={<span id="codigo-entrega">{t('codigoEntrega.titulo')}</span>} descripcion={t('codigoEntrega.descripcion')} htmlFor="logistica-codigo-entrega">
            <Switch
              id="logistica-codigo-entrega"
              checked={editado.ajustes.codigoEntregaContraentrega}
              onCheckedChange={(v) => cambiarAjuste('codigoEntregaContraentrega', v === true)}
              disabled={!puedeEditar}
            />
          </SettingRow>
          {/* Logística 1b (decisión 6): apagado por defecto = solo avisos. */}
          <SettingRow
            titulo={<span id="bloqueo-documentos">{tv('bloqueo.titulo')}</span>}
            descripcion={
              <>
                {tv('bloqueo.descripcion')}{' '}
                <a href="/app/hrm/marcacion?vista=metodos&credenciales=1" className="font-medium text-brand underline-offset-2 hover:underline">
                  {tv('bloqueo.asignarPin')}
                </a>
              </>
            }
            htmlFor="logistica-bloqueo-documentos"
          >
            <Switch
              id="logistica-bloqueo-documentos"
              checked={editado.ajustes.bloqueoDocumentosAsignacion}
              onCheckedChange={(v) => cambiarAjuste('bloqueoDocumentosAsignacion', v === true)}
              disabled={!puedeEditar}
            />
          </SettingRow>
        </SettingGroup>
      </section>

      <section className="flex flex-col gap-2" aria-labelledby="logistica-cobro">
        <h3 id="logistica-cobro" className="text-base font-semibold text-fg">{t('grupos.cobro')}</h3>
        <SettingGroup etiqueta={t('grupos.cobro')}>
          <SettingRow titulo={<span id="cargo-domicilio">{t('cargoDomicilio.titulo')}</span>} descripcion={t('cargoDomicilio.descripcion')}>
            <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'sm' })} onClick={() => abrirConfiguracion({ seccionId: 'roles.general' })}>
              {t('cargoDomicilio.accion')}
            </button>
          </SettingRow>
          <SettingRow titulo={<span id="envio-gratis">{t('envioGratis.titulo')}</span>} descripcion={t('envioGratis.descripcion')}>
            <SegmentedControl
              opciones={(['web', 'pos', 'both'] as const).map((v) => ({ valor: v, etiqueta: tz(`gratisAplica.${v}`) }))}
              valor={editado.ajustes.envioGratisPorDefecto}
              onValorChange={(v: AplicaEnvioGratis) => cambiarAjuste('envioGratisPorDefecto', v)}
              etiqueta={t('envioGratis.titulo')}
              deshabilitado={!puedeEditar}
            />
          </SettingRow>
          <div className="flex flex-col gap-3 px-4 py-3">
            <div className="flex flex-col gap-0.5">
              <p id="peso-organizacion" className="text-sm font-medium text-fg">{t('peso.titulo')}</p>
              <p className="text-[13px] leading-[18px] text-fg-secondary">{t('peso.descripcion')}</p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(
                [
                  ['default_weight_kg', 'kg', 3],
                  ['default_length_cm', 'cm', 1],
                  ['default_width_cm', 'cm', 1],
                  ['default_height_cm', 'cm', 1],
                ] as const
              ).map(([campo, unidad, dec]) => (
                <label key={campo} className="flex flex-col gap-1 text-xs text-fg-secondary">
                  {t(`peso.${campo}`)}
                  <CampoNumero valor={editado.peso[campo]} onValorChange={(v) => cambiarPeso(campo, v)} decimales={dec} minimo={0} sufijo={unidad} disabled={!puedeEditar} />
                </label>
              ))}
            </div>
          </div>
        </SettingGroup>
      </section>

      <section className="flex flex-col gap-2" aria-labelledby="logistica-avisos">
        <h3 id="logistica-avisos" className="text-base font-semibold text-fg">{t('grupos.avisos')}</h3>
        <TarjetaEnlaceConfig
          id="avisos"
          icono={Bell}
          texto={t('avisos.descripcion')}
          enlaces={[{ etiqueta: t('avisos.accion'), onClick: () => abrirConfiguracion({ seccionId: 'pos.avisos-cliente' }) }]}
        />
      </section>

      <section className="flex flex-col gap-2" aria-labelledby="logistica-catalogos">
        <h3 id="logistica-catalogos" className="text-base font-semibold text-fg">{t('grupos.catalogos')}</h3>
        <TarjetaEnlaceConfig
          icono={Link2}
          texto={t('zonas.descripcion')}
          enlaces={[
            { etiqueta: t('zonas.accion'), onClick: () => abrir('/app/logistica/zonas') },
            { etiqueta: t('zonas.conexiones'), onClick: () => abrir('/app/integraciones/conexiones/logistica') },
          ]}
        />
      </section>

      {!enDialogo && puedeEditar && <SettingsSaveBar cambios={cambios} onGuardar={() => void guardar()} onDescartar={descartar} guardando={guardando} />}
    </div>
  );
}
