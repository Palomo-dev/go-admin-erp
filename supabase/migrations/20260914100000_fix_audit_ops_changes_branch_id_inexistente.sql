-- Corrección de un bug preexistente en el ERP, encontrado al probar los
-- traslados del asistente contra la base.
--
-- `audit_ops_changes()` hacía `v_branch_id := (NEW.branch_id)::integer`. Esa
-- columna no existe en `inventory_transfers` (tiene `origin_branch_id` y
-- `dest_branch_id`), y en PL/pgSQL acceder a un campo inexistente de NEW lanza
-- `42703: record "new" has no field "branch_id"`. Consecuencia: NINGÚN INSERT en
-- `inventory_transfers` podía completarse — el disparador es AFTER INSERT y
-- aborta la transacción entera.
--
-- Arreglo: leer el campo del JSONB que ya se construye (`to_jsonb(NEW)`), que
-- devuelve NULL para una clave ausente en vez de fallar. Para los traslados se
-- usa `origin_branch_id` como sucursal de referencia. En `customers`,
-- `reservations` y `shipments` —que sí tienen `branch_id`— el comportamiento es
-- idéntico al anterior.

create or replace function public.audit_ops_changes()
returns trigger
language plpgsql
security definer
as $function$
declare
  v_old_data jsonb;
  v_new_data jsonb;
  v_action text;
  v_changed_fields text[];
  v_org_id integer;
  v_branch_id integer;
  v_entity_id text;
  v_row jsonb;
begin
  if TG_OP = 'INSERT' then
    v_action := 'create';
    v_old_data := null;
    v_new_data := to_jsonb(NEW);
    v_changed_fields := array(select jsonb_object_keys(v_new_data));
  elsif TG_OP = 'UPDATE' then
    v_action := 'update';
    v_old_data := to_jsonb(OLD);
    v_new_data := to_jsonb(NEW);
    select array_agg(key) into v_changed_fields
    from jsonb_each(v_new_data) as n(key, value)
    where v_old_data->key is distinct from n.value;
  elsif TG_OP = 'DELETE' then
    v_action := 'delete';
    v_old_data := to_jsonb(OLD);
    v_new_data := null;
    v_changed_fields := null;
  end if;

  -- Se lee del JSONB, no del registro: `NEW.branch_id` lanza si la tabla no
  -- tiene esa columna; `v_row->>'branch_id'` devuelve NULL.
  v_row := case when TG_OP = 'DELETE' then v_old_data else v_new_data end;
  v_org_id := coalesce((v_row->>'organization_id')::integer, 0);
  v_branch_id := coalesce(
    (v_row->>'branch_id')::integer,
    (v_row->>'origin_branch_id')::integer
  );
  v_entity_id := v_row->>'id';

  insert into ops_audit_log (
    id, organization_id, branch_id, user_id, entity_type, entity_id,
    action, previous_data, new_data, changed_fields, created_at
  ) values (
    gen_random_uuid(), v_org_id, v_branch_id, auth.uid(), TG_TABLE_NAME, v_entity_id,
    v_action, v_old_data, v_new_data, v_changed_fields, now()
  );

  if TG_OP = 'DELETE' then
    return OLD;
  else
    return NEW;
  end if;
end;
$function$;
