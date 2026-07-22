-- KioskFalke V10: Gesamtabrechnung, geprüfte PayPal-Zahlungen und User-Mitteilungen
-- Nach V9 einmal vollständig im Supabase SQL Editor ausführen.

create table if not exists public.kiosk_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.kiosk_users(id) on delete cascade,
  title text not null,
  message text not null,
  amount numeric(10,2),
  created_by uuid references public.kiosk_users(id),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists kiosk_notifications_user_unread_idx
  on public.kiosk_notifications(user_id,created_at desc)
  where read_at is null;

alter table public.kiosk_notifications enable row level security;
drop policy if exists deny_notifications on public.kiosk_notifications;
create policy deny_notifications on public.kiosk_notifications for all using (false) with check (false);

-- Für User sind Name, User-ID, Rolle, Code und optional E-Mail ausreichend.
drop function if exists public.kiosk_admin_users(uuid,text);
create function public.kiosk_admin_users(p_actor_id uuid, p_actor_code text)
returns table(
  id uuid,
  user_key text,
  name text,
  role text,
  active boolean,
  balance numeric,
  email text,
  created_at timestamptz
)
language plpgsql security definer set search_path = public as $$
begin
  perform public._kiosk_require_admin(p_actor_id,p_actor_code);
  return query
  select u.id,u.user_key,u.name,u.role,u.active,public._kiosk_balance(u.id),coalesce(u.email,''),u.created_at
  from public.kiosk_users u
  order by u.active desc,u.name;
end;
$$;

drop function if exists public.kiosk_admin_upsert_user(uuid,text,uuid,text,text,text,text,boolean,text,text);
drop function if exists public.kiosk_admin_upsert_user(uuid,text,uuid,text,text,text,text,boolean,text);
create function public.kiosk_admin_upsert_user(
  p_actor_id uuid,
  p_actor_code text,
  p_user_id uuid,
  p_user_key text,
  p_name text,
  p_role text,
  p_code text,
  p_active boolean,
  p_email text default ''
)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare
  out_id uuid;
  active_admins integer;
begin
  perform public._kiosk_require_admin(p_actor_id,p_actor_code);
  if length(trim(p_user_key)) < 2 then raise exception 'User_ID zu kurz'; end if;
  if length(trim(p_name)) < 2 then raise exception 'Name zu kurz'; end if;
  if p_role not in ('admin','user') then raise exception 'Rolle ungültig'; end if;
  if coalesce(trim(p_email),'') <> '' and trim(p_email) !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'E-Mail-Adresse ungültig'; end if;

  if p_user_id is null then
    if length(trim(p_code)) < 4 then raise exception 'Code mindestens 4 Zeichen'; end if;
    insert into public.kiosk_users(user_key,name,role,code_hash,active,email)
    values(trim(p_user_key),trim(p_name),p_role,extensions.crypt(trim(p_code),extensions.gen_salt('bf')),coalesce(p_active,true),trim(coalesce(p_email,'')))
    returning id into out_id;
  else
    if exists(select 1 from public.kiosk_users where id=p_user_id and role='admin' and active=true)
       and (p_role <> 'admin' or coalesce(p_active,true)=false) then
      select count(*) into active_admins from public.kiosk_users where role='admin' and active=true and id<>p_user_id;
      if active_admins < 1 then raise exception 'Der letzte aktive Admin kann nicht deaktiviert oder zum User geändert werden'; end if;
    end if;
    update public.kiosk_users
    set user_key=trim(p_user_key),name=trim(p_name),role=p_role,active=coalesce(p_active,true),email=trim(coalesce(p_email,'')),updated_at=now()
    where id=p_user_id returning id into out_id;
    if length(coalesce(trim(p_code),'')) >= 4 then
      update public.kiosk_users set code_hash=extensions.crypt(trim(p_code),extensions.gen_salt('bf')) where id=p_user_id;
    end if;
  end if;
  return out_id;
end;
$$;

