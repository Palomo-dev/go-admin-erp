'use client';

/**
 * Configuración › Transporte (`transporte.general`). Figma «23 Transporte» › 21b: arriba
 * (2937:19876), tipos de vehículo y motivos (2937:20973) y al final, excepciones (2937:21271).
 * Reemplaza la página «Transporte › Configuración» descartada (sección 21): Transporte no tiene
 * página de ajustes; Despachos de hoy, Flota y Boletos llevan el atajo «Configurar».
 *
 * Ajustes con ancla (buscador y deep link): `retencion`, `cambios-anulaciones`, `liquidacion`,
 * `rndc`, `tipos-vehiculo`, `motivos-novedad` y `excepciones`. Lee y guarda por
 * `GET/PUT /api/transporte/ajustes` (permiso `transporte.manage` resuelto en el servidor). Dentro
 * del diálogo, la barra «Descartar · Guardar» la pinta el diálogo (`useRegistrarCambios`).
 *
 * Lo que NO es ajuste se explica y enlaza: la liquidación de conductores (nómina, Recursos
 * humanos) y de propietarios (cuentas por pagar, Finanzas), las credenciales del RNDC
 * (Integraciones › Conexiones) y quién autoriza excepciones (un permiso de Equipo y roles).
 */
import * as React from 'react';
import { useTranslations } from 'next-intl';
import { ArrowDown, ArrowUp, ArrowUpRight, Bus, Car, Eye, EyeOff, GripVertical, Link2, Plus, Ship, Trash2, Truck, type LucideIcon } from 'lucide-react';
import { AvisoTonal, CampoNumero, EmptyState, RowActionsMenu, SettingGroup, SettingRow, SettingsSaveBar, StatusBadge, type AccionFila } from '@/components/kit';
import { clasesBoton } from '@/components/kit/botonClases';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useToast } from '@/components/ui/use-toast';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { contarCambios, useDentroDelDialogo, useRegistrarCambios } from '@/components/configuracion/dialogo/cambiosSinGuardar';
import { abrirConfiguracion } from '@/components/configuracion/dialogo/abrirConfiguracion';
import { TarjetaEnlaceConfig } from '@/components/configuracion/TarjetaEnlaceConfig';
import {
  AJUSTES_TRANSPORTE_POR_DEFECTO,
  ANULACION_MAX_H,
  CAMBIO_MAX_MIN,
  EMBARCACIONES,
  GRAVEDADES,
  MAX_MOTIVOS,
  MAX_NOMBRE_MOTIVO,
  RETENCION_MAX,
  RETENCION_MIN,
  USO_TIPO_VEHICULO,
  idMotivoNuevo,
  type AjustesTransporte,
  type Gravedad,
  type MotivoNovedad,
  type TipoVehiculo,
} from '@/lib/transporte/ajustesTransporte';
import { nombreMotivo } from './nombreMotivo';

interface Respuesta {
  ajustes: AjustesTransporte;
  puedeEditar?: boolean;
}

async function pedir(init: RequestInit = {}): Promise<Respuesta> {
  const h: Record<string, string> = {};
  if (init.body) h['Content-Type'] = 'application/json';
  const org = Number(getOrganizationId()) || null;
  if (org) h['x-organization-id'] = String(org);
  const r = await fetch('/api/transporte/ajustes', { credentials: 'same-origin', cache: 'no-store', ...init, headers: h });
  const cuerpo = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(typeof cuerpo?.code === 'string' ? cuerpo.code : 'error');
  return cuerpo;
}

const ICONO_TIPO: Record<TipoVehiculo, LucideIcon> = {
  bus: Bus,
  minibus: Bus,
  truck: Truck,
  car: Car,
  van: Car,
  motorcycle: Car,
  trailer: Truck,
  boat: Ship,
  yacht: Ship,
  other: Car,
};

const TONO_GRAVEDAD: Record<Gravedad, 'informacion' | 'advertencia' | 'peligro'> = { leve: 'informacion', moderada: 'advertencia', grave: 'peligro' };

