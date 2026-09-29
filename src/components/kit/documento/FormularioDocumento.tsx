'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { CircleAlert, Keyboard } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { Dialogo } from '../Dialogo';
import { Kbd } from '../Kbd';
import { Tarjeta } from '../Tarjeta';
import { useKitT } from '../useIdiomaKit';

/**
 * Estructura del formulario de documento (Figma «Facturas de venta — Nueva y
 * editar v2» `1034:97025`; compra con la misma estructura `1066:105465`).
 * Venta y compra componen ESTAS piezas, cada una con sus campos y botones:
 *
 * 1. `cabecera` (`DocumentoCabecera variante="formulario"`) y `avisos`
 *    (banda del duplicado, resumen de errores, error del servidor).
 * 2. Fila de dos columnas: **Datos del documento** y **tercero** (cliente o
 *    proveedor).
 * 3. **Líneas** a todo el ancho.
 * 4. Abajo a la izquierda los `complementos` (notas y términos, comisión,
 *    retenciones); a la derecha, fijo al desplazar, el `resumen` (totales,
 *    impuestos, atajos).
 *
 * Tableta y móvil: una columna con el tercero primero; en móvil el `pie`
 * (total y primario) queda fijo abajo.
 */
export interface FormularioDocumentoLayoutProps {
  cabecera: ReactNode;
  avisos?: ReactNode;
  datos: ReactNode;
  tercero: ReactNode;
  lineas: ReactNode;
  complementos?: ReactNode;
  resumen: ReactNode;
  /** Barra fija inferior en móvil (total + acción primaria). */
  pieMovil?: ReactNode;
  /** Diálogos del formulario (se montan al final). */
  dialogos?: ReactNode;
  className?: string;
}

export function FormularioDocumentoLayout({ cabecera, avisos, datos, tercero, lineas, complementos, resumen, pieMovil, dialogos, className }: FormularioDocumentoLayoutProps) {
  return (
    <div className={cn('flex flex-col gap-4 pb-24 lg:gap-5 lg:pb-8', className)}>
      {cabecera}
      {avisos}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:gap-5">
        <div className="order-2 min-w-0 lg:order-1">{datos}</div>
        <div className="order-1 min-w-0 lg:order-2">{tercero}</div>
      </div>
      <div className="min-w-0">{lineas}</div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:gap-5">
        <div className="flex min-w-0 flex-col gap-4 lg:gap-5">{complementos}</div>
        <div className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-4 lg:self-start">{resumen}</div>
      </div>
      {pieMovil && (
        <div className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-3 border-t border-line bg-surface px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-lg lg:hidden">
          {pieMovil}
        </div>
      )}
      {dialogos}
    </div>
  );
}

/** Error de validación con el id del campo al que lleva su enlace. */
export interface ErrorFormulario {
  campo: string;
  /** Id del control (se enfoca y se desplaza al pulsar el enlace). */
  idControl?: string;
  mensaje: string;
}

/**
 * «Revisa 3 campos» arriba del formulario (mejora M4): cada error enlaza a su
 * campo. Se anuncia (`role="alert"`) y recibe el foco al aparecer.
 */
