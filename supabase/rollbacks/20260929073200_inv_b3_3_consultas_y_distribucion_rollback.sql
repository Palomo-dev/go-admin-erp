-- Reversión de 20260929073200_inv_b3_3_consultas_y_distribucion.sql.
-- Retira las consultas y la distribución, deshace el parche de
-- fn_inv_documentos (vuelve a numerar TR-<id> y la merma por faltante vuelve a
-- enlazar al producto) y restaura las versiones anteriores del asiento y de las
-- notificaciones (el asiento anterior no asentaba nada: buscaba source
-- 'transfer'). Los datos no cambian.

drop function if exists public.fn_distribucion_crear(integer, jsonb, text);
drop function if exists public.fn_distribucion_ordenes(integer, integer);
drop function if exists public.fn_traslado_productos(integer, integer, text, integer[], integer);
drop function if exists public.fn_traslado_detalle(integer, integer);
drop function if exists public.fn_traslados_listado(integer, jsonb);

do $parche$
declare
  v_def text;
  v_n1 text := 'select t.id into v_x from public.inventory_transfers t where t.id = v_int and t.organization_id = p_org;';
  v_m1 text := 'select t.id, t.code into v_x from public.inventory_transfers t where t.id = v_int and t.organization_id = p_org;';
  v_n2 text := 'v_num := ''TR-'' || v_x.id;';
  v_m2 text := 'v_num := coalesce(v_x.code, ''TR-'' || v_x.id);';
  v_m3 text := 'elsif v_s = ''loss'' and v_id like ''traslado:%'' then
      -- B3: merma por faltante en el transporte, enlaza al traslado.
      v_tipo := ''traslado'';
      v_int := public.fn_traslado_int_entero(substr(v_id, length(''traslado:'') + 1));
      select t.id, t.code into v_x from public.inventory_transfers t where t.id = v_int and t.organization_id = p_org;
      if v_x.id is not null then
        v_num := coalesce(v_x.code, ''TR-'' || v_x.id);
        v_ruta := ''/app/inventario/transferencias/'' || v_x.id;
      end if;

    elsif v_s in (''initial'', ''loss'') then';
  v_n3 text := 'elsif v_s in (''initial'', ''loss'') then';
begin
  v_def := pg_get_functiondef('public.fn_inv_documentos(integer,jsonb)'::regprocedure);
  if position('B3: merma por faltante' in v_def) = 0 then
    return;
  end if;
  -- Primero el bloque de la merma (contiene los otros marcadores).
  v_def := replace(v_def, v_m3, v_n3);
  v_def := replace(replace(v_def, v_m1, v_n1), v_m2, v_n2);
  execute v_def;
end;
$parche$;

create or replace function public.fn_auto_journal_inventory_transfer()
returns trigger
language plpgsql
security definer
as $function$
DECLARE
    v_rule RECORD;
    v_amount numeric;
    v_description text;
    v_existing_entry integer;
    v_origin_account text;
    v_dest_account text;
    v_avg_cost numeric;
    v_total_qty numeric;
    v_product_name text;
BEGIN
    IF NEW.status != 'received' THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.status = OLD.status THEN
        RETURN NEW;
    END IF;
    SELECT COALESCE(SUM(ABS(sm.qty)), 0), COALESCE(AVG(sm.unit_cost), 0)
    INTO v_total_qty, v_avg_cost
    FROM stock_movements sm
    WHERE sm.source = 'transfer' AND sm.source_id = NEW.id::text AND sm.organization_id = NEW.organization_id;
    IF v_avg_cost = 0 OR v_avg_cost IS NULL THEN
        SELECT sl.avg_cost INTO v_avg_cost FROM stock_levels sl
        WHERE sl.branch_id = NEW.origin_branch_id ORDER BY sl.updated_at DESC LIMIT 1;
    END IF;
    v_amount := v_total_qty * COALESCE(v_avg_cost, 0);
    IF v_amount <= 0 THEN
        RETURN NEW;
    END IF;
    SELECT je.id INTO v_existing_entry FROM journal_entries je
    WHERE je.source = 'inventory_transfer' AND je.source_id = NEW.id::text AND je.organization_id = NEW.organization_id LIMIT 1;
    IF v_existing_entry IS NOT NULL THEN
        RETURN NEW;
    END IF;
    SELECT sub_account_code INTO v_origin_account FROM branch_account_mappings
    WHERE organization_id = NEW.organization_id AND branch_id = NEW.origin_branch_id AND base_account_code = '1405' LIMIT 1;
    SELECT sub_account_code INTO v_dest_account FROM branch_account_mappings
    WHERE organization_id = NEW.organization_id AND branch_id = NEW.dest_branch_id AND base_account_code = '1405' LIMIT 1;
    IF v_origin_account IS NULL OR v_dest_account IS NULL OR v_origin_account = v_dest_account THEN
        RETURN NEW;
    END IF;
    v_description := 'Transferencia Inv ' || NEW.origin_branch_id || ' → ' || NEW.dest_branch_id || ' - TF-' || NEW.id;
    PERFORM fn_create_journal_entry(
        NEW.organization_id, NEW.dest_branch_id, COALESCE(NEW.updated_at, now()),
        v_description, 'inventory_transfer', NEW.id::text,
        v_dest_account, v_origin_account, v_amount
    );
    RETURN NEW;
END;
$function$;

create or replace function public.fn_notify_transfer_created()
returns trigger
language plpgsql
security definer
as $function$
BEGIN
  PERFORM fn_create_org_notification(
    NEW.organization_id, NULL, 'app', 'transfer_created',
    'Nueva transferencia de inventario',
    'Transferencia #' || NEW.id || ' creada. Estado: ' || COALESCE(NEW.status, 'pendiente'),
    jsonb_build_object('transfer_id', NEW.id::text)
  );
  RETURN NEW;
END;
$function$;

create or replace function public.fn_notify_transfer_status()
returns trigger
language plpgsql
security definer
as $function$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status IN ('approved', 'rejected', 'completed') THEN
    PERFORM fn_create_org_notification(
      NEW.organization_id,
      NEW.created_by,
      'app',
      'transfer_' || NEW.status,
      'Transferencia ' || CASE NEW.status WHEN 'approved' THEN 'aprobada' WHEN 'rejected' THEN 'rechazada' WHEN 'completed' THEN 'completada' ELSE NEW.status END,
      'La transferencia #' || NEW.id || ' ha sido ' || CASE NEW.status WHEN 'approved' THEN 'aprobada' WHEN 'rejected' THEN 'rechazada' WHEN 'completed' THEN 'completada' ELSE NEW.status END || '.',
      jsonb_build_object('transfer_id', NEW.id::text, 'status', NEW.status)
    );
  END IF;
  RETURN NEW;
END;
$function$;
