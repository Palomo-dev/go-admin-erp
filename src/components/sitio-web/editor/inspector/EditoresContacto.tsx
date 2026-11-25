'use client';

/**
 * Editores de la página «Contacto v2 editable» (Figma «16 Sitio web», 3104:84056; aprobado el
 * 2026-11-24):
 * - {@link EditorCamposContacto}: Formulario › Contenido › «Campos del formulario» (3108:85760):
 *   etiqueta editable, «Mostrar», «Obligatorio», Asunto como desplegable con opciones, casilla de
 *   tratamiento de datos con enlace a la política y «Añadir campo propio».
 * - {@link EditorCanales}: Canales de contacto › Contenido (3108:86969): cada canal con el dato de
 *   la organización o un texto propio, texto del botón y mensaje inicial de WhatsApp.
 * - {@link EditorRedes}: Redes sociales › Contenido (3112:87143): qué redes mostrar.
 *
 * Solo escriben el `content` de la sección (`form_fields`, `channels`, `networks`): sin columnas
 * nuevas. La lectura de lo guardado es la del contrato, la misma de la tienda.
 * Textos: `sitioWeb.editor.contactoV2.*` (es/en/fr/pt).
 */
import { useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowDown, ArrowUp, ChevronDown, ExternalLink, Facebook, Instagram, Link2, Linkedin, Lock, Mail, MapPin, MessageCircle, Phone, Plus, Share2, Trash2, Twitter, Youtube, type LucideIcon } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { ChipsOpcion, clasesBoton } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { RAIZ_SITIO_WEB } from '@/components/sitio-web/rutasSitioWeb';
import {
  REDES_SOCIALES,
  datosContactoDe,
  redesDelSitio,
  valorDeCanal,
  type CampoContacto,
  type CanalContacto,
  type IdRedSocial,
  type TipoCanal,
  type TipoCampoContacto,
} from '@/lib/website/contrato/paginaContacto';
import { CampoChips } from './CamposListas';
import {
  alternarRed,
  anadirCampoPropio,
  anadirCanalPropio,
  cambiarCampo,
  cambiarCanal,
  campoFijo,
  camposAGuardar,
  camposEnEditor,
  canalesAGuardar,
  leerCanales,
  moverCampo,
  moverCanal,
  quitarCampo,
  quitarCanal,
  redesEncendidas,
} from './contactoV2Logica';

/** Configuración › Contacto (WhatsApp, teléfono, correo) y SEO y redes (cuentas). */
export const RUTA_CONFIGURACION_CONTACTO = `${RAIZ_SITIO_WEB}/configuracion`;
export const RUTA_REDES_SITIO = `${RAIZ_SITIO_WEB}/seo`;

function useT() {
  return useTranslations('sitioWeb.editor.contactoV2');
}

const Ayuda = ({ children }: { children: React.ReactNode }) => <p className="text-xs leading-4 text-fg-secondary">{children}</p>;

function EnlaceExterno({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 self-start text-xs font-medium text-brand hover:underline">
      {children}
      <ExternalLink aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
    </a>
  );
}

function BotonesOrden({ i, total, mover, etiqueta }: { i: number; total: number; mover: (paso: -1 | 1) => void; etiqueta: string }) {
  const t = useT();
  return (
    <span className="flex shrink-0 flex-col">
      <button type="button" aria-label={t('subir', { nombre: etiqueta })} disabled={i === 0} onClick={() => mover(-1)} className="rounded p-0.5 text-fg-secondary hover:bg-subtle disabled:opacity-30">
        <ArrowUp aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
      </button>
      <button type="button" aria-label={t('bajar', { nombre: etiqueta })} disabled={i === total - 1} onClick={() => mover(1)} className="rounded p-0.5 text-fg-secondary hover:bg-subtle disabled:opacity-30">
        <ArrowDown aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
      </button>
    </span>
  );
}

// ─── Campos del formulario ─────────────────────────────────────────────────────────────────

const TIPOS_PROPIOS: readonly TipoCampoContacto[] = ['text', 'textarea', 'select', 'checkbox'];

