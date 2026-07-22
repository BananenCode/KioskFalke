-- KioskFalke V11: wählbares Monatsjournal, Rechnungsforderungen und Kaufsperre
-- Nach V10 einmal vollständig im Supabase SQL Editor ausführen.

create table if not exists public.kiosk_payment_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.kiosk_users(id) on delete cascade,
  amount numeric(10,2) not null check (amount > 0),
  note text not null default '',
  status text not null default 'open' check (status in ('open','paid','cancelled')),
  created_by uuid references public.kiosk_users(id),
  created_at timestamptz not null default now(),
  resolved_by uuid references public.kiosk_users(id),
  resolved_at timestamptz,
  payment_id uuid references public.kiosk_payments(id)
);

create unique index if not exists kiosk_payment_requests_one_open_per_user
  on public.kiosk_payment_requests(user_id) where status='open';
create index if not exists kiosk_payment_requests_history_idx
  on public.kiosk_payment_requests(user_id,created_at desc);

alter table public.kiosk_payment_requests enable row level security;
drop policy if exists deny_payment_requests on public.kiosk_payment_requests;
create policy deny_payment_requests on public.kiosk_payment_requests for all using (false) with check (false);

alter table public.kiosk_notifications add column if not exists kind text not null default 'info';
alter table public.kiosk_notifications add column if not exists payment_request_id uuid references public.kiosk_payment_requests(id) on delete set null;

