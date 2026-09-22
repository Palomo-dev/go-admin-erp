'use client';

import { Users } from 'lucide-react';
import { ConfirmDeleteDialog, EmptyState, LoadingSkeleton, SectionHeader } from './shared';
import { TeamCard } from './TeamCard';
import { TeamDialog } from './TeamDialog';
import { TeamMemberDialog } from './TeamMemberDialog';
import { useTeams } from './useTeams';

/** Sección: Equipos comerciales y sus miembros. */
export function TeamsSection() {
  const s = useTeams();

  return (
    <div className="space-y-3">
      <SectionHeader
        icon={Users}
        title={`${s.teams.length} equipo${s.teams.length !== 1 ? 's' : ''}`}
        subtitle="Gestiona equipos comerciales y sus miembros"
        loading={s.loading}
        onRefresh={s.load}
        onCreate={s.handleCreate}
        createLabel="Nuevo Equipo"
      />

      {s.loading ? (
        <LoadingSkeleton />
      ) : s.teams.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No hay equipos configurados"
          hint="Crea equipos para agrupar vendedores por línea o región"
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
        title="¿Eliminar equipo?"
        description={
          <>Esta acción eliminará el equipo &quot;{s.toDelete?.name}&quot; y todos sus miembros.</>
        }
        onConfirm={s.confirmDelete}
      />
    </div>
  );
}
