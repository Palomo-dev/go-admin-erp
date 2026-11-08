'use client';

/**
 * Vincular con otra organización (Figma R6 `2406:147546`, captura
 * `docs/design/figma/89-consignacion-recibida-06-vincular-organizacion.png`).
 * Invitación con enlace de UN SOLO USO que vence en 7 días; queda amarrada a un
 * tercero propio. La base guarda solo el hash del token; el enlace se muestra
 * una vez para copiarlo y enviarlo. No hay buscador de organizaciones.
 */
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Copy, Link2 } from 'lucide-react';
import { AvisoTonal, Dialogo, FormField, StatusBadge, clasesBoton } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { toastSuccess } from '@/components/ui/use-toast';
import { ElegirProveedor, type ProveedorDocumento } from '@/components/finanzas/documento/terceros';
import { textoErrorSaldo } from '@/components/finanzas/saldos-a-favor/textosSaldo';
import { consignacionesRecibidasService } from './consignacionesRecibidasService';

const NS = 'consignacionesR4';

export function VincularOrganizacionDialog({ abierto, onAbiertoChange }: { abierto: boolean; onAbiertoChange: (v: boolean) => void }) {
  const t = useTranslations(NS);
  const [proveedor, setProveedor] = useState<ProveedorDocumento | null>(null);
  const [correo, setCorreo] = useState('');
  const [enlace, setEnlace] = useState<string | null>(null);
  const [tocado, setTocado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!abierto) return;
    setProveedor(null);
    setCorreo('');
    setEnlace(null);
    setTocado(false);
    setError(null);
  }, [abierto]);

  const correoValido = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo.trim());

  const invitar = async () => {
    setTocado(true);
    if (!proveedor || !correoValido) return;
    setEnviando(true);
    setError(null);
    try {
      const r = await consignacionesRecibidasService.invitar({ proveedor_id: Number(proveedor.id), correo: correo.trim() });
      setEnlace(`${window.location.origin}${r.enlace}`);
    } catch (e) {
      setError(textoErrorSaldo(t, e));
    } finally {
      setEnviando(false);
    }
  };

  const copiar = async () => {
    if (!enlace) return;
    await navigator.clipboard.writeText(enlace);
    toastSuccess(t('vincular.copiado'));
  };

  const filas: { texto: string; si: boolean }[] = [
    { texto: t('vincular.comparte.notas'), si: true },
    { texto: t('vincular.comparte.productos'), si: true },
    { texto: t('vincular.comparte.movimientos'), si: true },
    { texto: t('vincular.comparte.nunca'), si: false },
  ];

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={(v) => !enviando && onAbiertoChange(v)}
      titulo={t('vincular.titulo')}
      descripcion={t('vincular.descripcion')}
      icono={Link2}
      ancho={560}
      primario={enlace ? { etiqueta: t('vincular.listo'), onClick: () => onAbiertoChange(false) } : { etiqueta: t('vincular.enviar'), onClick: () => void invitar(), cargando: enviando }}
    >
      <div className="flex flex-col gap-4">
        <FormField etiqueta={t('vincular.tercero')} obligatorio ayuda={t('vincular.terceroAyuda')} error={tocado && !proveedor ? t('validacion.consignante') : null}>
          {(c) => <ElegirProveedor layout="campo" id={c.id} proveedor={proveedor} onCambiar={setProveedor} onQuitar={() => setProveedor(null)} deshabilitado={!!enlace} />}
        </FormField>
        <FormField etiqueta={t('vincular.correo')} obligatorio error={tocado && !correoValido ? t('validacion.correo') : null}>
          <Input type="email" value={correo} maxLength={254} disabled={!!enlace} onChange={(e) => setCorreo(e.target.value)} placeholder="gerencia@ejemplo.co" />
        </FormField>

        <div className="overflow-hidden rounded-lg border border-line">
          <p className="bg-subtle px-3 py-2 text-xs font-medium text-fg-secondary">{t('vincular.queSeComparte')}</p>
          <ul>
            {filas.map((f) => (
              <li key={f.texto} className="flex items-center justify-between gap-3 border-t border-line px-3 py-2 text-sm text-fg">
                <span>{f.texto}</span>
                <StatusBadge estado={f.si ? 'completado' : 'rechazado'} etiqueta={f.si ? t('vincular.si') : t('vincular.nunca')} />
              </li>
            ))}
          </ul>
        </div>

        {enlace && (
          <FormField etiqueta={t('vincular.enlace')} ayuda={t('vincular.enlaceAyuda')}>
            <div className="flex gap-2">
              <Input readOnly value={enlace} className="font-mono text-xs" />
              <button type="button" onClick={() => void copiar()} className={clasesBoton({ variante: 'secundario' })}>
                <Copy aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('vincular.copiar')}
              </button>
            </div>
          </FormField>
        )}
        <AvisoTonal tono="informacion" titulo={t('vincular.sinGoAdminTitulo')} descripcion={t('vincular.sinGoAdmin')} />
        {error && (
          <p role="alert" className="text-sm text-danger-text">
            {error}
          </p>
        )}
      </div>
    </Dialogo>
  );
}
