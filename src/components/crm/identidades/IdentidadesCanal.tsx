'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { clasesBoton } from '@/components/kit/botonClases';
import { PanelAdaptable } from '@/components/kit/PanelAdaptable';
import { Dialogo } from '@/components/kit/Dialogo';
import type { IdentidadReal } from './IdentidadesService';

export function IdentidadesCanal({
  rows,
  canEdit,
  ocupado,
  onEditar,
  onEliminar,
}: {
  rows: IdentidadReal[];
  canEdit: boolean;
  ocupado: boolean;
  onEditar: (id: string, value: string, verified: boolean) => Promise<boolean>;
  onEliminar: (id: string) => Promise<boolean>;
}) {
  const t = useTranslations('crm.identidades');
  const { formatDateTime } = useFormatDate();
  const [editing, setEditing] = useState<IdentidadReal | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [value, setValue] = useState('');
  const [verified, setVerified] = useState(false);
  return (
    <>
      <div className="overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full min-w-[700px] text-sm">
          <caption className="sr-only">{t('canales')}</caption>
          <thead className="bg-subtle text-fg-secondary">
            <tr>
              {[
                'cliente',
                'canal',
                'valor',
                'verificada',
                'ultima',
                'accion',
              ].map((key) => (
                <th
                  key={key}
                  scope="col"
                  className="p-4 text-left text-xs font-medium"
                >
                  {t(key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-line text-fg">
                <td className="p-4">
                  {row.customer?.full_name ?? t('sinNombre')}
                </td>
                <td className="p-4">{row.channel?.name ?? '—'}</td>
                <td className="p-4 break-all">{row.identity_value}</td>
                <td className="p-4">{t(row.verified ? 'si' : 'no')}</td>
                <td className="p-4 text-fg-secondary">
                  {formatDateTime(row.last_seen_at)}
                </td>
                <td className="p-4">
                  {canEdit && (
                    <div className="flex gap-2">
                      <button
                        disabled={ocupado}
                        className={clasesBoton({
                          variante: 'secundario',
                          tamano: 'sm',
                        })}
                        onClick={() => {
                          setEditing(row);
                          setValue(row.identity_value);
                          setVerified(row.verified);
                        }}
                      >
                        {t('editar')}
                      </button>
                      <button
                        disabled={ocupado}
                        className={clasesBoton({
                          variante: 'fantasma',
                          tamano: 'sm',
                        })}
                        onClick={() => setDeleting(row.id)}
                      >
                        {t('eliminar')}
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <PanelAdaptable
        abierto={!!editing}
        onAbiertoChange={() => !ocupado && setEditing(null)}
        ocupado={ocupado}
        titulo={t('editarIdentidad')}
        pie={
          <button
            className={clasesBoton()}
            disabled={ocupado || !value.trim()}
            onClick={async () => {
              if (editing && (await onEditar(editing.id, value, verified)))
                setEditing(null);
            }}
          >
            {t(ocupado ? 'guardando' : 'guardar')}
          </button>
        }
      >
        <div className="space-y-4 px-5 py-4">
          <label className="block text-sm text-fg">
            {t('valor')}
            <input
              autoFocus
              maxLength={256}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="mt-2 h-10 w-full rounded-lg border border-line-strong bg-surface px-3"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-fg">
            <input
              type="checkbox"
              checked={verified}
              disabled={ocupado}
              onChange={(e) => setVerified(e.target.checked)}
            />
            {t('verificada')}
          </label>
        </div>
      </PanelAdaptable>
      <Dialogo
        abierto={!!deleting}
        onAbiertoChange={() => !ocupado && setDeleting(null)}
        titulo={t('eliminarIdentidad')}
        descripcion={t('avisoEliminar')}
        primario={{
          etiqueta: t('eliminar'),
          destructiva: true,
          cargando: ocupado,
          onClick: async () => {
            if (deleting && (await onEliminar(deleting))) setDeleting(null);
          },
        }}
      />
    </>
  );
}