export function ResumenErrores({ errores, titulo, className }: { errores: readonly ErrorFormulario[]; titulo?: string; className?: string }) {
  const t = useKitT();
  const ref = useRef<HTMLDivElement | null>(null);
  const hay = errores.length > 0;
  useEffect(() => {
    if (hay) ref.current?.focus();
  }, [hay]);
  if (!hay) return null;
  const ir = (e: ErrorFormulario) => {
    const el = e.idControl ? document.getElementById(e.idControl) : null;
    if (!el) return;
    el.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    (el as HTMLElement).focus?.();
  };
  return (
    <div ref={ref} tabIndex={-1} role="alert" className={cn('flex flex-col gap-2 rounded-lg border border-line-danger bg-danger-subtle px-4 py-3 text-sm text-danger-text outline-none', className)}>
      <p className="flex items-center gap-2 font-medium">
        <CircleAlert aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.5} />
        {titulo ?? t('documentoEdicion.errores.revisa', { n: errores.length })}
      </p>
      <ul className="flex flex-col gap-1 pl-6">
        {errores.map((e) => (
          <li key={`${e.campo}-${e.mensaje}`}>
            {e.idControl ? (
              <button type="button" onClick={() => ir(e)} className="text-left underline underline-offset-2 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
                {e.mensaje}
              </button>
            ) : (
              e.mensaje
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * «Salir con cambios» (Figma `1036:103966`): Seguir editando (Esc) · Salir sin
 * guardar · Guardar borrador y salir (primario). El mismo en venta y compra
 * (compra usaba `window.confirm`).
 */
export function DialogoSalirConCambios({
  abierto,
  onAbiertoChange,
  onSalir,
  onGuardarYSalir,
  guardando,
  textoGuardar,
}: {
  abierto: boolean;
  onAbiertoChange: (v: boolean) => void;
  onSalir: () => void;
  onGuardarYSalir?: () => void;
  guardando?: boolean;
  textoGuardar?: string;
}) {
  const t = useKitT();
  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={t('documentoEdicion.salir.titulo')}
      descripcion={t('documentoEdicion.salir.descripcion')}
      textoCancelar={t('documentoEdicion.salir.seguir')}
      ancho={560}
      secundarios={onGuardarYSalir ? [{ etiqueta: t('documentoEdicion.salir.salirSinGuardar'), onClick: onSalir, deshabilitada: guardando }] : undefined}
      primario={
        onGuardarYSalir
          ? { etiqueta: textoGuardar ?? t('documentoEdicion.salir.guardarYSalir'), onClick: onGuardarYSalir, cargando: guardando }
          : { etiqueta: t('documentoEdicion.salir.salirSinGuardar'), onClick: onSalir, destructiva: true }
      }
    />
  );
}

/** Aviso del navegador al cerrar o recargar la pestaña con cambios sin guardar. */
export function useAvisoSalida(sucio: boolean): void {
  const ref = useRef(sucio);
  ref.current = sucio;
  useEffect(() => {
    const aviso = (e: BeforeUnloadEvent) => {
      if (!ref.current) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', aviso);
    return () => window.removeEventListener('beforeunload', aviso);
  }, []);
}

/**
 * Guardado automático del borrador (M13, decisión 3): cada `intervaloMs`
 * mientras `activo` (el borrador YA existe) y haya cambios, sin toast. Un
 * guardado en curso no se solapa con el siguiente.
 */
export function useAutoguardado({ activo, sucio, guardar, intervaloMs = 30_000 }: { activo: boolean; sucio: boolean; guardar: () => Promise<unknown>; intervaloMs?: number }): void {
  const sucioRef = useRef(sucio);
  sucioRef.current = sucio;
  const guardarRef = useRef(guardar);
  guardarRef.current = guardar;
  const enCurso = useRef(false);
  useEffect(() => {
    if (!activo) return;
    const id = window.setInterval(() => {
      if (!sucioRef.current || enCurso.current) return;
      enCurso.current = true;
      guardarRef
        .current()
        .catch(() => undefined)
        .finally(() => {
          enCurso.current = false;
        });
    }, intervaloMs);
    return () => window.clearInterval(id);
  }, [activo, intervaloMs]);
}

/** Tarjeta «Atajos» del resumen (Figma: bajo los totales). */
export function TarjetaAtajos({ atajos }: { atajos: readonly { tecla: string; descripcion: string }[] }) {
  const t = useKitT();
  return (
    <Tarjeta titulo={t('documentoEdicion.atajos.titulo')} icono={Keyboard} className="hidden lg:flex">
      <dl className="flex flex-col gap-1.5 text-[13px]">
        {atajos.map((a) => (
          <div key={a.tecla} className="flex items-center justify-between gap-3">
            <dt className="text-fg-secondary">{a.descripcion}</dt>
            <dd>
              <Kbd tecla={a.tecla} />
              <span className="sr-only">{a.tecla}</span>
            </dd>
          </div>
        ))}
      </dl>
    </Tarjeta>
  );
}
