-- Contain new guest purchases while deploying organizer destination routing.
-- Existing paid orders, receipts and reconciliation are deliberately untouched.
REVOKE EXECUTE ON FUNCTION public.prepare_origin_discount_order(uuid,uuid,text,text,text,text,text,text,boolean,text,integer) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.prepare_origin_event_order(uuid,uuid,text,text,text,text,text,text,boolean) FROM service_role;