create or replace function public.kiosk_admin_create_payment_request(
  p_actor_id uuid,
  p_actor_code text,
  p_user_id uuid,
  p_amount numeric,
  p_note text default ''
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  out_request_id uuid;
  v_amount numeric(10,2) := round(p_amount,2);
  v_note text := trim(coalesce(p_note,''));
begin
  perform public._kiosk_require_admin(p_actor_id,p_actor_code);
  if v_amount <= 0 then raise exception 'Forderungsbetrag muss größer als 0 sein'; end if;
  if not exists(select 1 from public.kiosk_users where id=p_user_id and active=true) then raise exception 'Aktiver User nicht gefunden'; end if;
  if exists(select 1 from public.kiosk_payment_requests where user_id=p_user_id and status='open') then raise exception 'Für diesen User besteht bereits eine offene Forderung'; end if;

  if v_note = '' then
    v_note := 'Bitte Rechnung über ' || replace(to_char(v_amount,'FM999999990.00'),'.',',') || ' EUR per PayPal bezahlen.';
  end if;

  insert into public.kiosk_payment_requests(user_id,amount,note,created_by)
  values(p_user_id,v_amount,v_note,p_actor_id)
  returning id into out_request_id;

  insert into public.kiosk_notifications(user_id,title,message,amount,created_by,kind,payment_request_id)
  values(
    p_user_id,
    'Rechnung bezahlen',
    'Rechnung mit Summe ' || replace(to_char(v_amount,'FM999999990.00'),'.',',') || ' EUR bezahlen. ' || v_note,
    v_amount,
    p_actor_id,
    'payment_request',
    out_request_id
  );

  return jsonb_build_object('request_id',out_request_id,'amount',v_amount,'purchase_blocked',true);
end;
$$;

create or replace function public.kiosk_admin_confirm_payment_request(
  p_actor_id uuid,
  p_actor_code text,
  p_request_id uuid,
  p_note text default ''
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_request public.kiosk_payment_requests%rowtype;
  out_payment_id uuid;
  v_balance numeric(10,2);
begin
  perform public._kiosk_require_admin(p_actor_id,p_actor_code);
  select * into v_request from public.kiosk_payment_requests where id=p_request_id for update;
  if v_request.id is null then raise exception 'Forderung nicht gefunden'; end if;
  if v_request.status <> 'open' then raise exception 'Diese Forderung ist nicht mehr offen'; end if;

  insert into public.kiosk_payments(user_id,amount,note,created_by)
  values(v_request.user_id,v_request.amount,coalesce(nullif(trim(p_note),''),'PayPal-Zahlung geprüft'),p_actor_id)
  returning id into out_payment_id;

  update public.kiosk_payment_requests
  set status='paid',resolved_by=p_actor_id,resolved_at=now(),payment_id=out_payment_id
  where id=p_request_id;

  update public.kiosk_notifications set read_at=coalesce(read_at,now())
  where payment_request_id=p_request_id and kind='payment_request';

  insert into public.kiosk_notifications(user_id,title,message,amount,created_by,kind,payment_request_id)
  values(
    v_request.user_id,
    'Zahlung bestätigt – Kiosk freigegeben',
    'Der Betrag ' || replace(to_char(v_request.amount,'FM999999990.00'),'.',',') || ' EUR wurde überwiesen, deinem Konto gutgeschrieben und der Kiosk wieder freigegeben.',
    v_request.amount,
    p_actor_id,
    'payment_confirmed',
    p_request_id
  );

  v_balance := public._kiosk_balance(v_request.user_id);
  return jsonb_build_object('payment_id',out_payment_id,'amount',v_request.amount,'balance',v_balance,'purchase_blocked',false);
end;
$$;

create or replace function public.kiosk_admin_cancel_payment_request(
  p_actor_id uuid,
  p_actor_code text,
  p_request_id uuid
)
returns void language plpgsql security definer set search_path = public as $$
declare v_request public.kiosk_payment_requests%rowtype;
begin
  perform public._kiosk_require_admin(p_actor_id,p_actor_code);
  select * into v_request from public.kiosk_payment_requests where id=p_request_id for update;
  if v_request.id is null then raise exception 'Forderung nicht gefunden'; end if;
  if v_request.status <> 'open' then raise exception 'Diese Forderung ist nicht mehr offen'; end if;
  update public.kiosk_payment_requests set status='cancelled',resolved_by=p_actor_id,resolved_at=now() where id=p_request_id;
  update public.kiosk_notifications set read_at=coalesce(read_at,now()) where payment_request_id=p_request_id and kind='payment_request';
  insert into public.kiosk_notifications(user_id,title,message,amount,created_by,kind,payment_request_id)
  values(v_request.user_id,'Forderung zurückgenommen','Die Zahlungsaufforderung wurde vom Admin zurückgenommen. Der Kiosk ist wieder freigegeben.',v_request.amount,p_actor_id,'info',p_request_id);
end;
$$;

-- Die Sperre wird ausschließlich durch eine offene Admin-Forderung ausgelöst.
create or replace function public.kiosk_take_product(p_actor_id uuid, p_actor_code text, p_product_id uuid, p_quantity int default 1)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_price numeric(10,2); v_name text; v_balance numeric; v_entry uuid; v_request_amount numeric(10,2);
begin
  if not exists (select 1 from public._kiosk_actor(p_actor_id,p_actor_code)) then raise exception 'Ungültiger Zugang'; end if;
  select amount into v_request_amount from public.kiosk_payment_requests where user_id=p_actor_id and status='open' order by created_at desc limit 1;
  if v_request_amount is not null then
    raise exception 'Einkauf gesperrt: Bitte zuerst die offene Rechnung über % EUR per PayPal bezahlen. Die Freigabe erfolgt nach Admin-Prüfung.', replace(to_char(v_request_amount,'FM999999990.00'),'.',',');
  end if;
  select price,name into v_price,v_name from public.kiosk_products where id=p_product_id and active=true;
  if v_price is null then raise exception 'Produkt nicht gefunden oder inaktiv'; end if;
  insert into public.kiosk_entries(user_id,product_id,quantity,unit_price) values(p_actor_id,p_product_id,greatest(p_quantity,1),v_price) returning id into v_entry;
  v_balance := public._kiosk_balance(p_actor_id);
  return jsonb_build_object('entry_id',v_entry,'product_name',v_name,'balance',v_balance,'warning',case when v_balance <= -50 then 'Dein Konto ist über 50 EUR im Minus. Bitte bezahlen.' else null end);
end;
$$;

drop function if exists public.kiosk_my_dashboard(uuid,text);
create or replace function public.kiosk_my_dashboard(p_actor_id uuid, p_actor_code text, p_month date default current_date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  result jsonb;
  month_start date := date_trunc('month',coalesce(p_month,current_date))::date;
  next_month date := (date_trunc('month',coalesce(p_month,current_date)) + interval '1 month')::date;
begin
  if not exists(select 1 from public._kiosk_actor(p_actor_id,p_actor_code)) then raise exception 'Ungültiger Zugang'; end if;
  select jsonb_build_object(
    'balance',public._kiosk_balance(p_actor_id),
    'month_label',to_char(month_start,'TMMonth YYYY'),
    'pay_info','Offene Beträge können über PayPal.Me bezahlt werden. Eine Admin-Forderung wird erst nach bestätigtem Zahlungseingang gutgeschrieben und freigegeben.',
    'paypal_me',coalesce((select value from public.kiosk_settings where key='paypal_me'),''),
    'purchase_blocked',exists(select 1 from public.kiosk_payment_requests where user_id=p_actor_id and status='open'),
    'payment_request',(select to_jsonb(r) from (
      select id,amount,note,created_at from public.kiosk_payment_requests where user_id=p_actor_id and status='open' order by created_at desc limit 1
    ) r),
    'month_spent',coalesce((select sum(e.total) from public.kiosk_entries e where e.user_id=p_actor_id and e.deleted_at is null and e.created_at>=month_start and e.created_at<next_month),0),
    'month_payments',coalesce((select sum(p.amount) from public.kiosk_payments p where p.user_id=p_actor_id and p.created_at>=month_start and p.created_at<next_month),0),
    'month_adjustments',coalesce((select sum(a.amount) from public.kiosk_adjustments a where a.user_id=p_actor_id and a.created_at>=month_start and a.created_at<next_month),0),
    'month_items',coalesce((select jsonb_agg(x order by x.created_at desc) from (
      select e.id,e.created_at,pr.name as product_name,c.title as category_title,e.quantity,e.total,pr.icon_data_url
      from public.kiosk_entries e join public.kiosk_products pr on pr.id=e.product_id left join public.kiosk_categories c on c.id=pr.category_id
      where e.user_id=p_actor_id and e.deleted_at is null and e.created_at>=month_start and e.created_at<next_month
    ) x),'[]'::jsonb),
    'notifications',coalesce((select jsonb_agg(n order by n.created_at desc) from (
      select id,title,message,amount,created_at from public.kiosk_notifications
      where user_id=p_actor_id and read_at is null and kind<>'payment_request' order by created_at desc limit 10
    ) n),'[]'::jsonb)
  ) into result;
  return result;
end;
$$;

-- Admin-Rechnungsansicht erhält den offenen Forderungsstatus je User.
create or replace function public.kiosk_admin_desktop_dashboard(
  p_actor_id uuid,
  p_actor_code text,
  p_month date default current_date
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  result jsonb;
  month_start date := date_trunc('month',coalesce(p_month,current_date))::date;
  next_month date := (date_trunc('month',coalesce(p_month,current_date)) + interval '1 month')::date;
begin
  perform public._kiosk_require_admin(p_actor_id,p_actor_code);
  select jsonb_build_object(
    'period',jsonb_build_object('month_start',month_start,'next_month',next_month,'label',to_char(month_start,'TMMonth YYYY')),
    'settings',public.kiosk_admin_get_settings(p_actor_id,p_actor_code),
    'summary',jsonb_build_object(
      'revenue',coalesce((select sum(e.total) from public.kiosk_entries e join public.kiosk_products p on p.id=e.product_id where e.deleted_at is null and coalesce(p.excluded_from_revenue,false)=false and e.created_at>=month_start and e.created_at<next_month),0),
      'gross_sales',coalesce((select sum(e.total) from public.kiosk_entries e where e.deleted_at is null and e.created_at>=month_start and e.created_at<next_month),0),
      'sales_count',(select count(*) from public.kiosk_entries e where e.deleted_at is null and e.created_at>=month_start and e.created_at<next_month),
      'units',coalesce((select sum(e.quantity) from public.kiosk_entries e where e.deleted_at is null and e.created_at>=month_start and e.created_at<next_month),0),
      'active_users',(select count(*) from public.kiosk_users where active=true),
      'open_balance',coalesce((select sum(greatest(-public._kiosk_balance(u.id),0)) from public.kiosk_users u where u.active=true),0),
      'debtors',(select count(*) from public.kiosk_users u where u.active=true and public._kiosk_balance(u.id)<0),
      'blocked_users',(select count(*) from public.kiosk_payment_requests where status='open')
    ),
    'sales',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
      select e.id,e.created_at,e.user_id,u.user_key,u.name as user_name,e.product_id,p.name as product_name,coalesce(c.title,'Ohne Kategorie') as category_title,e.quantity,e.unit_price,e.total,coalesce(p.excluded_from_revenue,false) as excluded_from_revenue
      from public.kiosk_entries e join public.kiosk_users u on u.id=e.user_id join public.kiosk_products p on p.id=e.product_id left join public.kiosk_categories c on c.id=p.category_id
      where e.deleted_at is null and e.created_at>=month_start and e.created_at<next_month
    ) x),'[]'::jsonb),
    'invoice_sales',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
      select e.id,e.created_at,e.user_id,u.user_key,u.name as user_name,e.product_id,p.name as product_name,coalesce(c.title,'Ohne Kategorie') as category_title,e.quantity,e.unit_price,e.total
      from public.kiosk_entries e join public.kiosk_users u on u.id=e.user_id join public.kiosk_products p on p.id=e.product_id left join public.kiosk_categories c on c.id=p.category_id
      where e.deleted_at is null
    ) x),'[]'::jsonb),
    'invoices',coalesce((select jsonb_agg(to_jsonb(x) order by greatest(-x.balance,0) desc,x.name) from (
      select u.id as user_id,u.user_key,u.name,u.active,coalesce(u.email,'') as email,public._kiosk_balance(u.id) as balance,
             coalesce(sum(e.total),0) as total_sales,count(e.id) as sales_count,coalesce(sum(e.quantity),0) as units,
             min(e.created_at) as first_purchase_at,max(e.created_at) as last_purchase_at,
             coalesce((select sum(p.amount) from public.kiosk_payments p where p.user_id=u.id),0) as total_payments,
             coalesce((select sum(a.amount) from public.kiosk_adjustments a where a.user_id=u.id),0) as total_adjustments,
             (select r.id from public.kiosk_payment_requests r where r.user_id=u.id and r.status='open' order by r.created_at desc limit 1) as payment_request_id,
             (select r.amount from public.kiosk_payment_requests r where r.user_id=u.id and r.status='open' order by r.created_at desc limit 1) as requested_amount,
             (select r.note from public.kiosk_payment_requests r where r.user_id=u.id and r.status='open' order by r.created_at desc limit 1) as request_note,
             (select r.created_at from public.kiosk_payment_requests r where r.user_id=u.id and r.status='open' order by r.created_at desc limit 1) as requested_at
      from public.kiosk_users u left join public.kiosk_entries e on e.user_id=u.id and e.deleted_at is null
      where u.active=true or e.id is not null
      group by u.id,u.user_key,u.name,u.active,u.email
    ) x),'[]'::jsonb),
    'top_products',coalesce((select jsonb_agg(to_jsonb(x) order by x.revenue desc) from (
      select p.id,p.name,coalesce(c.title,'Ohne Kategorie') as category_title,coalesce(sum(e.quantity),0) as units,coalesce(sum(e.total),0) as revenue
      from public.kiosk_entries e join public.kiosk_products p on p.id=e.product_id left join public.kiosk_categories c on c.id=p.category_id
      where e.deleted_at is null and e.created_at>=month_start and e.created_at<next_month
      group by p.id,p.name,c.title order by revenue desc limit 8
    ) x),'[]'::jsonb)
  ) into result;
  return result;
end;
$$;

revoke all on public.kiosk_payment_requests from public;
revoke execute on function public.kiosk_admin_create_payment_request(uuid,text,uuid,numeric,text) from public;
revoke execute on function public.kiosk_admin_confirm_payment_request(uuid,text,uuid,text) from public;
revoke execute on function public.kiosk_admin_cancel_payment_request(uuid,text,uuid) from public;
revoke execute on function public.kiosk_my_dashboard(uuid,text,date) from public;

grant execute on function public.kiosk_admin_create_payment_request(uuid,text,uuid,numeric,text) to anon,authenticated;
grant execute on function public.kiosk_admin_confirm_payment_request(uuid,text,uuid,text) to anon,authenticated;
grant execute on function public.kiosk_admin_cancel_payment_request(uuid,text,uuid) to anon,authenticated;
grant execute on function public.kiosk_my_dashboard(uuid,text,date) to anon,authenticated;

