-- ORIGIN guest checkout uses the same event coupons and usage budget as Franky.
-- Only the authenticated partner server may quote or reserve: these functions
-- are INVOKER, service_role-only, and never expose the private coupon table.
ALTER TABLE public.origin_event_orders
 ADD COLUMN base_amount_cents integer,
 ADD COLUMN discount_cents integer NOT NULL DEFAULT 0,
 ADD COLUMN discount_code_id uuid,
 ADD COLUMN discount_code text,
 ADD COLUMN discount_released boolean NOT NULL DEFAULT false;
ALTER TABLE public.origin_event_orders DROP CONSTRAINT origin_event_orders_amount_cents_check;
ALTER TABLE public.origin_event_orders
 ADD CONSTRAINT origin_event_orders_amount_cents_check CHECK(amount_cents BETWEEN 50 AND 1000000 OR (amount_cents=0 AND discount_cents>0)),
 ADD CONSTRAINT origin_event_orders_discount_check CHECK(
  discount_cents>=0 AND coalesce(base_amount_cents,amount_cents) BETWEEN 50 AND 1000000
  AND coalesce(base_amount_cents,amount_cents)-discount_cents=amount_cents
  AND (discount_cents=0 OR (discount_code_id IS NOT NULL AND discount_code IS NOT NULL)));

