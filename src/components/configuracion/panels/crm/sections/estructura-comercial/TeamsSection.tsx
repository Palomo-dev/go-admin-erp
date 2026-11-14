'use client';

import { Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { ConfirmDeleteDialog, EmptyState, LoadingSkeleton, SectionHeader } from './shared';
import { TeamCard } from './TeamCard';
import { TeamDialog } from './TeamDialog';
import { TeamMemberDialog } from './TeamMemberDialog';
import { useTeams } from './useTeams';

/** Sección: Equipos comerciales y sus miembros. */
export function TeamsSection() {
  const t = useTranslations('configuracionTextos.teamsSection');
  const s = useTeams();

  return (
    <div className="space-y-3">
      <SectionHeader
        icon={Users}
        title={t('contador', { n: s.teams.length })}
        subtitle={t('subtitulo')}
        loading={s.loading}
        onRefresh={s.load}
        onCreate={s.handleCreate}
        createLabel={t('nuevo')}
      />

      {s.loading ? (
        <LoadingSkeleton />
      ) : s.teams.length === 0 ? (
        <EmptyState
          icon={Users}
          title={t('vacio.titulo')}
          hint={t('vacio.ayuda')}
        />
      ) : (
        <div className="space-y-2">
          {s.teams.map((team) => (
            <TeamCard
              key={team.id}
              team={team}
              expanded={s.expandedTeam === team.id}
              onToggle={() => s.setExpandedTeam(s.expandedTeam === team.id ? null : team.id)}
              onEdit={() => s.handleEdit(team)}
              onDelete={() => s.askDelete(team)}
              onAddMember={s.openMemberDialog}
              onRemoveMember={(memberId) => s.handleRemoveMember(team.id, memberId)}
            />
          ))}
        </div>
      )}

      <TeamDialog
        open={s.dialogOpen}
        onOpenChange={s.setDialogOpen}
        editing={s.editing !== null}
        form={s.form}
        setForm={s.setForm}
        territories={s.territories}
        saving={s.saving}
        onSave={s.handleSave}
      />

      <TeamMemberDialog
        open={s.memberDialogOpen}
        onOpenChange={s.setMemberDialogOpen}
        form={s.memberForm}
        setForm={s.setMemberForm}
        orgMembers={s.orgMembers}
        roles={s.roles}
        territories={s.territories}
        saving={s.saving}
        onSave={s.handleAddMember}
      />

      <ConfirmDeleteDialog
        open={s.deleteDialogOpen}
        onOpenChange={s.setDeleteDialogOpen}
        title={t('eliminar.titulo')}
        description={t('eliminar.descripcion', { nombre: s.toDelete?.name ?? '' })}
        onConfirm={s.confirmDelete}
      />
    </div>
  );
}
