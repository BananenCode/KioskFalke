-- KioskFalke V5: Kontoauszug mit kompletter Historie
-- Diese Migration ersetzt nur die Admin-Profil-Funktion, damit der PDF-Kontoauszug alle Produktbuchungen ausgibt.

create or replace function public.kiosk_admin_user_profile(p_actor_id uuid, p_actor_code text, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare result jsonb;
begin
  perform public._kiosk_require_admin(p_actor_id,p_actor_code);
  select jsonb_build_object(
    'user',(select jsonb_build_object('id',u.id,'user_key',u.user_key,'name',u.name,'role',u.role,'active',u.active,'balance',public._kiosk_balance(u.id)) from public.kiosk_users u where u.id=p_user_id),
    'entries',coalesce((select jsonb_agg(x order by x.created_at desc) from (select e.id,e.created_at,pr.name as product_name,c.title as category_title,e.quantity,e.total,e.deleted_at from public.kiosk_entries e join public.kiosk_products pr on pr.id=e.product_id left join public.kiosk_categories c on c.id=pr.category_id where e.user_id=p_user_id order by e.created_at desc) x),'[]'::jsonb),
    'payments',coalesce((select jsonb_agg(p order by p.created_at desc) from (select id,created_at,amount,note from public.kiosk_payments where user_id=p_user_id order by created_at desc) p),'[]'::jsonb),
    'adjustments',coalesce((select jsonb_agg(a order by a.created_at desc) from (select id,created_at,amount,note from public.kiosk_adjustments where user_id=p_user_id order by created_at desc) a),'[]'::jsonb),
    'movements',coalesce((select jsonb_agg(m order by m.created_at desc) from (
      select e.id, e.created_at, 'entry' as kind, 'Kauf' as type_label, pr.name as title, coalesce(c.title,'Ohne Kategorie') as note, -e.total as amount from public.kiosk_entries e join public.kiosk_products pr on pr.id=e.product_id left join public.kiosk_categories c on c.id=pr.category_id where e.user_id=p_user_id and e.deleted_at is null
      union all select p.id, p.created_at, 'payment', 'Zahlung', 'Zahlung', p.note, p.amount from public.kiosk_payments p where p.user_id=p_user_id
      union all select a.id, a.created_at, 'adjustment', 'Korrektur', 'Korrektur', a.note, a.amount from public.kiosk_adjustments a where a.user_id=p_user_id
      order by created_at desc
    ) m),'[]'::jsonb)
  ) into result;
  return result;
end;
$$;
