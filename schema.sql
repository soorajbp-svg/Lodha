-- ============================================================
-- NPV Loss Calculator – Supabase Schema
-- Run this entire file in Supabase → SQL Editor → New Query
-- ============================================================

-- 1. TOWERS
CREATE TABLE public.towers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  possession_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. UNITS
CREATE TABLE public.units (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tower_id UUID REFERENCES public.towers(id) ON DELETE CASCADE,
  unit_no TEXT NOT NULL,
  floor INTEGER NOT NULL,
  typology TEXT,
  carpet NUMERIC,
  ebvt NUMERIC,
  net_area NUMERIC,
  car_parking INTEGER DEFAULT 0,
  cv_evo NUMERIC,
  cv_no_buffer NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tower_id, unit_no)
);

-- 3. PAYMENT SCHEDULES (one per tower)
CREATE TABLE public.payment_schedules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tower_id UUID REFERENCES public.towers(id) ON DELETE CASCADE UNIQUE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. SCHEDULE MILESTONES
CREATE TABLE public.schedule_milestones (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  schedule_id UUID REFERENCES public.payment_schedules(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  milestone_date DATE,
  is_booking_relative BOOLEAN DEFAULT FALSE,
  relative_days INTEGER DEFAULT 0,
  pct NUMERIC NOT NULL CHECK (pct >= 0 AND pct <= 100),
  sort_order INTEGER NOT NULL
);

-- 5. PROFILES (extends Supabase auth.users)
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT,
  role TEXT NOT NULL CHECK (role IN ('site_head', 'business_head', 'super_admin')),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. USER → TOWER ACCESS (for site heads)
CREATE TABLE public.user_tower_access (
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  tower_id UUID REFERENCES public.towers(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, tower_id)
);

-- 7. AUDIT LOG
CREATE TABLE public.audit_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id),
  user_email TEXT,
  action TEXT NOT NULL,
  entity TEXT,
  entity_id TEXT,
  description TEXT,
  old_values JSONB,
  new_values JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE public.towers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_tower_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Helper: get current user role
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER;

-- Towers: business_head and super_admin see all; site_head sees assigned only
CREATE POLICY "towers_select" ON public.towers FOR SELECT USING (
  public.get_my_role() IN ('business_head', 'super_admin')
  OR id IN (
    SELECT tower_id FROM public.user_tower_access WHERE user_id = auth.uid()
  )
);
CREATE POLICY "towers_admin" ON public.towers FOR ALL USING (public.get_my_role() = 'super_admin');

-- Units: same as towers
CREATE POLICY "units_select" ON public.units FOR SELECT USING (
  public.get_my_role() IN ('business_head', 'super_admin')
  OR tower_id IN (
    SELECT tower_id FROM public.user_tower_access WHERE user_id = auth.uid()
  )
);
CREATE POLICY "units_admin" ON public.units FOR ALL USING (public.get_my_role() = 'super_admin');

-- Payment schedules
CREATE POLICY "schedules_select" ON public.payment_schedules FOR SELECT USING (
  public.get_my_role() IN ('business_head', 'super_admin')
  OR tower_id IN (
    SELECT tower_id FROM public.user_tower_access WHERE user_id = auth.uid()
  )
);
CREATE POLICY "schedules_admin" ON public.payment_schedules FOR ALL USING (public.get_my_role() = 'super_admin');

-- Milestones: join through schedule
CREATE POLICY "milestones_select" ON public.schedule_milestones FOR SELECT USING (
  schedule_id IN (SELECT id FROM public.payment_schedules)
);
CREATE POLICY "milestones_admin" ON public.schedule_milestones FOR ALL USING (public.get_my_role() = 'super_admin');

-- Profiles: users see their own; admin sees all
CREATE POLICY "profiles_self" ON public.profiles FOR SELECT USING (id = auth.uid() OR public.get_my_role() = 'super_admin');
CREATE POLICY "profiles_admin" ON public.profiles FOR ALL USING (public.get_my_role() = 'super_admin');

-- User tower access
CREATE POLICY "uta_select" ON public.user_tower_access FOR SELECT USING (
  user_id = auth.uid() OR public.get_my_role() = 'super_admin'
);
CREATE POLICY "uta_admin" ON public.user_tower_access FOR ALL USING (public.get_my_role() = 'super_admin');

-- Audit log: super_admin only
CREATE POLICY "audit_admin" ON public.audit_log FOR ALL USING (public.get_my_role() = 'super_admin');

-- ============================================================
-- AUTO-CREATE PROFILE ON SIGNUP
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'role', 'site_head'));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
