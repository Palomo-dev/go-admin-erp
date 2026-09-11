-- scripts/verificar-branch-access.sql
--
-- Verifica que app_branch_access funciona correctamente.
-- Se corre por MCP (execute_sql) después de cualquier cambio a la función
-- o a las políticas RESTRICTIVE.
--
-- Si cualquier afirmación no coincide, lanza RAISE EXCEPTION y se detiene.
--
-- Los sujetos de prueba se DESCUBREN por propiedad, no por UUID hardcodeado.
-- Antes de cada caso hay una consulta que encuentra al usuario adecuado.
-- Quien corra el script pega el UUID que salga en la variable del DO block.
-- Así el script es autodescriptivo, portable y sin datos de producción.

-- === Caso (a): miembro activo SIN sucursales asignadas, en una org con datos ===
-- Descubrir al sujeto:
--   SELECT om.user_id
--   FROM organization_members om
--   WHERE om.is_active
--     AND NOT EXISTS (
--       SELECT 1 FROM member_branches mb
--       WHERE mb.organization_member_id = om.id)
--     AND EXISTS (
--       SELECT 1 FROM invoice_sales i
--       WHERE i.organization_id = om.organization_id)
--   LIMIT 1;
--
-- Pegar el UUID abajo en v_user:
DO $$
DECLARE
  v_user uuid := 'PEGAR-AQUI-UUID-DEL-SELECT-ARRIBA';
  v_facturas int;
  v_cxc int;
BEGIN
  -- Skip si no se reemplazó el placeholder
  IF v_user::text = 'PEGAR-AQUI-UUID-DEL-SELECT-ARRIBA' THEN
    RAISE NOTICE 'Caso (a) SKIP: pegar UUID del SELECT de descubrimiento arriba.';
    RETURN;
  END IF;

  SET LOCAL role authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', v_user::text,
    'role', 'authenticated'
  )::text, true);

  SELECT count(*) INTO v_facturas FROM invoice_sales;
  SELECT count(*) INTO v_cxc FROM accounts_receivable;

  RESET role;

  IF v_facturas = 0 THEN
    RAISE EXCEPTION 'Caso (a) FALLO: empleado sin sucursales ve 0 facturas (esperado > 0). app_branch_access roto.';
  END IF;
  IF v_cxc = 0 THEN
    RAISE EXCEPTION 'Caso (a) FALLO: empleado sin sucursales ve 0 CxC (esperado > 0). app_branch_access roto.';
  END IF;
  RAISE NOTICE 'Caso (a) OK: % facturas, % CxC visibles para empleado sin sucursales.', v_facturas, v_cxc;
END $$;

-- === Caso (b): miembro activo CON sucursales asignadas, en una org con datos ===
-- Descubrir al sujeto:
--   SELECT om.user_id, mb.branch_id
--   FROM organization_members om
--   JOIN member_branches mb ON mb.organization_member_id = om.id
--   WHERE om.is_active
--     AND EXISTS (
--       SELECT 1 FROM invoice_sales i
--       WHERE i.organization_id = om.organization_id
--         AND i.branch_id = mb.branch_id)
--   LIMIT 1;
--
-- Pegar el UUID y el branch_id abajo:
DO $$
DECLARE
  v_user uuid := 'PEGAR-AQUI-UUID-DEL-SELECT-ARRIBA';
  v_branch int := 0;  -- PEGAR branch_id del SELECT de arriba
  v_total int;
  v_propia int;
  v_otras int;
BEGIN
  IF v_user::text = 'PEGAR-AQUI-UUID-DEL-SELECT-ARRIBA' OR v_branch = 0 THEN
    RAISE NOTICE 'Caso (b) SKIP: pegar UUID y branch_id del SELECT de descubrimiento arriba.';
    RETURN;
  END IF;

  SET LOCAL role authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', v_user::text,
    'role', 'authenticated'
  )::text, true);

  SELECT count(*) INTO v_total FROM invoice_sales;
  SELECT count(*) INTO v_propia FROM invoice_sales WHERE branch_id = v_branch;
  SELECT count(*) INTO v_otras FROM invoice_sales WHERE branch_id <> v_branch;

  RESET role;

  IF v_otras > 0 THEN
    RAISE EXCEPTION 'Caso (b) FALLO: empleado con branch % ve % facturas de otras sucursales. app_branch_access roto.', v_branch, v_otras;
  END IF;
  IF v_total = 0 THEN
    RAISE EXCEPTION 'Caso (b) FALLO: empleado con branch % ve 0 facturas (esperado > 0).', v_branch;
  END IF;
  RAISE NOTICE 'Caso (b) OK: % facturas, todas branch %, 0 de otras.', v_total, v_branch;
END $$;

-- === Caso (c): miembro con branches en una org y SIN branches en otra org ===
-- Descubrir al sujeto:
--   SELECT om.user_id,
--          om.organization_id AS org_con_branches,
--          om2.organization_id AS org_sin_branches
--   FROM organization_members om
--   JOIN member_branches mb ON mb.organization_member_id = om.id
--   JOIN organization_members om2 ON om2.user_id = om.user_id AND om2.is_active
--   WHERE om.is_active
--     AND NOT EXISTS (
--       SELECT 1 FROM member_branches mb2
--       JOIN organization_members om3 ON om3.id = mb2.organization_member_id
--       WHERE om3.user_id = om.user_id
--         AND om3.organization_id = om2.organization_id)
--     AND om.organization_id <> om2.organization_id
--   LIMIT 1;
--
-- Pegar el UUID y los dos org_ids abajo:
DO $$
DECLARE
  v_user uuid := 'PEGAR-AQUI-UUID-DEL-SELECT-ARRIBA';
  v_org_con int := 0;    -- PEGAR org_con_branches
  v_org_sin int := 0;    -- PEGAR org_sin_branches
  v_branch_con int;     -- una branch de la org_con
  v_branch_sin int;     -- una branch de la org_sin
  v_access_con boolean;
  v_access_sin boolean;
  v_access_otra boolean;