const acotar = (v: number | null, min: number, max: number, porDefecto: number) => Math.min(Math.max(Math.round(v ?? porDefecto), min), max);

export function TransporteConfigPanel({ onAbrirEnlace }: { onAbrirEnlace?: (href: string) => void }) {
  const t = useTranslations('transporte.ajustes');
  const tm = useTranslations('transporte');
  const { toast } = useToast();
  const enDialogo = useDentroDelDialogo();
  const [original, setOriginal] = React.useState<AjustesTransporte | null>(null);
  const [editado, setEditado] = React.useState<AjustesTransporte | null>(null);
  const [puedeEditar, setPuedeEditar] = React.useState(false);
  const [error, setError] = React.useState(false);
  const [guardando, setGuardando] = React.useState(false);
  const [nuevoMotivo, setNuevoMotivo] = React.useState<string | null>(null);

  const cargar = React.useCallback(() => {
    setError(false);
    pedir()
      .then((r) => {
        const a = r.ajustes ?? AJUSTES_TRANSPORTE_POR_DEFECTO;
        setOriginal(a);
        setEditado(a);
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
      const r = await pedir({ method: 'PUT', body: JSON.stringify({ ajustes: editado }) });
      setOriginal(r.ajustes);
      setEditado(r.ajustes);
      toast({ title: t('guardado') });
    } catch (e) {
      const codigo = e instanceof Error ? e.message : 'error';
      toast({ title: t('errorGuardar'), description: t.has(`errores.${codigo}`) ? t(`errores.${codigo}`) : undefined, variant: 'destructive' });
    } finally {
      setGuardando(false);
    }
  };
  const descartar = () => {
    setEditado(original);
    setNuevoMotivo(null);
  };
  useRegistrarCambios({ cambios, guardando, guardar, descartar });

  if (error) return <EmptyState variante="error" titulo={t('errorCargar')} onReintentar={cargar} compacto />;
  if (!editado || !original) return <p className="text-sm text-fg-secondary">{t('cargando')}</p>;

  const cambiar = (parcial: Partial<AjustesTransporte>) => setEditado((e) => (e ? { ...e, ...parcial } : e));
  const abrir = (href: string) => (onAbrirEnlace ? onAbrirEnlace(href) : (window.location.href = href));
  const deshabilitado = !puedeEditar;

  // ── Tipos de vehículo ──────────────────────────────────────────────────────
  const activosAntes = new Set(original.tiposVehiculo.filter((x) => x.activo).map((x) => x.codigo));
  const tiposVisibles = editado.tiposVehiculo.filter((x) => x.activo || activosAntes.has(x.codigo));
  const tiposPorAgregar = editado.tiposVehiculo.filter((x) => !x.activo && !activosAntes.has(x.codigo));
  const ponerTipo = (codigo: TipoVehiculo, activo: boolean) =>
    cambiar({ tiposVehiculo: editado.tiposVehiculo.map((x) => (x.codigo === codigo ? { ...x, activo } : x)) });

  // ── Motivos de novedad ─────────────────────────────────────────────────────
  const motivos = editado.motivosNovedad;
  const ponerMotivos = (lista: MotivoNovedad[]) => cambiar({ motivosNovedad: lista });
  const editarMotivo = (id: string, parcial: Partial<MotivoNovedad>) => ponerMotivos(motivos.map((m) => (m.id === id ? { ...m, ...parcial } : m)));
  const mover = (i: number, delta: number) => {
    const j = i + delta;
    if (j < 0 || j >= motivos.length) return;
    const lista = [...motivos];
    [lista[i], lista[j]] = [lista[j], lista[i]];
    ponerMotivos(lista);
  };
  const quedanActivos = (id: string) => motivos.some((m) => m.id !== id && m.activo);
  const agregarMotivo = () => {
    const nombre = (nuevoMotivo ?? '').trim();
    if (!nombre) return;
    const id = idMotivoNuevo(nombre, motivos.map((m) => m.id));
    ponerMotivos([...motivos, { id, nombre, tipo: 'other', gravedad: 'leve', bloqueaVehiculo: false, activo: true }]);
    setNuevoMotivo(null);
  };
  const accionesMotivo = (m: MotivoNovedad, i: number): AccionFila[] => [
    { id: 'subir', etiqueta: t('motivos.subir'), icono: ArrowUp, onSelect: () => mover(i, -1), deshabilitada: deshabilitado || i === 0 },
    { id: 'bajar', etiqueta: t('motivos.bajar'), icono: ArrowDown, onSelect: () => mover(i, 1), deshabilitada: deshabilitado || i === motivos.length - 1 },
    m.activo
      ? {
          id: 'desactivar',
          etiqueta: t('motivos.desactivar'),
          icono: EyeOff,
          onSelect: () => editarMotivo(m.id, { activo: false }),
          deshabilitada: deshabilitado || !quedanActivos(m.id),
          motivo: t('motivos.ultimoActivo'),
          separadorAntes: true,
        }
      : { id: 'activar', etiqueta: t('motivos.activar'), icono: Eye, onSelect: () => editarMotivo(m.id, { activo: true }), deshabilitada: deshabilitado, separadorAntes: true },
    {
      id: 'quitar',
      etiqueta: t('motivos.quitar'),
      icono: Trash2,
      destructiva: true,
      // Solo se quita un motivo recién agregado (sin guardar): los guardados se desactivan, porque
      // nombran novedades viejas (`transport_incidents.metadata.motivo`).
      oculta: m.nombre === '' || !original.motivosNovedad.every((o) => o.id !== m.id),
      onSelect: () => ponerMotivos(motivos.filter((x) => x.id !== m.id)),
      deshabilitada: deshabilitado || (m.activo && !quedanActivos(m.id)),
    },
  ];

  const numero = (id: string, valor: number, min: number, max: number, sufijo: string, onCambio: (v: number) => void, etiqueta: string, ancho = 'w-28') => (
    <label className={`flex ${ancho} flex-col gap-1 text-xs text-fg-secondary`}>
      {etiqueta}
      <CampoNumero id={id} valor={valor} onValorChange={(v) => onCambio(acotar(v, min, max, valor))} decimales={0} minimo={min} maximo={max} sufijo={sufijo} disabled={deshabilitado} />
    </label>
  );

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      {!puedeEditar && <AvisoTonal tono="neutro" titulo={t('soloLectura')} compacto />}

      {/* ── Venta de pasajes y retención ─────────────────────────────────── */}
      <section className="flex flex-col gap-2" aria-labelledby="transporte-pasajes">
        <h3 id="transporte-pasajes" className="text-base font-semibold text-fg">{t('pasajes.titulo')}</h3>
        <SettingGroup etiqueta={t('pasajes.titulo')}>
          <SettingRow titulo={<span id="retencion">{t('pasajes.retencion')}</span>} descripcion={t('pasajes.retencionDescripcion')}>
            <div className="grid grid-cols-3 gap-2">
              {numero('transporte-ret-taquilla', editado.retencion.taquilla, RETENCION_MIN, RETENCION_MAX, 'min', (v) => cambiar({ retencion: { ...editado.retencion, taquilla: v } }), t('pasajes.taquilla'), 'w-24')}
              {numero('transporte-ret-web', editado.retencion.web, RETENCION_MIN, RETENCION_MAX, 'min', (v) => cambiar({ retencion: { ...editado.retencion, web: v } }), t('pasajes.web'), 'w-24')}
              {numero('transporte-ret-pos', editado.retencion.pos, RETENCION_MIN, RETENCION_MAX, 'min', (v) => cambiar({ retencion: { ...editado.retencion, pos: v } }), t('pasajes.pos'), 'w-24')}
            </div>
          </SettingRow>
          <SettingRow titulo={<span id="cambios-anulaciones">{t('pasajes.cambios')}</span>} descripcion={t('pasajes.cambiosDescripcion')}>
            <div className="grid grid-cols-3 gap-2">
              {numero('transporte-cambio', editado.cambioSinCostoMin, 0, CAMBIO_MAX_MIN, t('pasajes.minAntes'), (v) => cambiar({ cambioSinCostoMin: v }), t('pasajes.cambioSinCosto'), 'w-32')}
              {numero('transporte-anulacion', editado.anulacionHoras, 0, ANULACION_MAX_H, t('pasajes.hAntes'), (v) => cambiar({ anulacionHoras: v }), t('pasajes.anulacion'), 'w-28')}
              {numero('transporte-reembolso', editado.reembolsoPct, 0, 100, '%', (v) => cambiar({ reembolsoPct: v }), t('pasajes.reembolso'), 'w-24')}
            </div>
          </SettingRow>
          <SettingRow titulo={t('pasajes.liberar')} descripcion={t('pasajes.liberarDescripcion')} htmlFor="transporte-liberar">
            <Switch id="transporte-liberar" checked={editado.liberarAlVencer} onCheckedChange={(v) => cambiar({ liberarAlVencer: v === true })} disabled={deshabilitado} />
          </SettingRow>
        </SettingGroup>
        <p className="text-xs text-fg-muted">{t('pasajes.nota')}</p>
      </section>

      {/* ── Liquidación ─────────────────────────────────────────────────── */}
      <section id="liquidacion" className="flex flex-col gap-2" aria-labelledby="transporte-liquidacion">
        <div>
          <h3 id="transporte-liquidacion" className="text-base font-semibold text-fg">{t('liquidacion.titulo')}</h3>
          <p className="text-sm text-fg-secondary">{t('liquidacion.descripcion')}</p>
        </div>
        <SettingGroup etiqueta={t('liquidacion.titulo')}>
          <SettingRow titulo={t('liquidacion.conductores')} descripcion={t('liquidacion.conductoresDescripcion')}>
            <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'sm' })} onClick={() => abrir('/app/hrm/nomina')}>
              <ArrowUpRight aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('liquidacion.irRrhh')}
            </button>
          </SettingRow>
          <SettingRow titulo={t('liquidacion.propietarios')} descripcion={t('liquidacion.propietariosDescripcion')}>
            <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'sm' })} onClick={() => abrir('/app/finanzas/cuentas-por-pagar')}>
              <ArrowUpRight aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('liquidacion.irFinanzas')}
            </button>
          </SettingRow>
          <SettingRow titulo={t('liquidacion.administracion')} descripcion={t('liquidacion.administracionDescripcion')} htmlFor="transporte-admin">
            <div className="w-28">
              <CampoNumero
                id="transporte-admin"
                valor={editado.administracionAfiliadosPct}
                onValorChange={(v) => cambiar({ administracionAfiliadosPct: acotar(v, 0, 100, editado.administracionAfiliadosPct) })}
                decimales={0}
                minimo={0}
                maximo={100}
                sufijo="%"
                disabled={deshabilitado}
              />
            </div>
          </SettingRow>
        </SettingGroup>
      </section>

      {/* ── RNDC ────────────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-2" aria-labelledby="transporte-rndc">
        <h3 id="transporte-rndc" className="text-base font-semibold text-fg">{t('rndc.titulo')}</h3>
        <TarjetaEnlaceConfig id="rndc" icono={Link2} texto={t('rndc.descripcion')} enlaces={[{ etiqueta: t('rndc.accion'), onClick: () => abrir('/app/integraciones/conexiones') }]} />
      </section>

      {/* ── Tipos de vehículo ───────────────────────────────────────────── */}
      <section id="tipos-vehiculo" className="flex flex-col gap-2" aria-labelledby="transporte-tipos">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 id="transporte-tipos" className="text-base font-semibold text-fg">{t('tipos.titulo')}</h3>
            <p className="text-sm text-fg-secondary">{t('tipos.descripcion')}</p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild disabled={deshabilitado || tiposPorAgregar.length === 0}>
              <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
                <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('tipos.agregar')}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {tiposPorAgregar.map((x) => (
                <DropdownMenuItem key={x.codigo} onSelect={() => ponerTipo(x.codigo, true)}>
                  {tm(`tiposVehiculo.${x.codigo}`)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full min-w-[480px] text-sm">
            <caption className="sr-only">{t('tipos.titulo')}</caption>
            <thead>
              <tr className="border-b border-line text-left text-xs font-medium text-fg-muted">
                <th scope="col" className="px-4 py-2 font-medium">{t('tipos.tipo')}</th>
                <th scope="col" className="px-4 py-2 font-medium">{t('tipos.codigo')}</th>
                <th scope="col" className="px-4 py-2 font-medium">{t('tipos.uso')}</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">{t('tipos.activo')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {tiposVisibles.map((x) => {
                const Icono = ICONO_TIPO[x.codigo];
                return (
                  <tr key={x.codigo}>
                    <td className="px-4 py-2.5">
                      <span className="flex items-center gap-2 font-medium text-fg">
                        <Icono aria-hidden="true" className="size-4 text-fg-muted" strokeWidth={1.5} />
                        {tm(`tiposVehiculo.${x.codigo}`)}
                        {EMBARCACIONES.includes(x.codigo) && <StatusBadge estado="nuevo" tono="marca" apariencia="contorno" etiqueta={t('tipos.nuevo')} />}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-fg-muted">{x.codigo}</td>
                    <td className="px-4 py-2.5 text-fg">{t(`tipos.usos.${USO_TIPO_VEHICULO[x.codigo]}`)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <Switch
                        checked={x.activo}
                        onCheckedChange={(v) => ponerTipo(x.codigo, v === true)}
                        disabled={deshabilitado || (x.activo && editado.tiposVehiculo.filter((y) => y.activo).length === 1)}
                        aria-label={t('tipos.activoDe', { tipo: tm(`tiposVehiculo.${x.codigo}`) })}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Motivos de novedad ──────────────────────────────────────────── */}
      <section id="motivos-novedad" className="flex flex-col gap-2" aria-labelledby="transporte-motivos">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 id="transporte-motivos" className="text-base font-semibold text-fg">{t('motivos.titulo')}</h3>
            <p className="text-sm text-fg-secondary">{t('motivos.descripcion')}</p>
          </div>
          <button
            type="button"
            className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}
            onClick={() => setNuevoMotivo('')}
            disabled={deshabilitado || nuevoMotivo !== null || motivos.length >= MAX_MOTIVOS}
          >
            <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {t('motivos.agregar')}
          </button>
        </div>
        <ul className="divide-y divide-line rounded-lg border border-line bg-surface" aria-label={t('motivos.titulo')}>
          {motivos.map((m, i) => (
            <li key={m.id} className={`flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 ${m.activo ? '' : 'opacity-60'}`}>
              <GripVertical aria-hidden="true" className="size-4 shrink-0 text-fg-muted" strokeWidth={1.5} />
              <Input
                value={m.nombre || nombreMotivo(tm, m)}
                onChange={(e) => editarMotivo(m.id, { nombre: e.target.value.slice(0, MAX_NOMBRE_MOTIVO) })}
                aria-label={t('motivos.nombreDe', { n: i + 1 })}
                disabled={deshabilitado}
                className="h-8 min-w-0 flex-1 basis-40 border-transparent bg-transparent px-1 text-sm text-fg hover:border-line focus-visible:border-line-strong"
              />
              {!m.activo && <StatusBadge estado="inactivo" tono="neutro" etiqueta={t('motivos.inactivo')} />}
              <Select value={m.gravedad} onValueChange={(v) => editarMotivo(m.id, { gravedad: v as Gravedad })} disabled={deshabilitado}>
                <SelectTrigger className="h-8 w-auto gap-1 border-transparent bg-transparent px-1" aria-label={t('motivos.gravedadDe', { motivo: m.nombre || nombreMotivo(tm, m) })}>
                  <SelectValue>
                    <StatusBadge estado={m.gravedad} tono={TONO_GRAVEDAD[m.gravedad]} apariencia="contorno" etiqueta={t(`motivos.gravedades.${m.gravedad}`)} />
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {GRAVEDADES.map((g) => (
                    <SelectItem key={g} value={g}>
                      {t(`motivos.gravedades.${g}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <label className="flex items-center gap-2 text-xs text-fg-muted">
                {t('motivos.bloquea')}
                <Switch checked={m.bloqueaVehiculo} onCheckedChange={(v) => editarMotivo(m.id, { bloqueaVehiculo: v === true })} disabled={deshabilitado} />
              </label>
              <RowActionsMenu acciones={accionesMotivo(m, i)} titulo={m.nombre || nombreMotivo(tm, m)} />
            </li>
          ))}
          {nuevoMotivo !== null && (
            <li className="flex flex-wrap items-center gap-2 px-3 py-2.5">
              <Input
                autoFocus
                value={nuevoMotivo}
                onChange={(e) => setNuevoMotivo(e.target.value.slice(0, MAX_NOMBRE_MOTIVO))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    agregarMotivo();
                  }
                  if (e.key === 'Escape') setNuevoMotivo(null);
                }}
                placeholder={t('motivos.placeholder')}
                aria-label={t('motivos.nuevo')}
                className="h-8 min-w-0 flex-1 basis-48"
              />
              <button type="button" className={clasesBoton({ variante: 'primario', tamano: 'sm' })} onClick={agregarMotivo} disabled={!nuevoMotivo.trim()}>
                {t('motivos.anadir')}
              </button>
              <button type="button" className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })} onClick={() => setNuevoMotivo(null)}>
                {t('motivos.cancelar')}
              </button>
            </li>
          )}
        </ul>
      </section>

      {/* ── Excepciones al bloqueo de despacho ──────────────────────────── */}
      <section id="excepciones" className="flex flex-col gap-2" aria-labelledby="transporte-excepciones">
        <div>
          <h3 id="transporte-excepciones" className="text-base font-semibold text-fg">{t('excepciones.titulo')}</h3>
          <p className="text-sm text-fg-secondary">{t('excepciones.descripcion')}</p>
        </div>
        <SettingGroup etiqueta={t('excepciones.titulo')}>
          <SettingRow titulo={t('excepciones.quien')} descripcion={t('excepciones.quienDescripcion')}>
            <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'sm' })} onClick={() => abrirConfiguracion({ seccionId: 'roles.general' })}>
              <ArrowUpRight aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('excepciones.irRoles')}
            </button>
          </SettingRow>
          {(
            [
              ['documentosVehiculo', 'vehiculo'],
              ['documentosConductor', 'conductor'],
              ['manifiesto', 'manifiesto'],
              ['pedirPin', 'pin'],
            ] as const
          ).map(([clave, texto]) => (
            <SettingRow key={clave} titulo={t(`excepciones.${texto}`)} descripcion={t(`excepciones.${texto}Descripcion`)} htmlFor={`transporte-exc-${clave}`}>
              <Switch
                id={`transporte-exc-${clave}`}
                checked={editado.excepciones[clave]}
                onCheckedChange={(v) => cambiar({ excepciones: { ...editado.excepciones, [clave]: v === true } })}
                disabled={deshabilitado}
              />
            </SettingRow>
          ))}
        </SettingGroup>
      </section>

      {!enDialogo && puedeEditar && <SettingsSaveBar cambios={cambios} onGuardar={() => void guardar()} onDescartar={descartar} guardando={guardando} />}
    </div>
  );
}