CREATE FUNCTION public.quote_origin_event_order(p_event uuid,p_size text,p_code text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE e public.events%ROWTYPE; c public.event_discount_codes%ROWTYPE; base integer; discount integer:=0; amount integer;
BEGIN
 SELECT * INTO e FROM public.events WHERE id=p_event;
 IF NOT FOUND OR e.organizer_id IS DISTINCT FROM 'efc99d1b-c713-4061-9146-e905fc599f56'::uuid THEN RAISE EXCEPTION 'Evento no disponible'; END IF;
 IF coalesce(e.status,'') NOT IN('upcoming','ongoing') OR e.start_date IS NULL OR e.start_date<=now()+interval '35 minutes' OR coalesce(e.price,0)<=0 OR coalesce(e.payment_mode,'app') NOT IN('app','info') THEN RAISE EXCEPTION 'Las inscripciones están cerradas'; END IF;
 IF p_size IS NULL OR p_size NOT IN('ninguna','XS','S','M','L','XL','XXL') OR (e.shirts_enabled IS NOT TRUE AND p_size<>'ninguna') THEN RAISE EXCEPTION 'Elige una opción de camiseta válida'; END IF;
 base:=round(100*CASE WHEN e.price_without_shirt IS NOT NULL THEN CASE WHEN p_size='ninguna' THEN e.price_without_shirt ELSE e.price_with_shirt END ELSE e.price END)::integer;
 IF base IS NULL OR base<50 OR base>1000000 THEN RAISE EXCEPTION 'El importe de la entrada no está disponible'; END IF;
 IF nullif(trim(p_code),'') IS NOT NULL THEN
  IF length(trim(p_code))>64 THEN RAISE EXCEPTION 'El cupón no es válido para este evento'; END IF;
  SELECT * INTO c FROM public.event_discount_codes WHERE event_id=p_event AND lower(code)=lower(trim(p_code));
  IF NOT FOUND THEN RAISE EXCEPTION 'El cupón no es válido para este evento'; END IF;
  IF c.expires_at IS NOT NULL AND c.expires_at<=now() THEN RAISE EXCEPTION 'El cupón ha caducado'; END IF;
  IF c.max_uses IS NOT NULL AND c.used_count>=c.max_uses THEN RAISE EXCEPTION 'El cupón ha agotado sus usos'; END IF;
  -- Integer division matches check_discount_code and marketplace reservations.
  discount:=least(base,greatest(0,CASE WHEN c.kind='percent' THEN (base::bigint*c.value/100)::integer ELSE c.value END));
 END IF;
 amount:=base-discount;
 IF amount>0 AND amount<50 THEN RAISE EXCEPTION 'El cupón deja un importe inferior al mínimo de pago de 0,50 €'; END IF;
 RETURN jsonb_build_object('base_amount_cents',base,'discount_cents',discount,'amount_cents',amount,'discount_code',c.code,'discount_code_id',c.id);
END $$;
REVOKE ALL ON FUNCTION public.quote_origin_event_order(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.quote_origin_event_order(uuid,text,text) TO service_role;

CREATE FUNCTION public.prepare_origin_discount_order(p_id uuid,p_event uuid,p_token_hash text,p_name text,p_email text,p_size text,p_ip_hash text,p_account text,p_live boolean,p_code text DEFAULT NULL,p_expected_amount integer DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE recovering boolean; o public.origin_event_orders%ROWTYPE; result jsonb; quote jsonb; discount integer; amount integer;
BEGIN
 -- Lock order shared with Franky: event -> order -> coupon. A retry recovers
 -- the original order before validating or consuming any new coupon.
 PERFORM 1 FROM public.events WHERE id=p_event FOR UPDATE;
 SELECT EXISTS(SELECT 1 FROM public.origin_event_orders WHERE id=p_id OR (event_id=p_event AND token_hash=p_token_hash AND status IN('pending','paid','review'))) INTO recovering;
 result:=public.prepare_origin_event_order(p_id,p_event,p_token_hash,p_name,p_email,p_size,p_ip_hash,p_account,p_live);
 IF recovering THEN RETURN result; END IF;
 IF nullif(trim(p_code),'') IS NOT NULL THEN
  PERFORM 1 FROM public.event_discount_codes WHERE event_id=p_event AND lower(code)=lower(trim(p_code)) FOR UPDATE;
 END IF;
 quote:=public.quote_origin_event_order(p_event,p_size,p_code);
 amount:=(quote->>'amount_cents')::integer; discount:=(quote->>'discount_cents')::integer;
 IF p_expected_amount IS NOT NULL AND p_expected_amount<>amount THEN RAISE EXCEPTION 'El precio ha cambiado. Revisa el importe y vuelve a aplicar el cupón'; END IF;
 IF amount=0 AND (SELECT count(*) FROM public.origin_event_orders WHERE ip_hash=p_ip_hash AND amount_cents=0 AND status='paid' AND created_at>now()-interval '30 minutes')>=3 THEN RAISE EXCEPTION 'El cupón gratuito ha alcanzado el límite temporal de esta conexión. Inténtalo más tarde'; END IF;
 IF discount>0 THEN UPDATE public.event_discount_codes SET used_count=used_count+1 WHERE id=(quote->>'discount_code_id')::uuid; END IF;
 UPDATE public.origin_event_orders SET base_amount_cents=(quote->>'base_amount_cents')::integer,
  discount_cents=discount,discount_code_id=(quote->>'discount_code_id')::uuid,discount_code=quote->>'discount_code',amount_cents=amount,
  status=CASE WHEN amount=0 THEN 'paid' ELSE 'pending' END,paid_at=CASE WHEN amount=0 THEN now() ELSE NULL END
 WHERE id=p_id RETURNING * INTO o;
 -- A fully discounted entry is confirmed atomically, without a Stripe charge.
 RETURN to_jsonb(o);
END $$;
REVOKE ALL ON FUNCTION public.prepare_origin_discount_order(uuid,uuid,text,text,text,text,text,text,boolean,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_origin_discount_order(uuid,uuid,text,text,text,text,text,text,boolean,text,integer) TO service_role;

-- Both the verified Stripe expiry path and the unstarted-order close path
-- pass through this trigger. Uncertain payments and refunds retain their use.
-- Keep the original coupon ID without an FK: deleting/recreating a coupon
-- must not rewrite a frozen order or restore usage to a different coupon.
CREATE FUNCTION public.release_origin_order_discount() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
 IF OLD.status IN('pending','review') AND NEW.status='expired' AND OLD.discount_cents>0 AND NOT OLD.discount_released THEN
  UPDATE public.event_discount_codes SET used_count=greatest(0,used_count-1) WHERE id=OLD.discount_code_id;
  NEW.discount_released:=true;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.release_origin_order_discount() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER trg_release_origin_order_discount BEFORE UPDATE OF status ON public.origin_event_orders FOR EACH ROW EXECUTE FUNCTION public.release_origin_order_discount();
NOTIFY pgrst,'reload schema';
