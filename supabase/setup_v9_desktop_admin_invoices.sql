-- KioskFalke V9: Desktop-Admin, Monatsverkäufe und Rechnungsdaten
-- Nach den bisherigen Migrationen einmal im Supabase SQL Editor ausführen.

alter table public.kiosk_users add column if not exists email text not null default '';
alter table public.kiosk_users add column if not exists billing_address text not null default '';

-- Rückgabetyp wurde um Rechnungsdaten erweitert, daher neu anlegen.
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
  billing_address text,
  created_at timestamptz
)
language plpgsql security definer set search_path = public as $$
begin
  perform public._kiosk_require_admin(p_actor_id,p_actor_code);
  return query
  select
    u.id,
    u.user_key,
    u.name,
    u.role,
    u.active,
    public._kiosk_balance(u.id),
    coalesce(u.email,''),
    coalesce(u.billing_address,''),
    u.created_at
  from public.kiosk_users u
  order by u.active desc, u.name;
end;
$$;

-- Erweiterte User-Pflege für E-Mail und Rechnungsanschrift.
drop function if exists public.kiosk_admin_upsert_user(uuid,text,uuid,text,text,text,text,boolean);
drop function if exists public.kiosk_admin_upsert_user(uuid,text,uuid,text,text,text,text,boolean,text,text);
create function public.kiosk_admin_upsert_user(
  p_actor_id uuid,
  p_actor_code text,
  p_user_id uuid,
  p_user_key text,
  p_name text,
  p_role text,
  p_code text,
  p_active boolean,
  p_email text default '',
  p_billing_address text default ''
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
  if coalesce(trim(p_email),'') <> '' and trim(p_email) !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'E-Mail-Adresse ungültig';
  end if;

  if p_user_id is null then
    if length(trim(p_code)) < 4 then raise exception 'Code mindestens 4 Zeichen'; end if;
    insert into public.kiosk_users(user_key,name,role,code_hash,active,email,billing_address)
    values(
      trim(p_user_key), trim(p_name), p_role,
      extensions.crypt(trim(p_code),extensions.gen_salt('bf')),
      coalesce(p_active,true), trim(coalesce(p_email,'')), trim(coalesce(p_billing_address,''))
    ) returning id into out_id;
  else
    -- Der letzte aktive Admin darf nicht deaktiviert oder herabgestuft werden.
    if exists(select 1 from public.kiosk_users where id=p_user_id and role='admin' and active=true)
       and (p_role <> 'admin' or coalesce(p_active,true)=false) then
      select count(*) into active_admins
      from public.kiosk_users
      where role='admin' and active=true and id<>p_user_id;
      if active_admins < 1 then raise exception 'Der letzte aktive Admin kann nicht deaktiviert oder zum User geändert werden'; end if;
    end if;

    update public.kiosk_users
    set user_key=trim(p_user_key),
        name=trim(p_name),
        role=p_role,
        active=coalesce(p_active,true),
        email=trim(coalesce(p_email,'')),
        billing_address=trim(coalesce(p_billing_address,'')),
        updated_at=now()
    where id=p_user_id
    returning id into out_id;

    if length(coalesce(trim(p_code),'')) >= 4 then
      update public.kiosk_users
      set code_hash=extensions.crypt(trim(p_code),extensions.gen_salt('bf'))
      where id=p_user_id;
    end if;
  end if;
  return out_id;
end;
$$;

-- Vollständiges Profil inklusive Rechnungsdaten.
drop function if exists public.kiosk_admin_user_profile(uuid,text,uuid);
create function public.kiosk_admin_user_profile(p_actor_id uuid, p_actor_code text, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare result jsonb;
begin
  perform public._kiosk_require_admin(p_actor_id,p_actor_code);
  select jsonb_build_object(
    'user',(select jsonb_build_object(
      'id',u.id,'user_key',u.user_key,'name',u.name,'role',u.role,'active',u.active,
      'email',coalesce(u.email,''),'billing_address',coalesce(u.billing_address,''),
      'balance',public._kiosk_balance(u.id)
    ) from public.kiosk_users u where u.id=p_user_id),
    'entries',coalesce((select jsonb_agg(x order by x.created_at desc) from (
      select e.id,e.created_at,pr.name as product_name,c.title as category_title,
             e.quantity,e.unit_price,e.total,e.deleted_at,e.deleted_reason
      from public.kiosk_entries e
      join public.kiosk_products pr on pr.id=e.product_id
      left join public.kiosk_categories c on c.id=pr.category_id
      where e.user_id=p_user_id
      order by e.created_at desc
    ) x),'[]'::jsonb),
    'payments',coalesce((select jsonb_agg(p order by p.created_at desc) from (
      select id,created_at,amount,note from public.kiosk_payments where user_id=p_user_id order by created_at desc
    ) p),'[]'::jsonb),
    'adjustments',coalesce((select jsonb_agg(a order by a.created_at desc) from (
      select id,created_at,amount,note from public.kiosk_adjustments where user_id=p_user_id order by created_at desc
    ) a),'[]'::jsonb),
    'movements',coalesce((select jsonb_agg(m order by m.created_at desc) from (
      select e.id, e.created_at, 'entry' as kind, 'Kauf' as type_label,
             pr.name as title, coalesce(c.title,'Ohne Kategorie') as note, -e.total as amount
      from public.kiosk_entries e
      join public.kiosk_products pr on pr.id=e.product_id
      left join public.kiosk_categories c on c.id=pr.category_id
      where e.user_id=p_user_id and e.deleted_at is null
      union all
      select p.id,p.created_at,'payment','Zahlung','Zahlung',p.note,p.amount
      from public.kiosk_payments p where p.user_id=p_user_id
      union all
      select a.id,a.created_at,'adjustment','Korrektur','Korrektur',a.note,a.amount
      from public.kiosk_adjustments a where a.user_id=p_user_id
    ) m),'[]'::jsonb)
  ) into result;
  return result;
end;
$$;

-- Rechnungseinstellungen werden in kiosk_settings gespeichert.
create or replace function public.kiosk_admin_get_settings(p_actor_id uuid, p_actor_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public._kiosk_require_admin(p_actor_id,p_actor_code);
  return jsonb_build_object(
    'paypal_me', coalesce((select value from public.kiosk_settings where key='paypal_me'),''),
    'invoice_issuer', coalesce((select value from public.kiosk_settings where key='invoice_issuer'),'KioskFalke'),
    'invoice_address', coalesce((select value from public.kiosk_settings where key='invoice_address'),''),
    'invoice_email', coalesce((select value from public.kiosk_settings where key='invoice_email'),''),
    'invoice_tax_id', coalesce((select value from public.kiosk_settings where key='invoice_tax_id'),''),
    'invoice_payment_text', coalesce((select value from public.kiosk_settings where key='invoice_payment_text'),'Bitte den offenen Betrag zeitnah ausgleichen.'),
    'invoice_footer', coalesce((select value from public.kiosk_settings where key='invoice_footer'),'Vielen Dank.')
  );
end;
$$;

create or replace function public.kiosk_admin_set_invoice_settings(
  p_actor_id uuid,
  p_actor_code text,
  p_invoice_issuer text,
  p_invoice_address text,
  p_invoice_email text,
  p_invoice_tax_id text,
  p_invoice_payment_text text,
  p_invoice_footer text
)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public._kiosk_require_admin(p_actor_id,p_actor_code);
  if length(trim(coalesce(p_invoice_issuer,''))) < 2 then raise exception 'Absendername fehlt'; end if;

  insert into public.kiosk_settings(key,value,updated_by,updated_at) values
    ('invoice_issuer',trim(coalesce(p_invoice_issuer,'')),p_actor_id,now()),
    ('invoice_address',trim(coalesce(p_invoice_address,'')),p_actor_id,now()),
    ('invoice_email',trim(coalesce(p_invoice_email,'')),p_actor_id,now()),
    ('invoice_tax_id',trim(coalesce(p_invoice_tax_id,'')),p_actor_id,now()),
    ('invoice_payment_text',trim(coalesce(p_invoice_payment_text,'')),p_actor_id,now()),
    ('invoice_footer',trim(coalesce(p_invoice_footer,'')),p_actor_id,now())
  on conflict(key) do update set value=excluded.value,updated_by=excluded.updated_by,updated_at=excluded.updated_at;

  return public.kiosk_admin_get_settings(p_actor_id,p_actor_code);
end;
$$;

-- Gemeinsame Datenbasis für Dashboard, Verkäufe und Monatsrechnungen.
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
    'period',jsonb_build_object(
      'month_start',month_start,
      'next_month',next_month,
      'label',to_char(month_start,'TMMonth YYYY')
    ),
    'settings',public.kiosk_admin_get_settings(p_actor_id,p_actor_code),
    'summary',jsonb_build_object(
      'revenue',coalesce((select sum(e.total) from public.kiosk_entries e
        join public.kiosk_products p on p.id=e.product_id
        where e.deleted_at is null and coalesce(p.excluded_from_revenue,false)=false
          and e.created_at>=month_start and e.created_at<next_month),0),
      'gross_sales',coalesce((select sum(e.total) from public.kiosk_entries e
        where e.deleted_at is null and e.created_at>=month_start and e.created_at<next_month),0),
      'sales_count',(select count(*) from public.kiosk_entries e
        where e.deleted_at is null and e.created_at>=month_start and e.created_at<next_month),
      'units',coalesce((select sum(e.quantity) from public.kiosk_entries e
        where e.deleted_at is null and e.created_at>=month_start and e.created_at<next_month),0),
      'active_users',(select count(*) from public.kiosk_users where active=true),
      'open_balance',coalesce((select sum(greatest(-public._kiosk_balance(u.id),0)) from public.kiosk_users u where u.active=true),0),
      'debtors',(select count(*) from public.kiosk_users u where u.active=true and public._kiosk_balance(u.id)<0)
    ),
    'sales',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
      select e.id,e.created_at,e.user_id,u.user_key,u.name as user_name,
             e.product_id,p.name as product_name,coalesce(c.title,'Ohne Kategorie') as category_title,
             e.quantity,e.unit_price,e.total,coalesce(p.excluded_from_revenue,false) as excluded_from_revenue
      from public.kiosk_entries e
      join public.kiosk_users u on u.id=e.user_id
      join public.kiosk_products p on p.id=e.product_id
      left join public.kiosk_categories c on c.id=p.category_id
      where e.deleted_at is null and e.created_at>=month_start and e.created_at<next_month
    ) x),'[]'::jsonb),
    'invoices',coalesce((select jsonb_agg(to_jsonb(x) order by x.month_total desc,x.name) from (
      select u.id as user_id,u.user_key,u.name,u.active,coalesce(u.email,'') as email,
             coalesce(u.billing_address,'') as billing_address,public._kiosk_balance(u.id) as balance,
             coalesce(sum(e.total),0) as month_total,
             count(e.id) as sales_count,
             coalesce(sum(e.quantity),0) as units,
             coalesce((select sum(p.amount) from public.kiosk_payments p
               where p.user_id=u.id and p.created_at>=month_start and p.created_at<next_month),0) as month_payments,
             coalesce((select sum(a.amount) from public.kiosk_adjustments a
               where a.user_id=u.id and a.created_at>=month_start and a.created_at<next_month),0) as month_adjustments
      from public.kiosk_users u
      left join public.kiosk_entries e on e.user_id=u.id and e.deleted_at is null
        and e.created_at>=month_start and e.created_at<next_month
      where u.active=true or e.id is not null
      group by u.id,u.user_key,u.name,u.active,u.email,u.billing_address
    ) x),'[]'::jsonb),
    'top_products',coalesce((select jsonb_agg(to_jsonb(x) order by x.revenue desc) from (
      select p.id,p.name,coalesce(c.title,'Ohne Kategorie') as category_title,
             coalesce(sum(e.quantity),0) as units,coalesce(sum(e.total),0) as revenue
      from public.kiosk_entries e
      join public.kiosk_products p on p.id=e.product_id
      left join public.kiosk_categories c on c.id=p.category_id
      where e.deleted_at is null and e.created_at>=month_start and e.created_at<next_month
      group by p.id,p.name,c.title
      order by revenue desc
      limit 8
    ) x),'[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke execute on function public.kiosk_admin_users(uuid,text) from public;
revoke execute on function public.kiosk_admin_upsert_user(uuid,text,uuid,text,text,text,text,boolean,text,text) from public;
revoke execute on function public.kiosk_admin_user_profile(uuid,text,uuid) from public;
revoke execute on function public.kiosk_admin_get_settings(uuid,text) from public;
revoke execute on function public.kiosk_admin_set_invoice_settings(uuid,text,text,text,text,text,text,text) from public;
revoke execute on function public.kiosk_admin_desktop_dashboard(uuid,text,date) from public;

grant execute on function public.kiosk_admin_users(uuid,text) to anon,authenticated;
grant execute on function public.kiosk_admin_upsert_user(uuid,text,uuid,text,text,text,text,boolean,text,text) to anon,authenticated;
grant execute on function public.kiosk_admin_user_profile(uuid,text,uuid) to anon,authenticated;
grant execute on function public.kiosk_admin_get_settings(uuid,text) to anon,authenticated;
grant execute on function public.kiosk_admin_set_invoice_settings(uuid,text,text,text,text,text,text,text) to anon,authenticated;
grant execute on function public.kiosk_admin_desktop_dashboard(uuid,text,date) to anon,authenticated;
