'use client';

import { useState, useEffect, useCallback } from 'react';
import { Users, MapPin, UserCircle, Loader2 } from 'lucide-react';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';

interface SalesTeamTerritorySelectorsProps {
  opportunityId: string;
  initialTeamId?: string | null;
  initialTerritoryId?: string | null;
  initialSalespersonId?: string | null;
  onUpdated?: () => void;
}

interface Option {
  id: string;
  name: string;
}

export function SalesTeamTerritorySelectors({
  opportunityId,
  initialTeamId,
  initialTerritoryId,
  initialSalespersonId,
  onUpdated,
}: SalesTeamTerritorySelectorsProps) {
  const [teams, setTeams] = useState<Option[]>([]);
  const [territories, setTerritories] = useState<Option[]>([]);
  const [members, setMembers] = useState<Option[]>([]);
  const [teamId, setTeamId] = useState(initialTeamId || '');
  const [territoryId, setTerritoryId] = useState(initialTerritoryId || '');
  const [salespersonId, setSalespersonId] = useState(initialSalespersonId || '');
  const [loading, setLoading] = useState(true);
  const [savingTeam, setSavingTeam] = useState(false);
  const [savingTerritory, setSavingTerritory] = useState(false);
  const [savingSalesperson, setSavingSalesperson] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const orgId = getOrganizationId();
      if (!orgId) return;
      const [teamsRes, territoriesRes, membersRes] = await Promise.all([
        supabase
          .from('sales_teams')
          .select('id, name')
          .eq('organization_id', orgId)
          .eq('is_active', true)
          .order('name'),
        supabase
          .from('territories')
          .select('id, name')
          .eq('organization_id', orgId)
          .eq('is_active', true)
          .order('name'),
        supabase
          .from('organization_members')
          .select('user_id, profiles:user_id(id, first_name, last_name, email)')
          .eq('organization_id', orgId)
          .eq('is_active', true),
      ]);
      if (teamsRes.data) setTeams(teamsRes.data);
      if (territoriesRes.data) setTerritories(territoriesRes.data);
      if (membersRes.data) {
        const memberList = (membersRes.data as { user_id: string; profiles: { id: string; first_name: string | null; last_name: string | null; email: string | null }[] }[]).map((m) => {
          const p = m.profiles?.[0] || null;
          const full = p ? [p.first_name, p.last_name].filter(Boolean).join(' ') : '';
          return { id: m.user_id, name: full || p?.email || m.user_id.slice(0, 8) };
        });
        setMembers(memberList);
      }
    } catch (err) {
      console.error('Error cargando equipos/territorios/miembros:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setTeamId(initialTeamId || '');
    setTerritoryId(initialTerritoryId || '');
    setSalespersonId(initialSalespersonId || '');
  }, [initialTeamId, initialTerritoryId, initialSalespersonId]);

  const updateTeam = async (value: string) => {
    const newVal = value === 'none' ? null : value;
    setTeamId(value === 'none' ? '' : value);
    setSavingTeam(true);
    try {
      const { error } = await supabase
        .from('opportunities')
        .update({ sales_team_id: newVal, updated_at: new Date().toISOString() })
        .eq('id', opportunityId);
      if (error) throw error;
      toast({ title: 'Equipo actualizado' });
      onUpdated?.();
    } catch (err) {
      console.error('Error actualizando equipo:', err);
      toast({ title: 'Error', description: 'No se pudo actualizar el equipo', variant: 'destructive' });
    } finally {
      setSavingTeam(false);
    }
  };

  const updateTerritory = async (value: string) => {
    const newVal = value === 'none' ? null : value;
    setTerritoryId(value === 'none' ? '' : value);
    setSavingTerritory(true);
    try {
      const { error } = await supabase
        .from('opportunities')
        .update({ territory_id: newVal, updated_at: new Date().toISOString() })
        .eq('id', opportunityId);
      if (error) throw error;
      toast({ title: 'Territorio actualizado' });
      onUpdated?.();
    } catch (err) {
      console.error('Error actualizando territorio:', err);
      toast({ title: 'Error', description: 'No se pudo actualizar el territorio', variant: 'destructive' });
    } finally {
      setSavingTerritory(false);
    }
  };

  const updateSalesperson = async (value: string) => {
    const newVal = value === 'none' ? null : value;
    setSalespersonId(value === 'none' ? '' : value);
    setSavingSalesperson(true);
    try {
      const { error } = await supabase
        .from('opportunities')
        .update({ salesperson_id: newVal, updated_at: new Date().toISOString() })
        .eq('id', opportunityId);
      if (error) throw error;
      toast({ title: 'Responsable actualizado' });
      onUpdated?.();
    } catch (err) {
      console.error('Error actualizando responsable:', err);
      toast({ title: 'Error', description: 'No se pudo actualizar el responsable', variant: 'destructive' });
    } finally {
      setSavingSalesperson(false);
    }
  };

  if (loading) {
    return (
      <section>
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
          <Users className="h-4 w-4 text-rose-500" />
          Equipo y Territorio
        </h3>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <Loader2 className="h-3 w-3 animate-spin" />
          Cargando...
        </div>
      </section>
    );
  }

  // Si no hay equipos, territorios ni miembros, no mostrar la sección
  if (teams.length === 0 && territories.length === 0 && members.length === 0) return null;

  return (
    <section>
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
        <Users className="h-4 w-4 text-rose-500" />
        Equipo y Responsable
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {members.length > 0 && (
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-600 dark:text-gray-400 flex items-center gap-1">
              <UserCircle className="h-3 w-3" />
              Responsable
              {savingSalesperson && <Loader2 className="h-3 w-3 animate-spin" />}
            </Label>
            <Select value={salespersonId || 'none'} onValueChange={updateSalesperson} disabled={savingSalesperson}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Sin asignar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin asignar</SelectItem>
                {members.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {teams.length > 0 && (
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-600 dark:text-gray-400 flex items-center gap-1">
              <Users className="h-3 w-3" />
              Equipo comercial
              {savingTeam && <Loader2 className="h-3 w-3 animate-spin" />}
            </Label>
            <Select value={teamId || 'none'} onValueChange={updateTeam} disabled={savingTeam}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Sin equipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin equipo</SelectItem>
                {teams.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {territories.length > 0 && (
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-600 dark:text-gray-400 flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              Territorio
              {savingTerritory && <Loader2 className="h-3 w-3 animate-spin" />}
            </Label>
            <Select value={territoryId || 'none'} onValueChange={updateTerritory} disabled={savingTerritory}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Sin territorio" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin territorio</SelectItem>
                {territories.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
    </section>
  );
}