export function EditorCamposContacto({ valor, onCambiar }: { valor: unknown; onCambiar: (v: Record<string, unknown>[]) => void }) {
  const t = useT();
  const { campos, guardados } = camposEnEditor(valor);
  const guardar = (lista: CampoContacto[]) => onCambiar(camposAGuardar(lista));

  return (
    <div className="flex flex-col gap-3" data-editor-campos-contacto="">
      {!guardados && <Ayuda>{t('campos.sinGuardar')}</Ayuda>}
      <div className="grid grid-cols-[16px_1fr_44px_36px] items-center gap-2 text-[11px] font-medium text-fg-secondary">
        <span />
        <span>{t('campos.etiqueta')}</span>
        <span className="text-center">{t('campos.mostrar')}</span>
        <span className="text-center">{t('campos.obligatorio')}</span>
      </div>
      <ul className="flex flex-col gap-2">
        {campos.map((c, i) => {
          const fijo = campoFijo(c);
          return (
            <li key={c.name} className="flex flex-col gap-2">
              <div className="grid grid-cols-[16px_1fr_44px_36px] items-center gap-2">
                <BotonesOrden i={i} total={campos.length} mover={(paso) => guardar(moverCampo(campos, i, paso))} etiqueta={c.label} />
                <Input
                  value={c.label}
                  aria-label={t('campos.etiquetaDe', { nombre: c.label || c.name })}
                  disabled={!c.visible}
                  onChange={(e) => guardar(cambiarCampo(campos, c.name, { label: e.target.value.slice(0, 80) }))}
                  className="h-9 rounded-lg"
                />
                <span className="flex justify-center">
                  {fijo ? (
                    <Lock aria-label={t('campos.siempre')} className="size-4 text-fg-muted" strokeWidth={1.5} />
                  ) : (
                    <Switch checked={c.visible} aria-label={t('campos.mostrarDe', { nombre: c.label })} onCheckedChange={(v) => guardar(cambiarCampo(campos, c.name, { visible: v }))} />
                  )}
                </span>
                <span className="flex justify-center">
                  <Checkbox
                    checked={c.required}
                    disabled={fijo || c.type === 'consent' || !c.visible}
                    aria-label={t('campos.obligatorioDe', { nombre: c.label })}
                    onCheckedChange={(v) => guardar(cambiarCampo(campos, c.name, { required: v === true }))}
                  />
                </span>
              </div>
              {c.visible && c.estandar === 'subject' && (
                <div className="ml-6 flex flex-col gap-2 rounded-lg bg-subtle p-3">
                  <ChipsOpcion
                    etiqueta={t('campos.tipo')}
                    opciones={[{ valor: 'select', etiqueta: t('campos.desplegable') }, { valor: 'text', etiqueta: t('campos.textoLibre') }]}
                    valor={c.type === 'select' ? 'select' : 'text'}
                    onValorChange={(v) => guardar(cambiarCampo(campos, c.name, { type: v as TipoCampoContacto }))}
                  />
                  {c.type === 'select' && (
                    <CampoChips
                      campo={{ key: 'options', label: t('campos.opciones'), type: 'chips', itemType: 'text', maxItems: 12 }}
                      valor={c.options}
                      onCambiar={(v) => guardar(cambiarCampo(campos, c.name, { options: Array.isArray(v) ? v.map(String) : [] }))}
                    />
                  )}
                </div>
              )}
              {c.visible && c.type === 'consent' && (
                <div className="ml-6 flex flex-col gap-2 rounded-lg bg-subtle p-3">
                  <Input value={c.link_label} aria-label={t('campos.textoEnlace')} placeholder={t('campos.textoEnlace')} onChange={(e) => guardar(cambiarCampo(campos, c.name, { link_label: e.target.value.slice(0, 80) }))} className="h-9 rounded-lg" />
                  <Input value={c.link_url} aria-label={t('campos.enlaceA')} placeholder="/privacidad" onChange={(e) => guardar(cambiarCampo(campos, c.name, { link_url: e.target.value.slice(0, 400) }))} className="h-9 rounded-lg" />
                  <Ayuda>{t('campos.casillaObligatoria')}</Ayuda>
                </div>
              )}
              {c.estandar === null && c.type !== 'consent' && (
                <div className="ml-6 flex flex-wrap items-center gap-2">
                  <ChipsOpcion
                    etiqueta={t('campos.tipo')}
                    opciones={TIPOS_PROPIOS.map((tipo) => ({ valor: tipo, etiqueta: t(`campos.tipos.${tipo}`) }))}
                    valor={TIPOS_PROPIOS.includes(c.type) ? c.type : 'text'}
                    onValorChange={(v) => guardar(cambiarCampo(campos, c.name, { type: v }))}
                  />
                  <button type="button" onClick={() => guardar(quitarCampo(campos, c.name))} className={cn(clasesBoton({ variante: 'fantasma', tamano: 'sm' }), 'text-danger')}>
                    <Trash2 aria-hidden="true" className="size-4" strokeWidth={1.5} />
                    {t('quitar')}
                  </button>
                </div>
              )}
              {c.estandar === null && c.type === 'select' && (
                <div className="ml-6">
                  <CampoChips
                    campo={{ key: 'options', label: t('campos.opciones'), type: 'chips', itemType: 'text', maxItems: 12 }}
                    valor={c.options}
                    onCambiar={(v) => guardar(cambiarCampo(campos, c.name, { options: Array.isArray(v) ? v.map(String) : [] }))}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <Ayuda>{t('campos.nombreCorreo')}</Ayuda>
      <button type="button" onClick={() => guardar(anadirCampoPropio(campos, t('campos.campoNuevo')))} className={cn(clasesBoton({ variante: 'secundario', tamano: 'sm' }), 'self-start')}>
        <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
        {t('campos.anadir')}
      </button>
    </div>
  );
}

// ─── Canales ───────────────────────────────────────────────────────────────────────────────

const ICONO_CANAL: Record<TipoCanal, LucideIcon> = { whatsapp: MessageCircle, phone: Phone, email: Mail, address: MapPin, custom: Link2 };

export function EditorCanales({ valor, ajustes, onCambiar }: { valor: unknown; ajustes: Record<string, unknown> | null; onCambiar: (v: Record<string, unknown>[]) => void }) {
  const t = useT();
  const idBase = useId();
  const canales = leerCanales(valor);
  const [abierto, setAbierto] = useState<string | null>(canales[0]?.id ?? null);
  const datos = datosContactoDe(null, ajustes);
  const guardar = (lista: CanalContacto[]) => onCambiar(canalesAGuardar(lista));

  return (
    <div className="flex flex-col gap-2" data-editor-canales="">
      <ul className="flex flex-col gap-2">
        {canales.map((c, i) => {
          const Icono = ICONO_CANAL[c.type];
          const dato = valorDeCanal(c, datos);
          const expandido = abierto === c.id;
          const idPanel = `${idBase}-${c.id}`;
          const cambiar = (cambio: Partial<CanalContacto>) => guardar(cambiarCanal(canales, c.id, cambio));
          return (
            <li key={c.id} className="rounded-lg border border-line">
              <div className="flex items-center gap-2 p-2.5">
                <BotonesOrden i={i} total={canales.length} mover={(paso) => guardar(moverCanal(canales, i, paso))} etiqueta={c.label} />
                <Icono aria-hidden="true" className="size-4 shrink-0 text-fg-secondary" strokeWidth={1.5} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-fg">{c.label || t(`canales.tipos.${c.type}`)}</span>
                  <span className="block truncate text-xs text-fg-secondary">{dato ?? t('canales.sinDato')}</span>
                </span>
                <Switch checked={c.visible} aria-label={t('canales.mostrarDe', { nombre: c.label })} onCheckedChange={(v) => cambiar({ visible: v })} />
                <button type="button" aria-expanded={expandido} aria-controls={idPanel} aria-label={t('canales.editar', { nombre: c.label })} onClick={() => setAbierto(expandido ? null : c.id)} className="rounded p-1 text-fg-secondary hover:bg-subtle">
                  <ChevronDown aria-hidden="true" className={cn('size-4 transition-transform', expandido && 'rotate-180')} strokeWidth={1.5} />
                </button>
              </div>
              {expandido && (
                <div id={idPanel} className="flex flex-col gap-3 border-t border-line p-3">
                  {c.type !== 'custom' && (
                    <>
                      <div className="flex flex-col gap-1 rounded-lg bg-subtle p-2.5">
                        <p className="text-xs text-fg-secondary">{t(`canales.origen.${c.type}`)}</p>
                        <EnlaceExterno href={RUTA_CONFIGURACION_CONTACTO}>{t('canales.editarConfiguracion')}</EnlaceExterno>
                      </div>
                      <ChipsOpcion
                        etiqueta={t('canales.fuente')}
                        opciones={[{ valor: 'org', etiqueta: t('canales.datoOrganizacion') }, { valor: 'own', etiqueta: t('canales.textoPropio') }]}
                        valor={c.source}
                        onValorChange={(v) => cambiar({ source: v as CanalContacto['source'] })}
                      />
                    </>
                  )}
                  {(c.source === 'own' || c.type === 'custom') && (
                    <label className="flex flex-col gap-1 text-xs font-medium text-fg">
                      {t('canales.textoPropio')}
                      <Input value={c.value} onChange={(e) => cambiar({ value: e.target.value.slice(0, 200) })} className="h-9 rounded-lg" />
                      <span className="font-normal text-fg-secondary">{t('canales.soloSeccion')}</span>
                    </label>
                  )}
                  <label className="flex flex-col gap-1 text-xs font-medium text-fg">
                    {t('canales.nombre')}
                    <Input value={c.label} onChange={(e) => cambiar({ label: e.target.value.slice(0, 60) })} className="h-9 rounded-lg" />
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-medium text-fg">
                    {t('canales.ayuda')}
                    <Input value={c.help} onChange={(e) => cambiar({ help: e.target.value.slice(0, 160) })} className="h-9 rounded-lg" />
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-medium text-fg">
                    {t('canales.textoBoton')}
                    <Input value={c.button_text} onChange={(e) => cambiar({ button_text: e.target.value.slice(0, 40) })} className="h-9 rounded-lg" />
                  </label>
                  {c.type === 'whatsapp' && (
                    <label className="flex flex-col gap-1 text-xs font-medium text-fg">
                      {t('canales.mensajeInicial')}
                      <Input value={c.message} onChange={(e) => cambiar({ message: e.target.value.slice(0, 300) })} className="h-9 rounded-lg" />
                      <span className="font-normal text-fg-secondary">{t('canales.mensajeAyuda')}</span>
                    </label>
                  )}
                  {c.type === 'custom' && (
                    <>
                      <label className="flex flex-col gap-1 text-xs font-medium text-fg">
                        {t('canales.enlace')}
                        <Input value={c.url} placeholder="https://… · tel:… · /ruta" onChange={(e) => cambiar({ url: e.target.value.slice(0, 400) })} className="h-9 rounded-lg" />
                      </label>
                      <button type="button" onClick={() => guardar(quitarCanal(canales, c.id))} className={cn(clasesBoton({ variante: 'fantasma', tamano: 'sm' }), 'self-start text-danger')}>
                        <Trash2 aria-hidden="true" className="size-4" strokeWidth={1.5} />
                        {t('quitar')}
                      </button>
                    </>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <button type="button" onClick={() => guardar(anadirCanalPropio(canales, t('canales.canalNuevo')))} className={cn(clasesBoton({ variante: 'secundario', tamano: 'sm' }), 'self-start')}>
        <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
        {t('canales.anadir')}
      </button>
      <Ayuda>{t('canales.anadirAyuda')}</Ayuda>
    </div>
  );
}

// ─── Redes ─────────────────────────────────────────────────────────────────────────────────

const ICONO_RED: Record<IdRedSocial, LucideIcon> = { instagram: Instagram, facebook: Facebook, tiktok: Share2, youtube: Youtube, x: Twitter, linkedin: Linkedin, pinterest: Share2 };

export function EditorRedes({ valor, ajustes, onCambiar }: { valor: unknown; ajustes: Record<string, unknown> | null; onCambiar: (v: IdRedSocial[]) => void }) {
  const t = useT();
  const socialLinks = ajustes?.social_links;
  const delSitio = redesDelSitio(socialLinks);
  const encendidas = redesEncendidas(valor, socialLinks);
  return (
    <div className="flex flex-col gap-3" data-editor-redes="">
      <ul className="flex flex-col gap-2">
        {REDES_SOCIALES.map((red) => {
          const cuenta = delSitio.find((r) => r.id === red.id);
          const Icono = ICONO_RED[red.id];
          return (
            <li key={red.id} className="flex items-center gap-2.5">
              <Icono aria-hidden="true" className={cn('size-4 shrink-0', cuenta ? 'text-fg' : 'text-fg-muted')} strokeWidth={1.5} />
              <span className="min-w-0 flex-1">
                <span className={cn('block text-sm', cuenta ? 'text-fg' : 'text-fg-muted')}>{red.nombre}</span>
                <span className="block truncate text-xs text-fg-secondary">{cuenta ? cuenta.usuario : t('redes.sinConfigurar')}</span>
              </span>
              <Switch
                checked={!!cuenta && encendidas.has(red.id)}
                disabled={!cuenta}
                aria-label={t('redes.mostrarDe', { nombre: red.nombre })}
                onCheckedChange={(v) => onCambiar(alternarRed(valor, socialLinks, red.id, v))}
              />
            </li>
          );
        })}
      </ul>
      <div className="flex flex-col gap-1 rounded-lg bg-subtle p-2.5">
        <p className="text-xs text-fg-secondary">{t('redes.origen')}</p>
        <EnlaceExterno href={RUTA_REDES_SITIO}>{t('redes.editarCuentas')}</EnlaceExterno>
      </div>
    </div>
  );
}