-- Das Bestätigen einer geprüften Zahlung ist atomar: Buchung + User-Mitteilung.
drop function if exists public.kiosk_admin_add_payment(uuid,text,uuid,numeric,text);
create function public.kiosk_admin_add_payment(
  p_actor_id uuid,
  p_actor_code text,
  p_user_id uuid,
  p_amount numeric,
  p_note text
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  out_payment_id uuid;
  v_amount numeric(10,2) := round(p_amount,2);
  v_balance numeric(10,2);
begin
  perform public._kiosk_require_admin(p_actor_id,p_actor_code);
  if v_amount <= 0 then raise exception 'Zahlbetrag muss größer als 0 sein'; end if;
  if not exists(select 1 from public.kiosk_users where id=p_user_id) then raise exception 'User nicht gefunden'; end if;

  insert into public.kiosk_payments(user_id,amount,note,created_by)
  values(p_user_id,v_amount,coalesce(nullif(trim(p_note),''),'PayPal-Zahlung geprüft'),p_actor_id)
  returning id into out_payment_id;

  insert into public.kiosk_notifications(user_id,title,message,amount,created_by)
  values(
    p_user_id,
    'Zahlung bestätigt',
    'Der Betrag ' || replace(to_char(v_amount,'FM999999990.00'),'.',',') || ' EUR wurde überwiesen und deinem Kiosk-Konto als Guthaben gutgeschrieben.',
    v_amount,
    p_actor_id
  );

  v_balance := public._kiosk_balance(p_user_id);
  return jsonb_build_object('payment_id',out_payment_id,'amount',v_amount,'balance',v_balance);
end;
$$;

create or replace function public.kiosk_mark_notification_read(
  p_actor_id uuid,
  p_actor_code text,
  p_notification_id uuid
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists(select 1 from public._kiosk_actor(p_actor_id,p_actor_code)) then raise exception 'Ungültiger Zugang'; end if;
  update public.kiosk_notifications set read_at=coalesce(read_at,now()) where id=p_notification_id and user_id=p_actor_id;
end;
$$;

-- User-Dashboard: Monat bleibt als praktische Übersicht, neue Zahlungsmitteilungen kommen hinzu.
create or replace function public.kiosk_my_dashboard(p_actor_id uuid, p_actor_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  result jsonb;
  month_start date := date_trunc('month',now())::date;
  next_month date := (date_trunc('month',now()) + interval '1 month')::date;
begin
  if not exists(select 1 from public._kiosk_actor(p_actor_id,p_actor_code)) then raise exception 'Ungültiger Zugang'; end if;
  select jsonb_build_object(
    'balance',public._kiosk_balance(p_actor_id),
    'month_label',to_char(month_start,'TMMonth YYYY'),
    'pay_info','Offene Beträge können über PayPal.Me bezahlt werden. Die Gutschrift erfolgt nach Prüfung durch den Admin.',
    'paypal_me',coalesce((select value from public.kiosk_settings where key='paypal_me'),''),
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
      where user_id=p_actor_id and read_at is null order by created_at desc limit 10
    ) n),'[]'::jsonb)
  ) into result;
  return result;
end;
$$;

-- Monatsdaten für Dashboard/Verkäufe, aber Rechnungen und invoice_sales immer über den Gesamtzeitraum.
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
      'debtors',(select count(*) from public.kiosk_users u where u.active=true and public._kiosk_balance(u.id)<0)
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
             coalesce((select sum(a.amount) from public.kiosk_adjustments a where a.user_id=u.id),0) as total_adjustments
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

revoke all on public.kiosk_notifications from public;
revoke execute on function public.kiosk_admin_users(uuid,text) from public;
revoke execute on function public.kiosk_admin_upsert_user(uuid,text,uuid,text,text,text,text,boolean,text) from public;
revoke execute on function public.kiosk_admin_add_payment(uuid,text,uuid,numeric,text) from public;
revoke execute on function public.kiosk_mark_notification_read(uuid,text,uuid) from public;
revoke execute on function public.kiosk_my_dashboard(uuid,text) from public;
revoke execute on function public.kiosk_admin_desktop_dashboard(uuid,text,date) from public;

grant execute on function public.kiosk_admin_users(uuid,text) to anon,authenticated;
grant execute on function public.kiosk_admin_upsert_user(uuid,text,uuid,text,text,text,text,boolean,text) to anon,authenticated;
grant execute on function public.kiosk_admin_add_payment(uuid,text,uuid,numeric,text) to anon,authenticated;
grant execute on function public.kiosk_mark_notification_read(uuid,text,uuid) to anon,authenticated;
grant execute on function public.kiosk_my_dashboard(uuid,text) to anon,authenticated;
grant execute on function public.kiosk_admin_desktop_dashboard(uuid,text,date) to anon,authenticated;

