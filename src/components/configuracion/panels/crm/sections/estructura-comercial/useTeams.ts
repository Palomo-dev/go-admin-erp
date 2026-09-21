import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { db } from './db';
import type { OrgMember, SalesRole, SalesTeam, Territory } from './types';

export interface TeamForm {
  name: string;
  description: string;
  is_active: boolean;
  territory_id: string;
}

export interface MemberForm {
  user_id: string;
  sales_role_id: string;
  quota_amount: string;
  quota_currency: string;
  territory_id: string;
}

const EMPTY_TEAM: TeamForm = { name: '', description: '', is_active: true, territory_id: '' };
export const EMPTY_MEMBER: MemberForm = {
  user_id: '',
  sales_role_id: '',
  quota_amount: '',
  quota_currency: 'COP',
  territory_id: '',
};

/** Estado y acciones de la sección de equipos: equipos, miembros y catálogos. */
export function useTeams() {
  const { toast } = useToast();
  const [teams, setTeams] = useState<SalesTeam[]>([]);
  const [roles, setRoles] = useState<SalesRole[]>([]);
  const [territories, setTerritories] = useState<Territory[]>([]);
  const [orgMembers, setOrgMembers] = useState<OrgMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SalesTeam | null>(null);
  const [toDelete, setToDelete] = useState<SalesTeam | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<TeamForm>(EMPTY_TEAM);
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);
  const [memberDialogOpen, setMemberDialogOpen] = useState(false);
  const [memberForm, setMemberForm] = useState<MemberForm>(EMPTY_MEMBER);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [teamsData, rolesData, territoriesData, membersData] = await Promise.all([
        db.getTeams(),
        db.getRoles(),
        db.getTerritories(),
        db.getOrgMembers(),
      ]);
      setTeams(teamsData);
      setRoles(rolesData);
      setTerritories(territoriesData);
      setOrgMembers(membersData);
    } catch (error) {
      console.error('Error cargando equipos:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los equipos',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = () => {
    setEditing(null);
    setForm(EMPTY_TEAM);
    setDialogOpen(true);
  };

  const handleEdit = (team: SalesTeam) => {
    setEditing(team);
    setForm({
      name: team.name,
      description: team.description || '',
      is_active: team.is_active,
      territory_id: team.territory_id || '',
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast({ title: 'Validación', description: 'El nombre es obligatorio', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        is_active: form.is_active,
        territory_id: form.territory_id || null,
      };
      if (editing) {
        await db.updateTeam(editing.id, payload);
        toast({ title: 'Equipo actualizado', description: 'Los cambios se guardaron correctamente' });
      } else {
        await db.createTeam(payload);
        toast({ title: 'Equipo creado', description: 'El equipo se creó correctamente' });
      }
      setDialogOpen(false);
      load();
    } catch (error) {
      console.error('Error guardando equipo:', error);
      toast({ title: 'Error', description: 'No se pudo guardar el equipo', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const askDelete = (team: SalesTeam) => {
    setToDelete(team);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    try {
      await db.deleteTeam(toDelete.id);
      toast({ title: 'Equipo eliminado', description: 'El equipo se eliminó correctamente' });
      load();
    } catch (error) {
      console.error('Error eliminando equipo:', error);
      toast({ title: 'Error', description: 'No se pudo eliminar el equipo', variant: 'destructive' });
    } finally {
      setDeleteDialogOpen(false);
      setToDelete(null);
    }
  };

  const openMemberDialog = () => {
    setMemberForm(EMPTY_MEMBER);
    setMemberDialogOpen(true);
  };

  const handleAddMember = async () => {
    if (!expandedTeam || !memberForm.user_id.trim()) {
      toast({ title: 'Validación', description: 'Selecciona un miembro', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await db.addTeamMember(expandedTeam, {
        user_id: memberForm.user_id.trim(),
        sales_role_id: memberForm.sales_role_id || null,
        quota_amount: memberForm.quota_amount ? Number(memberForm.quota_amount) : null,
        quota_currency: memberForm.quota_currency || 'COP',
        territory_id: memberForm.territory_id || null,
      });
      toast({ title: 'Miembro añadido', description: 'El miembro se añadió al equipo' });
      setMemberDialogOpen(false);
      setMemberForm(EMPTY_MEMBER);
      load();
    } catch (error) {
      console.error('Error añadiendo miembro:', error);
      toast({ title: 'Error', description: 'No se pudo añadir el miembro', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveMember = async (teamId: string, memberId: string) => {
    try {
      await db.removeTeamMember(teamId, memberId);
      toast({ title: 'Miembro removido', description: 'El miembro fue removido del equipo' });
      load();
    } catch (error) {
      console.error('Error removiendo miembro:', error);
      toast({ title: 'Error', description: 'No se pudo remover el miembro', variant: 'destructive' });
    }
  };

  return {
    teams,
    roles,
    territories,
    orgMembers,
    loading,
    load,
    dialogOpen,
    setDialogOpen,
    deleteDialogOpen,
    setDeleteDialogOpen,
    editing,
    toDelete,
    saving,
    form,
    setForm,
    expandedTeam,
    setExpandedTeam,
    memberDialogOpen,
    setMemberDialogOpen,
    memberForm,
    setMemberForm,
    handleCreate,
    handleEdit,
    handleSave,
    askDelete,
    confirmDelete,
    openMemberDialog,
    handleAddMember,
    handleRemoveMember,
  };
}
