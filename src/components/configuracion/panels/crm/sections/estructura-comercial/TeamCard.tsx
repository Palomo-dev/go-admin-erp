'use client';

import { ChevronDown, ChevronRight, MapPin, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { InactiveBadge } from './shared';
import type { SalesTeam, SalesTeamMember } from './types';

interface TeamCardProps {
  team: SalesTeam;
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onAddMember: () => void;
  onRemoveMember: (memberId: string) => void;
}

/** Nombre visible de un miembro: nombre completo, correo o id recortado. */
export function memberName(m: SalesTeamMember): string {
  const p = m.profiles;
  if (!p) return m.user_id.slice(0, 8);
  const full = [p.first_name, p.last_name].filter(Boolean).join(' ');
  return full || p.email || m.user_id.slice(0, 8);
}

/** Tarjeta de un equipo con su tabla de miembros desplegable. */
export function TeamCard({
  team,
  expanded,
  onToggle,
  onEdit,
  onDelete,
  onAddMember,
  onRemoveMember,
}: TeamCardProps) {
  const members = team.members || [];
  return (
    <Card className="border-gray-200 dark:border-gray-700">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onToggle}
            className="flex items-center gap-2 flex-1 min-w-0 text-left"
          >
            {expanded ? (
              <ChevronDown className="h-4 w-4 text-gray-400" />
            ) : (
              <ChevronRight className="h-4 w-4 text-gray-400" />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                  {team.name}
                </p>
                {!team.is_active && <InactiveBadge />}
                <Badge variant="secondary" className="text-xs">
                  {members.length} miembro{members.length !== 1 ? 's' : ''}
                </Badge>
              </div>
              {team.description && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">
                  {team.description}
                </p>
              )}
              {team.territories?.name && (
                <p className="text-xs text-rose-600 dark:text-rose-400 mt-1 flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  Territorio: {team.territories.name}
                </p>
              )}
            </div>
          </button>
          <div className="flex items-center gap-2 ml-4">
            <Button variant="ghost" size="icon" onClick={onEdit}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={onDelete}>
              <Trash2 className="h-4 w-4 text-red-500" />
            </Button>
          </div>
        </div>

        {expanded && (
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 space-y-2">
            {members.length === 0 ? (
              <p className="text-xs text-gray-500 dark:text-gray-400 py-2">
                Sin miembros. Añade el primero.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Miembro</TableHead>
                    <TableHead className="text-xs">Rol</TableHead>
                    <TableHead className="text-xs">Territorio</TableHead>
                    <TableHead className="text-xs">Cuota</TableHead>
                    <TableHead className="text-xs w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="text-xs font-medium">{memberName(m)}</TableCell>
                      <TableCell className="text-xs">{m.sales_roles?.name || '—'}</TableCell>
                      <TableCell className="text-xs">
                        {m.territories?.name || team.territories?.name || '—'}
                      </TableCell>
                      <TableCell className="text-xs">
                        {m.quota_amount != null
                          ? `${m.quota_currency} ${m.quota_amount.toLocaleString()}`
                          : '—'}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => onRemoveMember(m.id)}>
                          <Trash2 className="h-3 w-3 text-red-400" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            <Button variant="outline" size="sm" onClick={onAddMember}>
              <Plus className="h-3 w-3 mr-1" />
              Añadir miembro
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
