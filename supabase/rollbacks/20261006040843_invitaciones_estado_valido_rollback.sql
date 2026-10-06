-- Reversión de 20261006150500_invitaciones_estado_valido.
-- El CHECK puede venir también de 20261006120000_organizacion_invitaciones_y_cargo: si esa sigue
-- aplicada, no lo quites (deja esta reversión sin ejecutar). Si no:
alter table public.invitations drop constraint if exists invitations_status_check;
-- Dato: la fila que tenía status `half` es la invitación id 54 (org 57). Se devuelve así, después
-- de quitar el CHECK:
update public.invitations set status = 'half' where id = 54 and status = 'used';