BEGIN
  IF v_user::text = 'PEGAR-AQUI-UUID-DEL-SELECT-ARRIBA' OR v_org_con = 0 OR v_org_sin = 0 THEN
    RAISE NOTICE 'Caso (c) SKIP: pegar UUID y org_ids del SELECT de descubrimiento arriba.';
    RETURN;
  END IF;

  -- Encontrar una branch de cada org
  SELECT b.id INTO v_branch_con FROM branches b WHERE b.organization_id = v_org_con LIMIT 1;
  SELECT b.id INTO v_branch_sin FROM branches b WHERE b.organization_id = v_org_sin LIMIT 1;

  IF v_branch_con IS NULL OR v_branch_sin IS NULL THEN
    RAISE NOTICE 'Caso (c) SKIP: no se encontraron branches para las orgs indicadas.';
    RETURN;
  END IF;

  -- Probar app_branch_access directamente (sin SET LOCAL, con el UUID)
  -- Cláusula (4) aislada para branch de org_sin (miembro sin branches ahí) → TRUE
  SELECT (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.user_id = v_user AND om.is_active = true
        AND om.organization_id = (SELECT b.organization_id FROM branches b WHERE b.id = v_branch_sin)
    )
    AND NOT EXISTS (
      SELECT 1 FROM member_branches mb
      JOIN organization_members om ON om.id = mb.organization_member_id
      JOIN branches b ON b.id = mb.branch_id
      WHERE om.user_id = v_user AND om.is_active = true
        AND b.organization_id = (SELECT b2.organization_id FROM branches b2 WHERE b2.id = v_branch_sin)
    )
  ) INTO v_access_sin;

  -- Cláusula (4) para branch de org_con (miembro CON branches ahí) → FALSE
  SELECT (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.user_id = v_user AND om.is_active = true
        AND om.organization_id = (SELECT b.organization_id FROM branches b WHERE b.id = v_branch_con)
    )
    AND NOT EXISTS (
      SELECT 1 FROM member_branches mb
      JOIN organization_members om ON om.id = mb.organization_member_id
      JOIN branches b ON b.id = mb.branch_id
      WHERE om.user_id = v_user AND om.is_active = true
        AND b.organization_id = (SELECT b2.organization_id FROM branches b2 WHERE b2.id = v_branch_con)
    )
  ) INTO v_access_con;

  IF NOT v_access_sin THEN
    RAISE EXCEPTION 'Caso (c) FALLO: clausula (4) debio dar TRUE para branch % (org %, miembro sin branches).', v_branch_sin, v_org_sin;
  END IF;
  IF v_access_con THEN
    RAISE EXCEPTION 'Caso (c) FALLO: clausula (4) debio dar FALSE para branch % (org %, miembro con branches).', v_branch_con, v_org_con;
  END IF;

  -- Probar la función completa con SET LOCAL
  SET LOCAL role authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', v_user::text,
    'role', 'authenticated'
  )::text, true);

  SELECT app_branch_access(v_branch_con) INTO v_access_con;
  SELECT app_branch_access(v_branch_sin) INTO v_access_sin;

  RESET role;

  IF NOT v_access_con THEN
    RAISE EXCEPTION 'Caso (c) FALLO: usuario no ve branch % (org %) siendo miembro con branches asignadas.', v_branch_con, v_org_con;
  END IF;
  IF NOT v_access_sin THEN
    RAISE EXCEPTION 'Caso (c) FALLO: usuario no ve branch % (org %) siendo miembro sin branches (deberia ver todo).', v_branch_sin, v_org_sin;
  END IF;

  RAISE NOTICE 'Caso (c) OK: branch % (org %) = true, branch % (org %) = true.', v_branch_con, v_org_con, v_branch_sin, v_org_sin;
END $$;

-- === Caso (d): is_active = false → sin acceso ===
-- NO PROBADO: no hay miembros desactivados hoy (130/130 activos).
-- Cuando exista uno, descubrirlo con:
--   SELECT om.user_id, om.organization_id
--   FROM organization_members om
--   WHERE om.is_active = false LIMIT 1;
--
-- Y agregar aquí:
--   SET LOCAL role authenticated;
--   SET LOCAL request.jwt.claims = json_build_object(
--     'sub', v_user::text, 'role', 'authenticated')::text;
--   SELECT app_branch_access(<branch de su org>) → debe dar FALSE
--   SELECT count(*) FROM invoice_sales → debe dar 0
-- La lógica: las cláusulas (2), (3) y (4) todas filtran om.is_active = true.
-- Un miembro desactivado no pasa ninguna — solo (1) p_branch_id IS NULL,
-- que no depende de is_active.

DO $$
DECLARE
  v_inactivos int;
BEGIN
  SELECT count(*) INTO v_inactivos FROM organization_members WHERE is_active = false;
  IF v_inactivos = 0 THEN
    RAISE NOTICE 'Caso (d) SKIP: no hay miembros desactivados (%/130 activos). Pendiente cuando exista uno.', 130;
  ELSE
    RAISE NOTICE 'Caso (d) PENDIENTE: hay % miembros desactivados. Agregar verificacion manual.', v_inactivos;
  END IF;
END $$;

DO $$
BEGIN
  RAISE NOTICE 'Verificacion completada: revisar casos (a), (b), (c) arriba. (d) pendiente.';
END $$;
