-- Reversión de 20260914100000_fix_audit_ops_changes_branch_id_inexistente.sql
--
-- OJO: revertir esto vuelve a romper TODO insert en `inventory_transfers`
-- (el disparador lee NEW.branch_id, que esa tabla no tiene). Solo tiene
-- sentido si se retira también el disparador `audit_inventory_transfers_trigger`.
-- Se deja la versión original por fidelidad, no como recomendación.

create or replace function public.audit_ops_changes()
returns trigger language plpgsql security definer as $function$
declare
  v_old_data jsonb; v_new_data jsonb; v_action text; v_changed_fields text[];
  v_org_id integer; v_branch_id integer; v_entity_id text;
begin
  if TG_OP = 'INSERT' then
    v_action := 'create'; v_old_data := null; v_new_data := to_jsonb(NEW);
    v_changed_fields := array(select jsonb_object_keys(v_new_data));
  elsif TG_OP = 'UPDATE' then
    v_action := 'update'; v_old_data := to_jsonb(OLD); v_new_data := to_jsonb(NEW);
    select array_agg(key) into v_changed_fields from jsonb_each(v_new_data) as n(key, value)
    where v_old_data->key is distinct from n.value;
  elsif TG_OP = 'DELETE' then
    v_action := 'delete'; v_old_data := to_jsonb(OLD); v_new_data := null; v_changed_fields := null;
  end if;
  if TG_OP = 'DELETE' then
    v_org_id := coalesce((OLD.organization_id)::integer, 0); v_branch_id := (OLD.branch_id)::integer; v_entity_id := (OLD.id)::text;
  else
    v_org_id := coalesce((NEW.organization_id)::integer, 0); v_branch_id := (NEW.branch_id)::integer; v_entity_id := (NEW.id)::text;
  end if;
  insert into ops_audit_log (id, organization_id, branch_id, user_id, entity_type, entity_id, action, previous_data, new_data, changed_fields, created_at)
  values (gen_random_uuid(), v_org_id, v_branch_id, auth.uid(), TG_TABLE_NAME, v_entity_id, v_action, v_old_data, v_new_data, v_changed_fields, now());
  if TG_OP = 'DELETE' then return OLD; else return NEW; end if;
end;
$function$;
