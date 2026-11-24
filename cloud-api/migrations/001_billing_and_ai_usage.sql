-- Collector billing and AI usage metering.
-- Apply in Supabase SQL Editor or through the project's migration pipeline.
create table if not exists public.collector_entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  entitlement text not null default 'free' check (entitlement in ('free','pro')),
  product_id text,
  store text check (store in ('app_store','play_store','promotional') or store is null),
  is_active boolean not null default false,
  expires_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.collector_ai_budgets (
  user_id uuid not null references auth.users(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  budget_microusd bigint not null check (budget_microusd >= 0),
  used_microusd bigint not null default 0 check (used_microusd >= 0),
  reserved_microusd bigint not null default 0 check (reserved_microusd >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, period_start),
  check (period_end > period_start)
);

create table if not exists public.collector_ai_usage (
  request_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  period_start date not null,
  reserved_microusd bigint not null check (reserved_microusd >= 0),
  actual_microusd bigint not null default 0 check (actual_microusd >= 0),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  model text,
  status text not null check (status in ('reserved','completed','failed')),
  created_at timestamptz not null default now(),
  settled_at timestamptz
);
create index if not exists collector_ai_usage_user_period_idx
  on public.collector_ai_usage(user_id, period_start, created_at desc);

create or replace function public.collector_reserve_ai_usage(
  p_user_id uuid, p_request_id uuid, p_period_start date, p_period_end date,
  p_budget_microusd bigint, p_reserve_microusd bigint
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_entitlement public.collector_entitlements%rowtype;
  v_budget public.collector_ai_budgets%rowtype;
begin
  if p_budget_microusd < 0 or p_reserve_microusd <= 0 or p_period_end <= p_period_start then
    raise exception 'invalid_usage_budget';
  end if;
  select * into v_entitlement from public.collector_entitlements
    where user_id = p_user_id for share;
  if not found or v_entitlement.entitlement <> 'pro' or not v_entitlement.is_active
     or (v_entitlement.expires_at is not null and v_entitlement.expires_at <= now()) then
    return jsonb_build_object('allowed', false, 'reason', 'subscription_required');
  end if;

  insert into public.collector_ai_budgets(user_id,period_start,period_end,budget_microusd)
    values(p_user_id,p_period_start,p_period_end,p_budget_microusd)
    on conflict(user_id,period_start) do nothing;
  select * into v_budget from public.collector_ai_budgets
    where user_id=p_user_id and period_start=p_period_start for update;

  if exists(select 1 from public.collector_ai_usage where request_id=p_request_id) then
    return jsonb_build_object('allowed', false, 'reason', 'duplicate_request');
  end if;
  if v_budget.used_microusd + v_budget.reserved_microusd + p_reserve_microusd > v_budget.budget_microusd then
    return jsonb_build_object('allowed', false, 'reason', 'monthly_budget_exceeded',
      'used_microusd',v_budget.used_microusd,'reserved_microusd',v_budget.reserved_microusd,
      'budget_microusd',v_budget.budget_microusd);
  end if;

  insert into public.collector_ai_usage(request_id,user_id,period_start,reserved_microusd,status)
    values(p_request_id,p_user_id,p_period_start,p_reserve_microusd,'reserved');
  update public.collector_ai_budgets set reserved_microusd=reserved_microusd+p_reserve_microusd,
    updated_at=now() where user_id=p_user_id and period_start=p_period_start;
  return jsonb_build_object('allowed',true,'budget_microusd',v_budget.budget_microusd,
    'used_microusd',v_budget.used_microusd,'reserved_microusd',v_budget.reserved_microusd+p_reserve_microusd);
end;
$$;

create or replace function public.collector_settle_ai_usage(
  p_user_id uuid, p_request_id uuid, p_actual_microusd bigint,
  p_input_tokens integer, p_output_tokens integer, p_model text, p_failed boolean default false
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_usage public.collector_ai_usage%rowtype;
  v_budget public.collector_ai_budgets%rowtype;
  v_actual bigint;
begin
  if p_actual_microusd < 0 or p_input_tokens < 0 or p_output_tokens < 0 then
    raise exception 'invalid_usage_settlement';
  end if;
  select * into v_usage from public.collector_ai_usage
    where request_id=p_request_id and user_id=p_user_id for update;
  if not found then raise exception 'usage_reservation_not_found'; end if;
  if v_usage.status <> 'reserved' then
    return jsonb_build_object('settled',true,'duplicate',true,'actual_microusd',v_usage.actual_microusd);
  end if;
  v_actual := case when p_failed then 0 else p_actual_microusd end;
  select * into v_budget from public.collector_ai_budgets
    where user_id=p_user_id and period_start=v_usage.period_start for update;
  update public.collector_ai_budgets set
    reserved_microusd=greatest(0,reserved_microusd-v_usage.reserved_microusd),
    used_microusd=used_microusd+v_actual, updated_at=now()
    where user_id=p_user_id and period_start=v_usage.period_start;
  update public.collector_ai_usage set actual_microusd=v_actual,
    input_tokens=case when p_failed then 0 else p_input_tokens end,
    output_tokens=case when p_failed then 0 else p_output_tokens end,
    model=p_model, status=case when p_failed then 'failed' else 'completed' end,
    settled_at=now() where request_id=p_request_id;
  return jsonb_build_object('settled',true,'actual_microusd',v_actual,
    'used_microusd',v_budget.used_microusd+v_actual,
    'budget_microusd',v_budget.budget_microusd);
end;
$$;

-- Only the server's service-role key may invoke metering functions.
revoke all on function public.collector_reserve_ai_usage(uuid,uuid,date,date,bigint,bigint) from public, anon, authenticated;
revoke all on function public.collector_settle_ai_usage(uuid,uuid,bigint,integer,integer,text,boolean) from public, anon, authenticated;
grant execute on function public.collector_reserve_ai_usage(uuid,uuid,date,date,bigint,bigint) to service_role;
grant execute on function public.collector_settle_ai_usage(uuid,uuid,bigint,integer,integer,text,boolean) to service_role;

alter table public.collector_entitlements enable row level security;
alter table public.collector_ai_budgets enable row level security;
alter table public.collector_ai_usage enable row level security;
revoke all on public.collector_entitlements, public.collector_ai_budgets, public.collector_ai_usage from anon, authenticated;


create table if not exists public.collector_billing_events (
  event_id text primary key,
  user_id uuid,
  event_type text not null,
  product_id text,
  received_at timestamptz not null default now()
);

create or replace function public.collector_apply_revenuecat_event(
  p_event_id text, p_user_id uuid, p_event_type text, p_product_id text,
  p_store text, p_expires_at timestamptz, p_is_pro_product boolean
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_active boolean;
begin
  if coalesce(length(trim(p_event_id)),0)=0 or coalesce(length(trim(p_event_type)),0)=0 then
    raise exception 'invalid_revenuecat_event';
  end if;
  insert into public.collector_billing_events(event_id,user_id,event_type,product_id)
    values(p_event_id,p_user_id,p_event_type,p_product_id)
    on conflict(event_id) do nothing;
  if not found then return jsonb_build_object('processed',true,'duplicate',true); end if;
  if p_user_id is null or not p_is_pro_product then
    return jsonb_build_object('processed',true,'ignored',true);
  end if;

  if p_event_type in ('INITIAL_PURCHASE','RENEWAL','PRODUCT_CHANGE','UNCANCELLATION','BILLING_ISSUE','CANCELLATION') then
    v_active := p_expires_at is null or p_expires_at > now();
  elsif p_event_type in ('EXPIRATION','REFUND','SUBSCRIPTION_PAUSED') then
    v_active := false;
  else
    return jsonb_build_object('processed',true,'ignored',true);
  end if;

  insert into public.collector_entitlements(user_id,entitlement,product_id,store,is_active,expires_at,updated_at)
    values(p_user_id,case when v_active then 'pro' else 'free' end,p_product_id,p_store,v_active,p_expires_at,now())
    on conflict(user_id) do update set entitlement=excluded.entitlement,
      product_id=excluded.product_id,store=excluded.store,is_active=excluded.is_active,
      expires_at=excluded.expires_at,updated_at=now();
  return jsonb_build_object('processed',true,'active',v_active);
end;
$$;

revoke all on function public.collector_apply_revenuecat_event(text,uuid,text,text,text,timestamptz,boolean) from public, anon, authenticated;
grant execute on function public.collector_apply_revenuecat_event(text,uuid,text,text,text,timestamptz,boolean) to service_role;
alter table public.collector_billing_events enable row level security;
revoke all on public.collector_billing_events from anon, authenticated;
