'use client';
import { Mail, Phone, Hash, Merge } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { AvatarIniciales } from '@/components/kit/AvatarIniciales';
import { clasesBoton } from '@/components/kit/botonClases';
import type { GrupoDuplicado } from '@/lib/services/crm/customerDuplicatesLogica';

export function DuplicadosPanel({
  groups,
  canMerge,
  ocupado,
  onComparar,
  onExcluir,
}: {
  groups: GrupoDuplicado[];
  canMerge: boolean;
  ocupado: boolean;
  onComparar: (group: GrupoDuplicado) => void;
  onExcluir: (group: GrupoDuplicado) => void;
}) {
  const t = useTranslations('crm.identidades');
  return (
    <div className="space-y-3">
      {groups.map((group) => {
        const Icono =
          group.identity_type === 'phone'
            ? Phone
            : group.identity_type === 'email'
              ? Mail
              : Hash;
        return (
          <article
            key={group.customers.map((c) => c.id).join(':')}
            className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-4 xl:flex-row xl:items-center"
          >
            <div className="xl:w-64 xl:shrink-0">
              <p className="flex items-center gap-2 text-sm font-medium text-fg">
                <Icono className="size-4 shrink-0" aria-hidden="true" />
                {t(`tipos.${group.identity_type}`)}{' '}
                <span className="break-all">{group.identity_value}</span>
              </p>
              <span className="mt-1 inline-block rounded-full border border-line-warning bg-warning-subtle px-2 text-xs font-semibold text-warning-text">
                {t(group.identity_type === 'document' ? 'alta' : 'media')}
              </span>
            </div>
            {group.customers.map((c) => (
              <div
                key={c.id}
                className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg bg-subtle p-2.5"
              >
                <AvatarIniciales nombre={c.full_name ?? t('sinNombre')} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-fg">
                    {c.full_name ?? t('sinNombre')}
                  </p>
                  <p className="text-xs text-fg-secondary">
                    {t('relaciones', {
                      conversations: c.conversations_count,
                      opportunities: c.opportunities_count,
                    })}
                  </p>
                </div>
              </div>
            ))}
            {canMerge && (
              <div className="flex flex-wrap gap-2">
                <button
                  className={clasesBoton({
                    variante: 'fantasma',
                    tamano: 'sm',
                  })}
                  disabled={ocupado}
                  onClick={() => onExcluir(group)}
                >
                  {t('excluir')}
                </button>
                <button
                  className={clasesBoton({ tamano: 'sm' })}
                  disabled={ocupado}
                  onClick={() => onComparar(group)}
                >
                  <Merge className="size-4" aria-hidden="true" />
                  {t('comparar')}
                </button>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
