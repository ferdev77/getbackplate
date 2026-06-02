-- Agrega integration_plan_id a organizations para soportar dos planes simultáneos:
-- uno de plataforma (plan_id) y uno de integración (integration_plan_id).
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS integration_plan_id UUID REFERENCES public.plans(id) ON DELETE SET NULL;

-- Habilita los módulos qbo_r365, custom_branding y settings en los 4 planes de integración QBO.
-- Esto permite que syncOrganizationPlan() los active igual que cualquier otro módulo del plan.
INSERT INTO public.plan_modules (plan_id, module_id, is_enabled)
SELECT p.id, mc.id, true
FROM public.plans p
CROSS JOIN public.module_catalog mc
WHERE p.plan_type = 'qbo_r365'
  AND mc.code IN ('qbo_r365', 'custom_branding', 'settings')
ON CONFLICT (plan_id, module_id) DO UPDATE SET is_enabled = true;
