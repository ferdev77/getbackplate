"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ChevronDown } from "lucide-react";

type PlanInput = {
  id: string;
  code?: string;
  name: string;
  description?: string | null;
  price_amount?: number | null;
  billing_period?: string | null;
  max_branches?: number | null;
  max_users?: number | null;
  max_employees?: number | null;
  max_storage_mb?: number | null;
  modules_count?: number | null;
  modules?: Array<{ code: string; name: string }>;
};

type Props = {
  plans: PlanInput[];
};

type Lang = "en" | "es";

function formatPrice(value: number | null | undefined) {
  if (!value && value !== 0) return "Custom";
  return `$${value}`;
}

function planTier(code: string) {
  const c = code.toLowerCase();
  if (c.includes("pro")) return "pro";
  if (c.includes("grow")) return "growth";
  if (c.includes("starter") || c.includes("basic") || c.includes("basico")) return "starter";
  return "other";
}

export function LandingExperience({ plans }: Props) {
  const router = useRouter();
  const [darkMode, setDarkMode] = useState(false);
  const [lang, setLang] = useState<Lang>("en");
  const [billingMode, setBillingMode] = useState<"monthly" | "annual">("monthly");
  const [megaOpen, setMegaOpen] = useState(false);
  const [faqOpen, setFaqOpen] = useState<number | null>(0);
  const [loadingPlanId, setLoadingPlanId] = useState<string | null>(null);
  const [floatPaused, setFloatPaused] = useState(false);

  useEffect(() => {
    const savedTheme = localStorage.getItem("gbp-marketing-theme");
    const savedLang = localStorage.getItem("gbp-marketing-lang") as Lang | null;
    const isNight = (() => {
      const hour = new Date().getHours();
      return hour >= 18 || hour < 6;
    })();

    setDarkMode(savedTheme ? savedTheme === "dark" : isNight);
    setLang(savedLang === "es" ? "es" : "en");
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", darkMode ? "dark-pro" : "default");
    localStorage.setItem("gbp-marketing-theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  useEffect(() => {
    localStorage.setItem("gbp-marketing-lang", lang);
  }, [lang]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMegaOpen(false);
    }

    function onClick(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (!target.closest("#marketing-nav")) {
        setMegaOpen(false);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("click", onClick);
    };
  }, []);

  const copy = useMemo(() => {
    if (lang === "es") {
      return {
        nav: { platform: "Plataforma", modules: "Módulos", ai: "IA", pricing: "Precios", faq: "FAQ", login: "Ingresar" },
        hero: {
          badge: "Acceso temprano · Trial 30 días",
          titleA: "La plataforma operativa",
          titleB: "que tu restaurante",
          titleC: "necesita hoy",
          sub: "No somos POS. Somos el sistema que coordina operación, personal, estándares y ejecución diaria en un solo lugar.",
          primary: "Comenzar trial 30 días",
          secondary: "Ver módulos",
          trust: "Multi-tenant · Seguro · Escalable",
        },
        sections: {
          realityTitle: "Tu POS cobra. GetBackplate opera.",
          realityBody: "Toast, Square o Clover resuelven transacciones. GetBackplate resuelve lo que pasa entre turnos: checklist, personal, documentos, cumplimiento y comunicación.",
          modulesTitle: "Todo lo que hoy manejas en herramientas separadas",
          aiTitle: "IA operativa integrada en tu flujo",
          pricingTitle: "Precios claros + trial de 30 días",
          pricingSub: "Empieza con cualquier plan. Si eres elegible, tienes 30 días de prueba y primer cobro al final del trial.",
          faqTitle: "Preguntas frecuentes",
          firstTrialTitle: "Trial de 30 días para cualquier plan",
          firstTrialBody: "Creas tu cuenta, cargas tarjeta y pruebas la plataforma completa. El primer cobro llega al finalizar el trial.",
        },
      };
    }

    return {
      nav: { platform: "Platform", modules: "Modules", ai: "AI", pricing: "Pricing", faq: "FAQ", login: "Login" },
      hero: {
        badge: "Early access · 30-day trial",
        titleA: "The operations platform",
        titleB: "your restaurant",
        titleC: "needs now",
        sub: "We are not a POS. We are the system that coordinates operations, people, standards, and daily execution in one place.",
        primary: "Start 30-day trial",
        secondary: "See modules",
        trust: "Multi-tenant · Secure · Scalable",
      },
      sections: {
        realityTitle: "Your POS charges. GetBackplate operates.",
        realityBody: "Toast, Square, and Clover handle transactions. GetBackplate handles what happens between shifts: checklists, people, docs, compliance, and communication.",
        modulesTitle: "Everything your team runs across disconnected tools",
        aiTitle: "Operational AI built into your flow",
        pricingTitle: "Transparent pricing + 30-day trial",
        pricingSub: "Start with any plan. If eligible, you get 30 trial days and your first charge is at trial end.",
        faqTitle: "Frequently asked questions",
        firstTrialTitle: "30-day trial on any plan",
        firstTrialBody: "Create your account, add your card, and test the full platform. Your first charge happens after trial ends.",
      },
    };
  }, [lang]);

  const planCards = useMemo(() => {
    const sorted = [...plans].sort((a, b) => (a.price_amount ?? 0) - (b.price_amount ?? 0));
    return sorted.map((plan) => {
      const monthly = plan.price_amount ?? null;
      const annualPerMonth = monthly ? Math.round((monthly * 10) / 12) : null;
      const annualBilled = annualPerMonth ? annualPerMonth * 12 : null;
      const tier = planTier(plan.code ?? plan.name);

      const features: string[] = [];
      features.push(plan.max_branches ? `${plan.max_branches} locations` : "Unlimited locations");
      features.push(plan.max_users ? `${plan.max_users} users` : "Unlimited users");
      features.push(plan.max_employees ? `${plan.max_employees} employees` : "Unlimited employees");
      if (plan.max_storage_mb) {
        const gb = plan.max_storage_mb / 1024;
        features.push(gb >= 1 ? `${gb.toFixed(1)} GB storage` : `${plan.max_storage_mb} MB storage`);
      } else {
        features.push("Unlimited storage");
      }

      const moduleNames = (plan.modules ?? []).slice(0, 6).map((mod) => mod.name);
      features.push(...moduleNames);

      return {
        ...plan,
        tier,
        monthly,
        annualPerMonth,
        annualBilled,
        features,
      };
    });
  }, [plans]);

  const groupedModules = useMemo(() => {
    const groups: Record<string, string[]> = { starter: [], growth: [], pro: [] };
    for (const plan of planCards) {
      if (!(plan.tier in groups)) continue;
      for (const mod of plan.modules ?? []) {
        if (!groups[plan.tier].includes(mod.name)) groups[plan.tier].push(mod.name);
      }
    }
    return groups;
  }, [planCards]);

  const faqs = useMemo(
    () =>
      lang === "es"
        ? [
            ["¿Es un POS?", "No. Es una plataforma operativa que trabaja junto a tu POS actual."],
            ["¿Debo cambiar mi POS?", "No. Puedes mantener Toast, Square, Clover u otro sistema actual."],
            ["¿El trial de 30 días cobra al inicio?", "No. Se carga tarjeta al suscribir, pero el primer cobro llega al finalizar el trial."],
            ["¿Puedo cambiar de plan durante el trial?", "Sí. Cambias módulos/límites del plan, pero no se reinicia el reloj de 30 días."],
          ]
        : [
            ["Is this a POS?", "No. It is an operations platform that works alongside your existing POS."],
            ["Do I need to replace my POS?", "No. You can keep Toast, Square, Clover, or your current stack."],
            ["Does the 30-day trial charge at signup?", "No. Card is collected at signup, but first charge is at trial end."],
            ["Can I change plans during trial?", "Yes. Plan limits/modules change, but the 30-day trial clock does not reset."],
          ],
    [lang],
  );

  const platformCards = useMemo(
    () =>
      lang === "es"
        ? [
            ["01", "Operaciones y Cumplimiento", "Checklist digitales, incidentes, controles y trazabilidad de ejecución por turno."],
            ["02", "People & RRHH", "Onboarding, documentos, estado laboral, evaluaciones y seguimiento por rol."],
            ["03", "Cocina y Menú", "Estandarización operativa de recetas, seguridad alimentaria y control por locación."],
            ["04", "Comunicación", "Anuncios, alertas y coordinación interna sin depender de chats externos."],
            ["05", "Reportes", "Visión operativa por sucursal, fechas y estado con métricas accionables."],
            ["06", "Permisos", "Jerarquía clara por rol: owners, managers y staff con acceso controlado."],
          ]
        : [
            ["01", "Operations & Compliance", "Digital checklists, incidents, controls, and shift-level traceability."],
            ["02", "People & HR", "Onboarding, files, employment status, reviews, and role-based workflows."],
            ["03", "Kitchen & Menu", "Operational standardization for recipes, food safety, and location control."],
            ["04", "Communication", "Announcements, alerts, and team coordination without external chat chaos."],
            ["05", "Reporting", "Operational visibility by branch, date, and status with actionable metrics."],
            ["06", "Permissions", "Clear role hierarchy: owners, managers, and staff with scoped access."],
          ],
    [lang],
  );

  const valueCards = useMemo(
    () =>
      lang === "es"
        ? [
            ["Fluidez", "La operación tiene que sentirse natural. Menos fricción, más ejecución real."],
            ["Empatía", "Diseñamos para equipos de turno, no para demos de escritorio."],
            ["Claridad", "Cada pantalla debe ser entendible en segundos, sin capacitación eterna."],
            ["Responsabilidad", "Cada acción queda trazada por persona, turno y ubicación."],
          ]
        : [
            ["Fluidity", "Operations should feel natural. Less friction, more real execution."],
            ["Empathy", "Built for shift teams, not boardroom demos."],
            ["Clarity", "Every screen should be understandable in seconds."],
            ["Accountability", "Every action is traceable by person, shift, and location."],
          ],
    [lang],
  );

  const notPosTags = useMemo(
    () =>
      lang === "es"
        ? {
            yes: ["Plataforma operativa", "Gestión de personal", "Ejecución por turnos", "Cumplimiento y trazabilidad"],
            no: ["No es POS", "No es nómina", "No es delivery", "No es reservas"],
          }
        : {
            yes: ["Operations platform", "People management", "Shift execution", "Compliance traceability"],
            no: ["Not a POS", "Not payroll", "Not delivery", "Not reservations"],
          },
    [lang],
  );

  const builtForItems = useMemo(
    () =>
      lang === "es"
        ? [
            "Cadenas de restaurantes",
            "Servicio completo",
            "Quick Service",
            "Bares y cervecerías",
            "Ghost Kitchens",
            "Coffee Shops",
            "Food Trucks",
            "Catering",
          ]
        : [
            "Restaurant Chains",
            "Full Service Restaurants",
            "Quick Service",
            "Bars & Breweries",
            "Ghost Kitchens",
            "Coffee Shops",
            "Food Trucks",
            "Catering",
          ],
    [lang],
  );

  async function startCheckout(planId: string) {
    setLoadingPlanId(planId);
    try {
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ planId, billingPeriod: billingMode === "annual" ? "yearly" : "monthly" }),
      });
      const data = await response.json();

      if (!response.ok) {
        if (response.status === 401) {
          router.push(`/auth/register?planId=${planId}&billingPeriod=${billingMode === "annual" ? "yearly" : "monthly"}`);
          return;
        }
        throw new Error(data.error || "Checkout error");
      }

      if (typeof data.url === "string" && data.url) {
        window.location.href = data.url;
      }
    } catch {
      // silent: UI keeps stable, toaster global may handle future integration
    } finally {
      setLoadingPlanId(null);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--gbp-bg)] text-[var(--gbp-text)]">
      <header id="marketing-nav" className="fixed left-0 right-0 top-0 z-50 border-b border-[var(--gbp-border)]/70 bg-[var(--gbp-bg)]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-[68px] w-full max-w-[1400px] items-center justify-between px-6">
          <Link href="/" className="inline-flex items-center" aria-label="GetBackplate home">
            <Image
              src={darkMode ? "/getbackplate-logo-dark.svg" : "/getbackplate-logo-light.svg"}
              alt="GetBackplate"
              width={190}
              height={34}
              className="h-[34px] w-auto max-w-[190px]"
              priority
            />
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            <a href="#platform" className="rounded-md px-3 py-1.5 text-sm text-[var(--gbp-text2)] hover:bg-[var(--gbp-surface2)] hover:text-[var(--gbp-text)]">{copy.nav.platform}</a>
            <button
              onMouseEnter={() => setMegaOpen(true)}
              onClick={() => setMegaOpen((v) => !v)}
              className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm text-[var(--gbp-text2)] hover:bg-[var(--gbp-surface2)] hover:text-[var(--gbp-text)]"
            >
              {copy.nav.modules}
              <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${megaOpen ? "rotate-180" : "rotate-0"}`} />
            </button>
            <a href="#ai" className="rounded-md px-3 py-1.5 text-sm text-[var(--gbp-text2)] hover:bg-[var(--gbp-surface2)] hover:text-[var(--gbp-text)]">{copy.nav.ai}</a>
            <a href="#pricing" className="rounded-md px-3 py-1.5 text-sm text-[var(--gbp-text2)] hover:bg-[var(--gbp-surface2)] hover:text-[var(--gbp-text)]">{copy.nav.pricing}</a>
            <a href="#faq" className="rounded-md px-3 py-1.5 text-sm text-[var(--gbp-text2)] hover:bg-[var(--gbp-surface2)] hover:text-[var(--gbp-text)]">{copy.nav.faq}</a>
          </nav>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Toggle language"
              onClick={() => setLang((v) => (v === "en" ? "es" : "en"))}
              className="relative inline-flex h-8 w-[64px] select-none items-center rounded-full border border-[var(--gbp-border2)] bg-[var(--gbp-surface2)] px-1"
            >
              <span className={`pointer-events-none absolute left-2 text-[10px] font-black uppercase tracking-[0.08em] ${darkMode ? "text-white/70" : "text-[var(--gbp-muted)]"}`}>EN</span>
              <span className={`pointer-events-none absolute right-2 text-[10px] font-black uppercase tracking-[0.08em] ${darkMode ? "text-white/70" : "text-[var(--gbp-muted)]"}`}>ES</span>
              <span
                className={`pointer-events-none absolute left-1 top-1 h-6 w-7 rounded-full bg-white text-[10px] font-black leading-6 text-[#111827] shadow-sm transition-transform duration-200 ${lang === "es" ? "translate-x-[28px]" : "translate-x-0"}`}
              >
                {lang === "es" ? "ES" : "EN"}
              </span>
            </button>
            <button
              type="button"
              aria-label="Toggle day or night"
              onClick={() => setDarkMode((v) => !v)}
              className="relative inline-flex h-8 w-[56px] select-none items-center rounded-full border border-[var(--gbp-border2)] bg-[var(--gbp-surface2)] px-1"
            >
              <span className="pointer-events-none absolute left-2 text-[11px]">☀️</span>
              <span className="pointer-events-none absolute right-2 text-[11px]">🌙</span>
              <span
                className={`pointer-events-none absolute left-1 top-1 h-6 w-6 rounded-full bg-white text-center text-[11px] leading-6 shadow-sm transition-transform duration-200 ${darkMode ? "translate-x-[24px]" : "translate-x-0"}`}
              >
                {darkMode ? "🌙" : "☀️"}
              </span>
            </button>
            <Link href="/auth/login" className="rounded-md border border-[var(--gbp-border2)] px-3 py-1.5 text-sm font-semibold text-[var(--gbp-text)] hover:bg-[var(--gbp-surface2)]">{copy.nav.login}</Link>
            <button type="button" onClick={() => document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" })} className="rounded-md bg-[var(--gbp-accent)] px-3 py-1.5 text-sm font-bold text-white hover:bg-[var(--gbp-accent-hover)]">{lang === "es" ? "Prueba 30d" : "Trial 30d"}</button>
          </div>
        </div>

        {megaOpen ? (
          <div onMouseLeave={() => setMegaOpen(false)} className="border-b border-[var(--gbp-border)] bg-[var(--gbp-surface)]">
            <div className="mx-auto grid max-w-[1400px] grid-cols-1 gap-6 px-6 py-6 md:grid-cols-3">
              <div>
                <p className="mb-2 text-xs font-black uppercase tracking-[0.12em] text-emerald-600">Starter</p>
                <ul className="space-y-1 text-sm text-[var(--gbp-text2)]">{groupedModules.starter.slice(0, 8).map((name) => <li key={name}>{name}</li>)}</ul>
              </div>
              <div>
                <p className="mb-2 text-xs font-black uppercase tracking-[0.12em] text-[var(--gbp-violet)]">Growth</p>
                <ul className="space-y-1 text-sm text-[var(--gbp-text2)]">{groupedModules.growth.slice(0, 8).map((name) => <li key={name}>{name}</li>)}</ul>
              </div>
              <div>
                <p className="mb-2 text-xs font-black uppercase tracking-[0.12em] text-[var(--gbp-accent)]">Pro</p>
                <ul className="space-y-1 text-sm text-[var(--gbp-text2)]">{groupedModules.pro.slice(0, 10).map((name) => <li key={name}>{name}</li>)}</ul>
              </div>
            </div>
          </div>
        ) : null}
      </header>

      <main className="pt-[76px]">
        <section className="relative overflow-hidden px-6 pb-16 pt-12 md:min-h-[calc(100vh-76px)] md:pb-14 md:pt-12">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_55%_at_75%_30%,rgba(212,83,26,0.09)_0%,transparent_65%)]" />
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut", delay: 0.25 }}
            className="pointer-events-none absolute bottom-5 left-1/2 hidden -translate-x-1/2 items-center gap-2 md:flex"
          >
            <span className="h-8 w-px bg-[var(--gbp-border2)]" />
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--gbp-muted)]">
              Scroll
            </span>
          </motion.div>
          <div className="mx-auto grid w-full max-w-[1240px] items-center gap-12 md:grid-cols-2">
            <motion.div
              initial={{ opacity: 0, y: 26 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              viewport={{ once: true, amount: 0.35 }}
            >
              <div className="mb-6 inline-flex items-center rounded-full border border-[var(--gbp-violet)]/30 bg-[var(--gbp-violet-soft)] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--gbp-violet)]">{copy.hero.badge}</div>
              <h1 className="hero-title font-bold leading-[1.03] tracking-[-0.03em]">{copy.hero.titleA}<br />{copy.hero.titleB}<br /><span className="bg-[linear-gradient(90deg,#D4531A_0%,#FF8A50_55%,#D4531A_100%)] bg-clip-text text-transparent">{copy.hero.titleC}</span></h1>
              <p className="mt-5 max-w-xl text-[16px] leading-7 text-[var(--gbp-text2)]">{copy.hero.sub}</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <button type="button" onClick={() => document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" })} className="rounded-md bg-[var(--gbp-accent)] px-6 py-3 text-sm font-bold text-white hover:bg-[var(--gbp-accent-hover)]">{copy.hero.primary}</button>
                <a href="#modules" className="rounded-md border border-[var(--gbp-border2)] px-6 py-3 text-sm font-semibold text-[var(--gbp-text2)] hover:bg-[var(--gbp-surface2)] hover:text-[var(--gbp-text)]">{copy.hero.secondary}</a>
              </div>
              <div className="mt-6 flex items-center gap-3">
                <div className="flex -space-x-2">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--gbp-border)] bg-[var(--gbp-surface)] text-[10px] font-black">MA</span>
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--gbp-border)] bg-[var(--gbp-surface)] text-[10px] font-black">RG</span>
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--gbp-border)] bg-[var(--gbp-violet-soft)] text-[10px] font-black text-[var(--gbp-violet)]">JP</span>
                </div>
                <p className="text-xs text-[var(--gbp-text2)]">
                  {lang === "es" ? "Restaurantes operando en early access" : "Restaurants already running in early access"}
                </p>
              </div>
              <p className="mt-6 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--gbp-muted)]">{copy.hero.trust}</p>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 26 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.65, ease: "easeOut", delay: 0.1 }}
              viewport={{ once: true, amount: 0.3 }}
              whileHover={{ y: -3 }}
              onMouseEnter={() => setFloatPaused(true)}
              onMouseLeave={() => setFloatPaused(false)}
              className="relative rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-4 shadow-[var(--gbp-shadow-lg)]"
            >
              <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-[var(--gbp-accent)]/12 blur-2xl" />

              <div className="mb-3 flex items-center gap-1 rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-bg2)] px-3 py-2 text-[13px] font-semibold text-[var(--gbp-text2)]">
                <span className="h-2 w-2 rounded-full bg-[var(--gbp-accent)]" />
                <span className="h-2 w-2 rounded-full bg-amber-400" />
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <span className="ml-2">GetBackplate · {lang === "es" ? "Panel Operativo" : "Operations Dashboard"}</span>
              </div>

              <div className="mb-3 grid grid-cols-3 gap-2">
                <div className="rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-bg2)] p-3"><p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--gbp-muted)]">{lang === "es" ? "Locaciones" : "Locations"}</p><p className="mt-1 text-2xl font-bold text-[var(--gbp-violet)]">3</p><p className="text-[11px] text-[var(--gbp-muted)]">{lang === "es" ? "Activas" : "Active"}</p></div>
                <div className="rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-bg2)] p-3"><p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--gbp-muted)]">{lang === "es" ? "Checklist" : "Checklists"}</p><p className="mt-1 text-2xl font-bold text-emerald-500">94%</p><p className="text-[11px] text-[var(--gbp-muted)]">{lang === "es" ? "Hoy" : "Today"}</p></div>
                <div className="rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-bg2)] p-3"><p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--gbp-muted)]">{lang === "es" ? "Incidencias" : "Issues"}</p><p className="mt-1 text-2xl font-bold text-[var(--gbp-accent)]">2</p><p className="text-[11px] text-[var(--gbp-muted)]">{lang === "es" ? "Abiertas" : "Open"}</p></div>
              </div>

              <div className="space-y-2 rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-bg2)] p-3 text-sm text-[var(--gbp-text2)]">
                <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--gbp-muted)]">{lang === "es" ? "Checklist apertura · hoy" : "Opening checklist · today"}</p>
                <div className="flex items-center justify-between rounded-md bg-[var(--gbp-surface)] px-3 py-2"><span>{lang === "es" ? "Temperatura completada" : "Temperature log complete"}</span><span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-bold text-emerald-500">{lang === "es" ? "Ok" : "Done"}</span></div>
                <div className="flex items-center justify-between rounded-md bg-[var(--gbp-surface)] px-3 py-2"><span>{lang === "es" ? "Ingreso de staff verificado" : "Staff sign-in verified"}</span><span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-bold text-emerald-500">{lang === "es" ? "Ok" : "Done"}</span></div>
                <div className="flex items-center justify-between rounded-md bg-[var(--gbp-surface)] px-3 py-2"><span>{lang === "es" ? "Revisión de equipos" : "Equipment walkthrough"}</span><span className="rounded-full bg-[var(--gbp-accent)]/15 px-2 py-0.5 text-[11px] font-bold text-[var(--gbp-accent)]">{lang === "es" ? "Abierto" : "Open"}</span></div>
              </div>

              <div className="mt-3 flex items-center justify-between rounded-lg border border-[var(--gbp-violet)]/30 bg-[var(--gbp-violet-soft)] p-3 text-sm text-[var(--gbp-text2)]"><strong className="text-[var(--gbp-text)]">{lang === "es" ? "Alerta IA:" : "AI Alert:"}</strong><span>{lang === "es" ? "3 contratos vencen en 5 días" : "3 contracts expiring in 5 days"}</span><span className="rounded-full bg-[var(--gbp-violet)] px-2 py-0.5 text-[11px] font-bold text-white">{lang === "es" ? "Ver" : "View"}</span></div>

              <div
                className="float-badge float-badge-1 absolute -right-2 -top-[18px] rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-3 py-2 text-xs font-semibold text-[var(--gbp-text)] shadow-[0_14px_30px_rgba(0,0,0,0.14)]"
                style={{ animationPlayState: floatPaused ? "paused" : "running" }}
              >
                <span className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-500" />
                {lang === "es" ? "Checklist completo · Biloxi" : "All checklists complete · Biloxi"}
              </div>

              <div
                className="float-badge float-badge-2 absolute -bottom-2 -left-6 rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-3 py-2 text-xs font-semibold text-[var(--gbp-text)] shadow-[0_14px_30px_rgba(0,0,0,0.14)]"
                style={{ animationPlayState: floatPaused ? "paused" : "running" }}
              >
                <span className="mr-1 inline-block h-2 w-2 rounded-full bg-[var(--gbp-accent)]" />
                {lang === "es" ? "Impulsado por IA" : "Powered by AI intelligence"}
              </div>
            </motion.div>
          </div>
        </section>

        <section className="border-y border-[var(--gbp-border)] bg-[var(--gbp-surface)] py-4">
          <div className="mx-auto flex w-full max-w-[1400px] items-center gap-4 overflow-hidden px-6">
            <span className="shrink-0 text-[10px] font-black uppercase tracking-[0.12em] text-[var(--gbp-muted)]">
              {lang === "es" ? "Diseñado para" : "Built for"}
            </span>
            <div className="relative min-w-0 flex-1 overflow-hidden">
              <motion.div
                className="flex w-max items-center gap-4 whitespace-nowrap text-sm text-[var(--gbp-text2)]"
                animate={{ x: ["0%", "-50%"] }}
                transition={{ duration: 32, ease: "linear", repeat: Infinity }}
              >
                {[...builtForItems, ...builtForItems].map((item, idx) => (
                  <span key={`${item}-${idx}`} className="inline-flex items-center gap-4">
                    <span className={idx % 3 === 0 ? "font-bold text-[var(--gbp-accent)]" : ""}>{item}</span>
                    <span className="text-[var(--gbp-border2)]">—</span>
                  </span>
                ))}
              </motion.div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[1240px] px-6 py-24 md:py-28" id="platform">
          <p className="inline-flex rounded-full border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[var(--gbp-muted)]">
            {lang === "es" ? "La realidad operativa" : "The Reality"}
          </p>
          <motion.h2
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: "easeOut" }}
            viewport={{ once: true, amount: 0.5 }}
            className="text-4xl font-bold tracking-tight"
          >
            {copy.sections.realityTitle}
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: "easeOut", delay: 0.06 }}
            viewport={{ once: true, amount: 0.45 }}
            className="mt-5 max-w-4xl text-[16px] leading-8 text-[var(--gbp-text2)]"
          >
            {copy.sections.realityBody}
          </motion.p>

          <div className="mt-10 grid gap-px overflow-hidden rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-border)] md:grid-cols-2 lg:grid-cols-3">
            {platformCards.map(([num, title, body], idx) => (
              <motion.article
                key={num}
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, ease: "easeOut", delay: idx * 0.06 }}
                viewport={{ once: true, amount: 0.2 }}
                whileHover={{ y: -3 }}
                className="bg-[var(--gbp-surface)] p-7 transition-colors hover:bg-[var(--gbp-surface2)]"
              >
                <p className="text-4xl font-extrabold tracking-tight text-[var(--gbp-border2)]">{num}</p>
                <h3 className="mt-4 text-lg font-bold text-[var(--gbp-text)]">{title}</h3>
                <p className="mt-2 text-sm leading-7 text-[var(--gbp-text2)]">{body}</p>
              </motion.article>
            ))}
          </div>
        </section>

        <section className="bg-[var(--gbp-surface)] px-6 py-24 md:py-28">
          <div className="mx-auto mb-4 max-w-[1200px]">
            <p className="inline-flex rounded-full border border-[var(--gbp-border2)] bg-[var(--gbp-bg)] px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[var(--gbp-muted)]">
              {lang === "es" ? "Multi-locación" : "Multi-location"}
            </p>
          </div>
          <div className="mx-auto grid max-w-[1200px] gap-10 md:grid-cols-2 md:items-end">
            <h2 className="text-4xl font-bold tracking-tight md:text-5xl">
              {lang === "es" ? "Todas tus sucursales" : "All your locations"}
              <br />
              <span className="bg-[linear-gradient(90deg,#D4531A_0%,#FF8A50_55%,#D4531A_100%)] bg-clip-text text-transparent">
                {lang === "es" ? "en una sola vista" : "in one single view"}
              </span>
            </h2>
            <p className="text-[15px] leading-8 text-[var(--gbp-text2)]">
              {lang === "es"
                ? "Sin cambiar pestañas. Sin paneles separados por local. Estado operativo unificado para managers y dirección."
                : "No tab switching. No separate dashboards by branch. Unified operational status for managers and leadership."}
            </p>
          </div>
          <div className="mx-auto mt-8 grid max-w-[1200px] grid-cols-3 gap-3">
            <div className="rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-bg)] p-5 text-center"><p className="text-3xl font-extrabold text-[var(--gbp-accent)]">ONE</p><p className="mt-1 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--gbp-muted)]">{lang === "es" ? "Login" : "Login"}</p></div>
            <div className="rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-bg)] p-5 text-center"><p className="text-3xl font-extrabold text-[var(--gbp-accent)]">ZERO</p><p className="mt-1 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--gbp-muted)]">{lang === "es" ? "Cambio de tabs" : "Tab switching"}</p></div>
            <div className="rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-bg)] p-5 text-center"><p className="text-3xl font-extrabold text-[var(--gbp-accent)]">∞</p><p className="mt-1 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--gbp-muted)]">{lang === "es" ? "Sucursales" : "Locations"}</p></div>
          </div>
        </section>

        <section className={`px-6 py-20 text-white md:py-24 ${darkMode ? "bg-[var(--gbp-bg2)]" : "bg-[var(--gbp-text)]"}`}>
          <div className="mx-auto max-w-[1100px] text-center">
            <p className="inline-flex rounded-full border border-emerald-400/35 bg-emerald-500/10 px-4 py-1 text-[10px] font-black uppercase tracking-[0.11em] text-emerald-300">
              {lang === "es" ? "Qué sí es GetBackplate" : "What GetBackplate is"}
            </p>
            <h3 className="mt-5 text-4xl font-bold tracking-tight md:text-5xl">
              {lang === "es"
                ? "Plataforma operativa de restaurantes."
                : "Restaurant operations platform."}
            </h3>
            <p className="mx-auto mt-4 max-w-4xl text-sm leading-7 text-white/70">
              {lang === "es"
                ? "Trabaja junto a tu POS y cubre lo que el POS no resuelve: ejecución diaria, gestión de equipo, documentación y consistencia operativa."
                : "Works next to your POS and covers what POS does not solve: daily execution, team management, documentation, and operational consistency."}
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {notPosTags.yes.map((item) => (
                <span key={`yes-${item}`} className="rounded-md border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300">✓ {item}</span>
              ))}
              {notPosTags.no.map((item) => (
                <span key={`no-${item}`} className="rounded-md border border-rose-400/30 bg-rose-500/10 px-3 py-1 text-xs font-semibold text-rose-300">× {item}</span>
              ))}
            </div>
          </div>
        </section>

        <section className="border-y border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-6 py-24 md:py-28" id="modules">
          <div className="mx-auto max-w-[1240px]">
            <p className="inline-flex rounded-full border border-[var(--gbp-border2)] bg-[var(--gbp-bg)] px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[var(--gbp-muted)]">
              {lang === "es" ? "Módulos de plataforma" : "Platform Modules"}
            </p>
            <h2 className="text-4xl font-bold tracking-tight">{copy.sections.modulesTitle}</h2>
            <div className="mt-8 grid gap-px overflow-hidden rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-border)] md:grid-cols-3">
              {planCards.slice(0, 3).map((plan, idx) => (
                <motion.article
                  key={plan.id}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.45, ease: "easeOut", delay: idx * 0.08 }}
                  viewport={{ once: true, amount: 0.25 }}
                  className="bg-[var(--gbp-surface)] p-6"
                >
                  <p className="text-4xl font-extrabold text-[var(--gbp-border2)]">{String(idx + 1).padStart(2, "0")}</p>
                  <h3 className="mt-4 text-lg font-bold">{plan.name}</h3>
                  <p className="mt-2 text-sm text-[var(--gbp-text2)]">{plan.description || (lang === "es" ? "Stack operativo para restaurantes modernos." : "Operational stack for modern restaurants.")}</p>
                </motion.article>
              ))}
            </div>
            <div className="mt-4 rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-bg)] p-4 text-sm text-[var(--gbp-text2)]">
              <strong className="text-[var(--gbp-text)]">{lang === "es" ? "Más módulos disponibles" : "More modules available"}:</strong>{" "}
              {lang === "es"
                ? "SMS/WhatsApp, tareas, incidentes, vacaciones, mantenimiento, costo de menú, evaluaciones, GMB y más."
                : "SMS/WhatsApp, tasking, incidents, time-off, maintenance, menu costing, reviews, GMB, and more."}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[1240px] px-6 py-24 md:py-28" id="ai">
          <p className="inline-flex rounded-full border border-[var(--gbp-violet)]/35 bg-[var(--gbp-violet-soft)] px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[var(--gbp-violet)]">
            {lang === "es" ? "Inteligencia IA" : "AI Intelligence"}
          </p>
          <h2 className="text-4xl font-bold tracking-tight">{copy.sections.aiTitle}</h2>
          <p className="mt-3 text-sm text-[var(--gbp-text2)]">
            {lang === "es"
              ? "Disponible en planes activos. Asiste redacción, alertas y consultas operativas."
              : "Available across active plans. Supports drafting, alerts, and operational queries."}
          </p>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {[
              [lang === "es" ? "Escribe" : "Draft", lang === "es" ? "Escribe una frase y obtén un borrador listo para publicar." : "Write one sentence. Get a publish-ready draft."],
              [lang === "es" ? "Detecta" : "Know", lang === "es" ? "Detecta patrones antes de que se vuelvan incidentes." : "Surface patterns before they become incidents."],
              [lang === "es" ? "Pregunta" : "Ask", lang === "es" ? "Consulta tus datos operativos en lenguaje natural." : "Query your operations data in plain language."],
            ].map(([title, body], idx) => (
              <motion.div
                key={title}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, ease: "easeOut", delay: idx * 0.08 }}
                viewport={{ once: true, amount: 0.25 }}
                className="rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-5"
              >
                <p className="text-xs font-black uppercase tracking-[0.11em] text-[var(--gbp-violet)]">{title}</p>
                <p className="mt-2 text-sm text-[var(--gbp-text2)]">{body}</p>
              </motion.div>
            ))}
          </div>
        </section>

        <section className="tagline-break relative left-1/2 right-1/2 w-screen -translate-x-1/2">
          <div className="mx-auto w-full max-w-[1240px] px-6 text-center">
            {lang === "es" ? (
              <blockquote>
                <em>&quot;GetBackplate opera todo</em>
                <br />
                lo que tu POS ignora.&quot;
              </blockquote>
            ) : (
              <blockquote>
                <em>&quot;GetBackplate runs everything</em>
                <br />
                your POS ignores.&quot;
              </blockquote>
            )}
          </div>
        </section>

        <section className="border-y border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-6 py-24 md:py-28">
          <div className="mx-auto grid max-w-[980px] gap-8 md:grid-cols-[150px_1fr] md:items-center">
            <div className="rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-bg)] p-6 text-center">
              <p className="text-6xl font-extrabold leading-none text-[var(--gbp-accent)]">7</p>
              <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.11em] text-[var(--gbp-muted)]">{lang === "es" ? "Locaciones" : "Locations"}</p>
            </div>
            <div>
              <p className="text-xl leading-9 text-[var(--gbp-text)] md:text-2xl">
                {lang === "es"
                  ? "El equipo directivo completo entendió de inmediato cuánto tiempo y caos operativo estábamos perdiendo sin una capa operativa real."
                  : "Our full leadership team instantly saw how much time and operational chaos we were losing without a real operations layer."}
              </p>
              <p className="mt-3 text-sm text-[var(--gbp-text2)]">
                {lang === "es" ? "Restaurant Owner · Grupo multi-locación" : "Restaurant Owner · Multi-location group"}
              </p>
            </div>
          </div>
        </section>

        <section className={`border-y border-[var(--gbp-border)] px-6 py-20 text-white md:py-24 ${darkMode ? "bg-[var(--gbp-bg2)]" : "bg-[var(--gbp-text)]"}`}>
          <div className="mx-auto max-w-[1200px] text-center">
            <p className="mx-auto mb-3 inline-flex rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-white/75">
              {lang === "es" ? "Trial 30 días" : "30-day Trial"}
            </p>
            <p className="text-4xl font-bold tracking-tight md:text-5xl">{copy.sections.firstTrialTitle}</p>
            <p className="mx-auto mt-4 max-w-3xl text-sm leading-7 text-white/75">{copy.sections.firstTrialBody}</p>
            <p className="mx-auto mt-3 max-w-3xl text-xs leading-6 text-white/55">
              {lang === "es"
                ? "Tarjeta requerida al alta. Primer cobro al finalizar el trial si continúas con la suscripción."
                : "Card required at signup. First charge happens at trial end if subscription continues."}
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-[1240px] px-6 py-24 md:py-28" id="pricing">
          <div className="text-center">
            <p className="inline-flex rounded-full border border-[var(--gbp-violet)]/35 bg-[var(--gbp-violet-soft)] px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[var(--gbp-violet)]">
              {lang === "es" ? "Precios" : "Pricing"}
            </p>
            <h2 className="text-4xl font-bold tracking-tight">{copy.sections.pricingTitle}</h2>
            <p className="mx-auto mt-3 max-w-3xl text-[15px] leading-7 text-[var(--gbp-text2)]">{copy.sections.pricingSub}</p>
          </div>

          <div className="mt-7 flex items-center justify-center gap-3">
            <button type="button" onClick={() => setBillingMode("monthly")} className={`text-sm font-semibold ${billingMode === "monthly" ? "text-[var(--gbp-text)]" : "text-[var(--gbp-muted)]"}`}>{lang === "es" ? "Mensual" : "Monthly"}</button>
            <button type="button" onClick={() => setBillingMode((v) => (v === "monthly" ? "annual" : "monthly"))} className={`relative h-6 w-11 rounded-full ${billingMode === "annual" ? "bg-[var(--gbp-violet)]" : "bg-[var(--gbp-border2)]"}`}><span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${billingMode === "annual" ? "translate-x-6" : "translate-x-1"}`} /></button>
            <button type="button" onClick={() => setBillingMode("annual")} className={`text-sm font-semibold ${billingMode === "annual" ? "text-[var(--gbp-text)]" : "text-[var(--gbp-muted)]"}`}>{lang === "es" ? "Anual" : "Annual"}</button>
            <span className={`ml-1 rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] transition-all ${billingMode === "annual" ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-400" : "border-transparent text-[var(--gbp-muted)]"}`}>
              {lang === "es" ? "2 meses gratis" : "2 months free"}
            </span>
          </div>

          <div className="mt-8 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {planCards.map((plan, idx) => {
              const featured = plan.tier === "growth" || plan.tier === "pro";
              return (
                <motion.article
                  key={plan.id}
                  initial={{ opacity: 0, y: 18 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.45, ease: "easeOut", delay: idx * 0.08 }}
                  viewport={{ once: true, amount: 0.25 }}
                  whileHover={{ y: -4 }}
                  className={`relative rounded-xl border p-5 ${featured ? "border-[var(--gbp-violet)] shadow-[0_0_0_1px_var(--gbp-violet),0_18px_50px_rgba(108,71,255,0.18)]" : "border-[var(--gbp-border)]"} bg-[var(--gbp-surface)]`}
                >
                  {featured ? (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[var(--gbp-violet)] px-3 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-white">
                      {lang === "es" ? "Más popular" : "Most popular"}
                    </span>
                  ) : null}
                  <p className="text-xs font-black uppercase tracking-[0.1em] text-[var(--gbp-muted)]">{plan.name}</p>
                  <p className="mt-3 text-5xl font-extrabold tracking-tight">
                    {billingMode === "annual" ? formatPrice(plan.annualPerMonth) : formatPrice(plan.monthly)}
                  </p>
                  <p className="mt-1 text-xs text-[var(--gbp-muted)]">
                    {billingMode === "annual"
                        ? plan.annualBilled
                        ? lang === "es"
                          ? `por mes, facturado ${formatPrice(plan.annualBilled)}/año`
                          : `per month, billed ${formatPrice(plan.annualBilled)}/yr`
                        : lang === "es"
                          ? "anual"
                          : "annual"
                      : lang === "es"
                        ? "por mes"
                        : "per month"}
                  </p>

                  <button type="button" onClick={() => startCheckout(plan.id)} disabled={loadingPlanId === plan.id} className={`mt-4 w-full rounded-md px-3 py-2 text-sm font-bold ${featured ? "bg-[var(--gbp-violet)] text-white hover:bg-[var(--gbp-violet-hover)]" : "bg-[var(--gbp-accent)] text-white hover:bg-[var(--gbp-accent-hover)]"}`}>
                    {loadingPlanId === plan.id ? "..." : lang === "es" ? "Comenzar trial 30 días" : "Start 30-day trial"}
                  </button>

                  <ul className="mt-4 space-y-2">
                    {plan.features.map((feature) => (
                      <li key={`${plan.id}-${feature}`} className="text-xs text-[var(--gbp-text2)]">✓ {feature}</li>
                    ))}
                  </ul>
                </motion.article>
              );
            })}
          </div>
          <p className="mt-6 rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-4 py-3 text-center text-xs text-[var(--gbp-text2)]">
            <strong className="text-[var(--gbp-text)]">{lang === "es" ? "Facturación anual" : "Annual billing"}:</strong>{" "}
            {lang === "es"
              ? "equivale a 10 meses cobrados por año (2 meses bonificados)."
              : "equals 10 charged months per year (2 months free)."}
          </p>
        </section>

        <section className="border-y border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-6 py-24 md:py-28" id="faq">
          <div className="mx-auto max-w-[1000px]">
            <p className="mx-auto inline-flex rounded-full border border-[var(--gbp-border2)] bg-[var(--gbp-bg)] px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[var(--gbp-muted)]">
              FAQ
            </p>
            <h2 className="text-center text-4xl font-bold tracking-tight">{copy.sections.faqTitle}</h2>
            <div className="mt-10 divide-y divide-[var(--gbp-border)]">
              {faqs.map(([q, a], idx) => {
                const open = faqOpen === idx;
                return (
                  <motion.div
                    key={q}
                    initial={{ opacity: 0, y: 10 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, ease: "easeOut", delay: idx * 0.04 }}
                    viewport={{ once: true, amount: 0.3 }}
                  >
                    <button type="button" onClick={() => setFaqOpen(open ? null : idx)} className={`flex w-full items-center justify-between py-5 text-left text-sm font-bold ${open ? "text-[var(--gbp-accent)]" : "text-[var(--gbp-text)]"}`}>
                      <span>{q}</span>
                      <span className="text-xl leading-none">{open ? "−" : "+"}</span>
                    </button>
                    {open ? <p className="pb-5 text-sm leading-7 text-[var(--gbp-text2)]">{a}</p> : null}
                  </motion.div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[1240px] px-6 py-24 md:py-28">
          <p className="mb-4 inline-flex rounded-full border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[var(--gbp-muted)]">
            {lang === "es" ? "Por qué existimos" : "Why We Exist"}
          </p>
          <div className="grid gap-8 md:grid-cols-2 md:items-end">
            <h2 className="text-4xl font-bold tracking-tight md:text-5xl">
              {lang === "es"
                ? "Porque los restaurantes necesitan una plataforma que conecte todo"
                : "Because restaurants need one platform where everything connects"}
            </h2>
            <p className="text-[15px] leading-8 text-[var(--gbp-text2)]">
              {lang === "es"
                ? "No construimos una colección de funciones sueltas. Construimos un sistema operativo para operar mejor cada turno."
                : "We are not building disconnected features. We are building an operating system for better shift execution."}
            </p>
          </div>
          <div className="mt-8 grid gap-px overflow-hidden rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-border)] md:grid-cols-2 lg:grid-cols-4">
            {valueCards.map(([title, body], idx) => (
              <motion.article
                key={title}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: "easeOut", delay: idx * 0.06 }}
                viewport={{ once: true, amount: 0.2 }}
                whileHover={{ y: -2 }}
                className="bg-[var(--gbp-surface)] p-6 transition-colors hover:bg-[var(--gbp-surface2)]"
              >
                <h3 className="text-2xl font-extrabold tracking-tight text-[var(--gbp-text)]">{title}</h3>
                <p className="mt-2 text-sm leading-7 text-[var(--gbp-text2)]">{body}</p>
              </motion.article>
            ))}
          </div>
        </section>
      </main>

      <footer className={`px-6 py-10 text-white ${darkMode ? "bg-[var(--gbp-bg2)]" : "bg-[var(--gbp-text)]"}`}>
        <div className="mx-auto grid max-w-[1200px] gap-3 md:grid-cols-3 md:items-center">
          <p className="inline-flex items-center">
            <Image src="/getbackplate-logo-footer.svg" alt="GetBackplate" width={160} height={22} className="h-[22px] w-auto" />
          </p>
          <p className="text-center text-xs italic text-white/60">
            {lang === "es" ? "Opera tu restaurante. No solo tu caja." : "Run your restaurant. Not just your register."}
          </p>
          <p className="text-right text-[11px] text-white/50">© {new Date().getFullYear()} GetBackplate</p>
        </div>
      </footer>

      <style jsx>{`
        .hero-title {
          font-size: clamp(44px, 6.6vw, 78px);
        }

        .tagline-break {
          background: linear-gradient(135deg, var(--gbp-violet) 0%, #9b82ff 50%, var(--gbp-accent) 100%);
          padding: 76px 0;
          text-align: center;
          background-size: 220% 220%;
          animation: iridescentShift 12s ease-in-out infinite;
        }

        .tagline-break blockquote {
          font-size: clamp(26px, 4vw, 50px);
          font-weight: 700;
          line-height: 1.1;
          color: #ffffff;
          letter-spacing: -0.03em;
        }

        .tagline-break blockquote em {
          font-style: normal;
          opacity: 0.8;
        }

        .float-badge {
          will-change: transform;
        }
        .float-badge-1 {
          animation: heroFloatOne 3.6s cubic-bezier(0.22, 1, 0.36, 1) infinite;
        }
        .float-badge-2 {
          animation: heroFloatTwo 3.9s cubic-bezier(0.22, 1, 0.36, 1) 1.3s infinite;
        }
        @keyframes heroFloatOne {
          0%, 100% { transform: translateY(0px); }
          45% { transform: translateY(-4px); }
          70% { transform: translateY(-6px); }
        }
        @keyframes heroFloatTwo {
          0%, 100% { transform: translateY(0px); }
          40% { transform: translateY(-3px); }
          68% { transform: translateY(-5px); }
        }

        @keyframes iridescentShift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }

        @media (prefers-reduced-motion: reduce) {
          .float-badge-1,
          .float-badge-2,
          .tagline-break {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );
}
