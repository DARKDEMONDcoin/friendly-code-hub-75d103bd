DO $$
DECLARE
  r record;
BEGIN
  -- 1) Set search_path=public on every project-owned function that lacks it
  FOR r IN
    SELECT p.oid, n.nspname, p.proname,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    LEFT JOIN pg_depend d ON d.objid = p.oid AND d.deptype = 'e'
    WHERE n.nspname = 'public'
      AND d.objid IS NULL
      AND (p.proconfig IS NULL OR NOT (p.proconfig::text LIKE '%search_path=%'))
  LOOP
    EXECUTE format('ALTER FUNCTION public.%I(%s) SET search_path = public', r.proname, r.args);
  END LOOP;

  -- 2) Lock down SECURITY DEFINER functions: revoke anon/public exec, allow authenticated + service_role
  FOR r IN
    SELECT p.oid, p.proname,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    LEFT JOIN pg_depend d ON d.objid = p.oid AND d.deptype = 'e'
    WHERE n.nspname = 'public'
      AND d.objid IS NULL
      AND p.prosecdef = true
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon', r.proname, r.args);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated, service_role', r.proname, r.args);
  END LOOP;
END;
$$;