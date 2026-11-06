-- Extiende el pre-request existente sin sustituir la protección social.
-- Las RPC mantienen la autorización por organización, recurso y permiso.
DO $$
BEGIN
  IF to_regprocedure('social_demo_private.user_cohort(uuid)') IS NULL
    OR to_regprocedure('public.require_account_session()') IS NULL
    OR to_regclass('public.workspace_demo_scenarios') IS NULL THEN
    RAISE EXCEPTION 'pro_demo_request_predecessor_missing';
  END IF;
END $$;

ALTER FUNCTION public.workspace_require_request() SET SCHEMA workspace_private;
ALTER FUNCTION workspace_private.workspace_require_request()
  RENAME TO workspace_require_request_before_pro;
REVOKE ALL ON FUNCTION workspace_private.workspace_require_request_before_pro()
  FROM PUBLIC, anon, authenticated, service_role;

-- DEFINER permite consultar el registro privado de demos. La identidad sale
-- de auth.uid(), nunca del perfil editable ni de parámetros de la petición.
CREATE FUNCTION public.workspace_require_request() RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  route text := current_setting('request.path', true);
  method text := current_setting('request.method', true);
  actor uuid := auth.uid();
  cohort uuid;
  reader boolean;
  writer boolean;
BEGIN
  PERFORM public.require_account_session();
  -- Las cuentas sociales, incluidas las revocadas, recorren su guard original.
  -- Las personas reales tampoco reciben una política distinta por este cambio.
  IF actor IS NULL OR social_demo_private.user_cohort(actor) IS NOT NULL THEN
    PERFORM workspace_private.workspace_require_request_before_pro();
    RETURN;
  END IF;
  cohort := public.current_demo_cohort();
  IF cohort IS NULL THEN
    PERFORM workspace_private.workspace_require_request_before_pro();
    RETURN;
  END IF;
  reader := route = ANY(ARRAY[
    '/rpc/pro_get_space',
    '/rpc/pro_list_shifts',
    '/rpc/pro_get_agenda_operations',
    '/rpc/pro_get_table_operations',
    '/rpc/pro_get_resource_operations'
  ]);
  writer := route = ANY(ARRAY[
    '/rpc/pro_save_profile',
    '/rpc/pro_save_offer',
    '/rpc/pro_set_offer_status',
    '/rpc/pro_save_menu_item',
    '/rpc/pro_save_daily_menu',
    '/rpc/pro_respond_group_request',
    '/rpc/pro_clock',
    '/rpc/pro_reply_review',
    '/rpc/pro_mark_claim_used',
    '/rpc/pro_save_agenda_record',
    '/rpc/pro_create_agenda_booking',
    '/rpc/pro_booking_operation',
    '/rpc/pro_save_table',
    '/rpc/pro_table_operation',
    '/rpc/pro_save_resource'
  ]);
  IF reader OR writer THEN
    IF NOT coalesce(reader AND method IN ('GET', 'HEAD', 'POST') OR writer AND method = 'POST', false) THEN
      RAISE EXCEPTION 'demo_live_operation_disabled' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.workspace_demo_scenarios scenario
      JOIN public.organizations organization ON organization.id = scenario.organization_id
      WHERE scenario.user_id = actor AND scenario.revoked_at IS NULL
        AND organization.demo_cohort_id = cohort AND organization.status = 'active'
        AND public.has_organization_permission(organization.id, 'resource.read')
    ) THEN
      RAISE EXCEPTION 'pro_demo_revoked' USING ERRCODE = '42501';
    END IF;
    RETURN;
  END IF;
  -- No se abren tablas, comodines, operaciones públicas de estudiante ni pagos.
  PERFORM workspace_private.workspace_require_request_before_pro();
END $$;
REVOKE ALL ON FUNCTION public.workspace_require_request()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.workspace_require_request()
  TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
