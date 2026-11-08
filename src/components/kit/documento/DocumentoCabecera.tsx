'use client';

import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { PageHeader, type PageHeaderMovil } from '../PageHeader';
import { StatusBadge } from '../StatusBadge';
import { RowActionsMenu } from '../RowActionsMenu';
import type { AccionFila } from '../acciones';
import type { Miga } from '../Breadcrumbs';
import { ICONO_DOCUMENTO, type TipoDocumento } from './documentos';

/**
 * Cabecera de un documento (Figma `DocumentHeader`, Variant detalle ·
 * formulario × Layout desktop · mobile): `PageHeader` con el icono del tipo,
 * el estado (`StatusBadge`) y las insignias del documento (DIAN, documento
 * soporte, origen) junto al título. En `debajo` va la cadena del documento
 * o las pestañas; en móvil el `PageHeader` publica título y acción en el
 * `MobileHeader`.
 *
 * Una sola primaria en `acciones` («Registrar pago» en el detalle, «Emitir
 * factura» / «Confirmar factura» en el formulario); el resto en «⋯».
 *
 * Móvil (< lg, Figma `20-facturas-movil-detalle`): la cabecera de escritorio
 * no se dibuja, así que `acciones` NO se ve. Con `accionesMovil` el detalle
 * publica «⋯» (`menu`) en el MobileHeader y pinta bajo él el estado y la fila
 * de botones (`principales`: «Registrar pago» + «PDF»). Sin `accionesMovil`
 * nada cambia (formularios: su pie móvil ya lleva las acciones).
 */
export interface DocumentoAccionesMovil {
  /** Fila de botones bajo el estado (una primaria y, como mucho, una secundaria). */
  principales?: ReactNode;
  /** Resto de acciones: van al «⋯» del MobileHeader. */
  menu?: readonly AccionFila[];
}

export interface DocumentoCabeceraProps {
  variante?: 'detalle' | 'formulario';
  /** Define el icono (CATALOGO-ICONOS) si no se pasa `icono`. */
  tipo?: TipoDocumento;
  icono?: LucideIcon;
  /** «Factura FV-00042», «Nueva factura de compra». */
  titulo: string;
  /** «Cliente · 12 sep 2026» (fecha ya formateada en la zona de la organización). */
  subtitulo?: ReactNode;
  migas?: readonly Miga[];
  /** Estado del documento (`issued`, `paid`, «Vencida 12 d»). */
  estado?: string | null;
  /** Chips junto al estado: DIAN, documento soporte, origen. */
  insignias?: ReactNode;
  acciones?: ReactNode;
  /** Formulario: a dónde vuelve «←». */
  volverA?: string;
  /** Formulario: «←» pasa por la pantalla (confirmar si hay cambios). */
  onVolver?: () => void;
  cargando?: boolean;
  /** Cadena del documento, `TabBar` o `BranchBadgeActiva`. */
  debajo?: ReactNode;
  movil?: PageHeaderMovil | false;
  /** Acciones del detalle en móvil; ver arriba. */
  accionesMovil?: DocumentoAccionesMovil;
  className?: string;
}

export function DocumentoCabecera({
  variante = 'detalle',
  tipo,
  icono,
  titulo,
  subtitulo,
  migas,
  estado,
  insignias,
  acciones,
  volverA,
  onVolver,
  cargando,
  debajo,
  movil,
  accionesMovil,
  className,
}: DocumentoCabeceraProps) {
  const Icono = icono ?? (tipo ? ICONO_DOCUMENTO[tipo] : undefined);
  const badge =
    estado || insignias ? (
      <span className="flex flex-wrap items-center gap-1.5">
        {estado && <StatusBadge estado={estado} />}
        {insignias}
      </span>
    ) : undefined;
  // `movil.accionesEnFila`: los mismos botones de `acciones` en la fila móvil (con el estado).
  const enFila = movil !== false && movil?.accionesEnFila === true;
  const movilDoc: DocumentoAccionesMovil | undefined = accionesMovil ?? (enFila ? { principales: acciones } : undefined);
  const movilBase: PageHeaderMovil | false | undefined = enFila && movil ? { ...movil, accionesEnFila: false } : movil;
  const conMovil = movil !== false && movilDoc !== undefined;
  const menuMovil = movilDoc?.menu?.filter((a) => !a.oculta) ?? [];
  const movilFinal: PageHeaderMovil | false | undefined =
    movilBase === false || !conMovil
      ? movilBase
      : {
          ...movilBase,
          accion:
            movilBase?.accion ??
            (menuMovil.length > 0 ? <RowActionsMenu acciones={menuMovil} orientacion="horizontal" titulo={titulo} /> : undefined),
        };
  const bloqueMovil =
    conMovil && (badge || movilDoc?.principales) ? (
      <div className="flex w-full basis-full flex-col gap-3 lg:hidden">
        {badge}
        {movilDoc?.principales && (
          // Fila propia (una primaria + una secundaria): mitades iguales. En fila, los botones tal cual.
          <div className={accionesMovil ? 'flex items-stretch gap-2 [&>*]:flex-1' : 'flex flex-wrap items-center gap-2'}>{movilDoc.principales}</div>
        )}
      </div>
    ) : null;

  const cabecera = (
    <PageHeader
      variante={variante === 'formulario' ? 'form' : 'detail'}
      titulo={titulo}
      subtitulo={subtitulo}
      icono={Icono}
      migas={migas}
      badge={badge}
      acciones={acciones}
      volverA={volverA}
      onVolver={onVolver}
      cargando={cargando}
      debajo={
        bloqueMovil && debajo ? (
          <>
            {bloqueMovil}
            {debajo}
          </>
        ) : (
          debajo
        )
      }
      movil={movilFinal}
      className={className}
    />
  );
  // Sin `debajo`, el bloque va aparte: dentro dejaría en escritorio una fila vacía (y su hueco).
  return bloqueMovil && !debajo ? (
    <>
      {cabecera}
      {bloqueMovil}
    </>
  ) : (
    cabecera
  );
}
