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
  features?: unknown;
  is_enterprise?: boolean | null;
  is_featured?: boolean | null;
  cta_text?: string | null;
  cta_email?: string | null;
  sort_order?: number | null;
};

type PlanFeature = {
  text: string;
  highlight: boolean;
  everything: boolean;
  annual_only: boolean;
};

type Props = {
  plans: PlanInput[];
  integrationPlans: Array<{
    id: string;
    price_amount: number | null;
    is_enterprise: boolean;
  }>;
};

type Lang = "en" | "es";

function formatPrice(value: number | null | undefined) {
  if (!value && value !== 0) return "Custom";
  return `$${value}`;
}

function parsePlanFeatures(raw: unknown): PlanFeature[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .map((item) => ({
      text: typeof item.text === "string" ? item.text.trim() : "",
      highlight: Boolean(item.highlight),
      everything: Boolean(item.everything),
      annual_only: Boolean(item.annual_only),
    }))
    .filter((item) => item.text.length > 0);
}

function planTier(code: string) {
  const c = code.toLowerCase();
  if (c.includes("pro")) return "pro";
  if (c.includes("grow")) return "growth";
  if (c.includes("starter") || c.includes("basic") || c.includes("basico")) return "starter";
  return "other";
}

const MODULE_DESCRIPTIONS: Record<string, string> = {
  "Roles & Permissions": "User access control across every module. Define what owners, managers, and staff can see and do — the backbone everything else depends on.",
  "File Management": "Centralized document storage for menus, SOPs, certifications, and more. Organized by location, department, or role.",
  "Checklists by Dept & Shift": "Digital checklists per department and shift — with sign-off, accountability tracking, and manager visibility built in.",
  "Platform Notifications": "In-platform alerts keep your team informed in real time. No third-party apps, no missed updates.",
  "Employee Onboarding": "Every new hire — documents, training, and setup — in one place. No more email chains or printed packets.",
  "Digital Contract Signatures": "Send, sign, and archive employment contracts digitally. No per-document fees, no chasing signatures.",
  "Supplier & Vendor Directory": "Centralized vendor contacts, order history, and supplier information by location.",
  "SMS & WhatsApp Notifications": "Real-time team messaging that reaches staff beyond the platform.",
  "Task Assignment": "Assign tasks, set due dates, and require photo proof of completion. Integrated with checklists and shift communication.",
  "Incident & Accident Log": "Track kitchen injuries, customer complaints, and equipment failures with full documentation.",
  "Vacation & Time-Off Requests": "Digital requests with manager approval flow. No more paper slips.",
  "Disciplinary Log": "Private manager-only record of warnings, incidents, and write-ups.",
  "Equipment Maintenance Tracker": "Service schedules, repair history, and vendor contacts per unit.",
  "Schedule Builder": "Weekly scheduling with role filters and availability management.",
  "Zoom Integration": "Schedule and launch Zoom meetings directly from the platform. Team briefings and training sessions in one place.",
  "AI Quick Reports": "Automated reports surfaced from your operations data. No query needed.",
  "Menu Costing": "Food cost percentage calculated per dish — live, tied directly to your recipes.",
  "Recipe Archive + Portion Scaler": "Store recipes with automatic portion scaling. Consistent output every time, across every location.",
  "Temperature & Food Safety Log": "HACCP-compliant fridge and freezer readings logged by shift. Ready for health inspections.",
  "Performance Reviews": "Structured evaluations tied to roles, departments, and KPIs.",
  "Google My Business Management": "Manage your GMB listing and track guest feedback.",
  "Review Champions": "Staff compete to get mentioned by name in Google Reviews.",
  "Mystery Shopper": "Weighted scoring, visit logs, and trend reports over time.",
  "Full AI Assistant": "Natural language queries against your own data. Ask anything about your operations across every location.",
};

export function LandingExperience({ plans, integrationPlans }: Props) {
  const router = useRouter();
  const [darkMode, setDarkMode] = useState(false);
  const [lang, setLang] = useState<Lang>("en");
  const [billingMode, setBillingMode] = useState<"monthly" | "annual">("monthly");
  const [megaOpen, setMegaOpen] = useState(false);
  const [faqOpen, setFaqOpen] = useState<number | null>(0);
  const [loadingPlanId, setLoadingPlanId] = useState<string | null>(null);
  const [floatPaused, setFloatPaused] = useState(false);
  const [navScrolled, setNavScrolled] = useState(false);
  const [aiTab, setAiTab] = useState<"draft" | "know" | "ask">("draft");
  const [intTab, setIntTab] = useState<"send" | "receive">("send");
  const [modulesExpanded, setModulesExpanded] = useState(false);
  const [countdown, setCountdown] = useState({ days: 0, hours: 0, mins: 0 });

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
    const root = document.documentElement;
    const previousTheme = root.getAttribute("data-theme");
    root.setAttribute("data-theme", darkMode ? "dark-pro" : "default");
    localStorage.setItem("gbp-marketing-theme", darkMode ? "dark" : "light");
    return () => {
      if (previousTheme) root.setAttribute("data-theme", previousTheme);
      else root.removeAttribute("data-theme");
    };
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
      if (!target.closest("#marketing-nav")) setMegaOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("click", onClick);
    };
  }, []);

  useEffect(() => {
    function onScroll() {
      setNavScrolled(window.scrollY > 10);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const target = new Date("2026-08-01T00:00:00");
    function tick() {
      const now = new Date();
      const diff = Math.max(0, target.getTime() - now.getTime());
      setCountdown({
        days: Math.floor(diff / 86400000),
        hours: Math.floor((diff % 86400000) / 3600000),
        mins: Math.floor((diff % 3600000) / 60000),
      });
    }
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, []);

  const copy = useMemo(() => {
    if (lang === "es") {
      return {
        nav: { platform: "Plataforma", modules: "Módulos", ai: "IA", pricing: "Precios", integrations: "Integraciones", faq: "FAQ", login: "Ingresar" },
        hero: {
          badge: "Lanzamiento · Verano 2026 · First Table Program",
          titleA: "Estás invitado",
          titleB: "a la",
          titleC: "Primera Mesa.",
          sub: "La plataforma operativa que dueños, managers y equipos de restaurante estaban esperando. No es un POS. Es el sistema que corre todo lo que tu POS ignora.",
          primary: "Comenzar trial 30 días",
          secondary: "Ver módulos",
          trust: "38 restaurantes ya reservaron · 62 asientos restantes",
        },
        sections: {
          realityTitle: "Tu POS corre tus ventas.",
          realityTitleAccent: "GetBackplate corre tu restaurante.",
          realityBody: "Entre los clipboards, los emails, los grupos de WhatsApp y los checklists impresos — tu restaurante corre con herramientas que nunca fueron hechas para como los restaurantes realmente funcionan.",
          realityWith: "Con GetBackplate finalmente tenés:",
          modulesTitle: "Todo lo que tu equipo maneja en herramientas separadas",
          aiTitle: "El jefe de turno que",
          aiTitleAccent: "nunca cierra.",
          pricingTitle: "Precios claros + trial de 30 días",
          pricingSub: "Empezá con cualquier plan. Si eres elegible, tenés 30 días de prueba y el primer cobro llega al final del trial.",
          faqTitle: "Preguntas frecuentes",
          firstTrialTitle: "Trial de 30 días para cualquier plan",
          firstTrialBody: "Creás tu cuenta, cargás tarjeta y probás la plataforma completa. El primer cobro llega al finalizar el trial.",
        },
      };
    }
    return {
      nav: { platform: "Platform", modules: "Modules", ai: "AI", pricing: "Pricing", integrations: "Integrations", faq: "FAQ", login: "Login" },
      hero: {
        badge: "Soft Launch · Summer 2026 · First Table Program",
        titleA: "You're invited",
        titleB: "to the",
        titleC: "First Table.",
        sub: "The operations platform restaurant owners, managers, and teams have been waiting for. Not a POS. The system that runs everything your POS ignores.",
        primary: "Start 30-day trial",
        secondary: "See modules",
        trust: "38 restaurants already reserved · 62 seats left",
      },
      sections: {
        realityTitle: "Your POS runs your sales.",
        realityTitleAccent: "GetBackplate runs your restaurant.",
        realityBody: "Between the clipboards, the email threads, the WhatsApp groups, and the printed checklists — your restaurant runs on tools that were never built for how restaurants actually work.",
        realityWith: "With GetBackplate you finally have:",
        modulesTitle: "Every system your restaurant has been running without",
        aiTitle: "The shift manager that",
        aiTitleAccent: "never clocks out.",
        pricingTitle: "Transparent pricing + 30-day trial",
        pricingSub: "Start with any plan. If eligible, you get 30 trial days and your first charge is at trial end.",
        faqTitle: "Frequently asked questions",
        firstTrialTitle: "30-day trial on any plan",
        firstTrialBody: "Create your account, add your card, and test the full platform. Your first charge happens after trial ends.",
      },
    };
  }, [lang]);

  const planCards = useMemo(() => {
    const sorted = [...plans].sort((a, b) => {
      const sa = a.sort_order ?? 999;
      const sb = b.sort_order ?? 999;
      if (sa !== sb) return sa - sb;
      return (a.price_amount ?? 0) - (b.price_amount ?? 0);
    });
    return sorted.map((plan) => {
      const parsedMonthly = plan.price_amount === null || plan.price_amount === undefined ? null : Number(plan.price_amount);
      const monthly = parsedMonthly !== null && Number.isFinite(parsedMonthly) ? parsedMonthly : null;
      const annualPerMonth = monthly !== null ? Math.round((monthly * 10) / 12) : null;
      const annualBilled = monthly !== null ? Math.round(monthly * 10) : null;
      const tier = planTier(plan.code ?? plan.name);
      const defaultFeatures: PlanFeature[] = [];
      defaultFeatures.push({
        text: plan.max_branches ? `${plan.max_branches} locations` : "Unlimited locations",
        highlight: false,
        everything: false,
        annual_only: false,
      });
      defaultFeatures.push({
        text: plan.max_users ? `${plan.max_users} users` : "Unlimited users",
        highlight: false,
        everything: false,
        annual_only: false,
      });
      defaultFeatures.push({
        text: plan.max_employees ? `${plan.max_employees} employees` : "Unlimited employees",
        highlight: false,
        everything: false,
        annual_only: false,
      });
      if (plan.max_storage_mb) {
        const gb = plan.max_storage_mb / 1024;
        defaultFeatures.push({
          text: gb >= 1 ? `${gb.toFixed(1)} GB storage` : `${plan.max_storage_mb} MB storage`,
          highlight: false,
          everything: false,
          annual_only: false,
        });
      } else {
        defaultFeatures.push({
          text: "Unlimited storage",
          highlight: false,
          everything: false,
          annual_only: false,
        });
      }
      const moduleNames = (plan.modules ?? []).slice(0, 6).map((mod) => mod.name);
      defaultFeatures.push(
        ...moduleNames.map((name) => ({
          text: name,
          highlight: false,
          everything: false,
          annual_only: false,
        })),
      );

      const customFeatures = parsePlanFeatures(plan.features);
      const features = [...defaultFeatures];
      const seen = new Set(defaultFeatures.map((feature) => feature.text.toLowerCase()));
      for (const feature of customFeatures) {
        const key = feature.text.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        features.push(feature);
      }

      return { ...plan, tier, monthly, annualPerMonth, annualBilled, features };
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

  const starterPlan = useMemo(() => planCards.find((p) => p.tier === "starter"), [planCards]);
  const growthPlan = useMemo(() => planCards.find((p) => p.tier === "growth"), [planCards]);
  const proPlan = useMemo(() => planCards.find((p) => p.tier === "pro"), [planCards]);

  const totalModulesCount = useMemo(
    () => groupedModules.starter.length + groupedModules.growth.length + groupedModules.pro.length,
    [groupedModules],
  );
  const extraModulesCount = useMemo(
    () => groupedModules.growth.length + groupedModules.pro.length,
    [groupedModules],
  );

  const integrationPricingSummary = useMemo(() => {
    const paidPlans = integrationPlans.filter(
      (plan) => !plan.is_enterprise && typeof plan.price_amount === "number",
    );
    const cheapestPlan = paidPlans.reduce<number | null>((lowest, plan) => {
      if (typeof plan.price_amount !== "number") return lowest;
      if (lowest === null || plan.price_amount < lowest) return plan.price_amount;
      return lowest;
    }, null);

    return {
      cheapestPlan,
      totalPlans: integrationPlans.length,
    };
  }, [integrationPlans]);

  const faqs = useMemo(
    () =>
      lang === "es"
        ? [
            ["¿Es un POS?", "No. Es una plataforma operativa que trabaja junto a tu POS actual."],
            ["¿Debo cambiar mi POS?", "No. Puedes mantener Toast, Square, Clover u otro sistema actual."],
            ["¿El trial de 30 días cobra al inicio?", "No. Se carga tarjeta al suscribir, pero el primer cobro llega al finalizar el trial."],
            ["¿Puedo cambiar de plan durante el trial?", "Sí. Cambias módulos/límites del plan, pero no se reinicia el reloj de 30 días."],
            ["¿Funciona para múltiples locaciones?", "Sí. Una sola cuenta, todas tus locaciones en una vista unificada."],
            ["¿Reemplaza mis herramientas actuales?", "Complementa lo que tenés. No reemplaza tu POS, nómina o sistema de delivery."],
          ]
        : [
            ["Is this a POS?", "No. It is an operations platform that works alongside your existing POS."],
            ["Do I need to replace my POS?", "No. You can keep Toast, Square, Clover, or your current stack."],
            ["Does the 30-day trial charge at signup?", "No. Card is collected at signup, but first charge is at trial end."],
            ["Can I change plans during trial?", "Yes. Plan limits/modules change, but the 30-day trial clock does not reset."],
            ["Does it work for multiple locations?", "Yes. One account, all your locations in a single unified view."],
            ["Does it replace my existing tools?", "It complements what you have. It does not replace your POS, payroll, or delivery system."],
          ],
    [lang],
  );

  const platformCards = useMemo(
    () =>
      lang === "es"
        ? [
            ["01", "Operaciones y Cumplimiento", "Checklist digitales, procedimientos de apertura y cierre, registros de incidentes, seguridad alimentaria y mantenimiento de equipos — todo con firma de responsable y trazabilidad incorporada."],
            ["02", "People & RRHH", "Onboarding, turnos, solicitudes de ausencia, historial de capacitación, evaluaciones de desempeño, registros disciplinarios y firmas digitales de contratos — toda tu capa de personas, organizada."],
            ["03", "Cocina y Menú", "Archivo de recetas con escalado automático de porciones, costeo de menú vinculado directamente a las recetas, y directorio completo de proveedores con historial de pedidos y contactos."],
            ["04", "Comunicación", "Notificaciones en plataforma, alertas por SMS y mensajería por WhatsApp mantienen a tu equipo conectado en tiempo real — sin el caos de una app de terceros que nadie usa."],
            ["05", "Marketing y Calidad", "Gestioná tu ficha de Google My Business, organizá concursos de reseñas dentro de la plataforma y hacé seguimiento de evaluaciones de mystery shopper con puntuación ponderada e informes de tendencia."],
            ["06", "Roles y Permisos", "Cada módulo está controlado por una capa unificada de roles y permisos. Los dueños ven todo. Los managers ven lo que necesitan. El staff ve lo relevante para su turno."],
          ]
        : [
            ["01", "Operations & Compliance", "Digital checklists, opening and closing procedures, incident logs, food safety records, and equipment maintenance — all with sign-off and accountability tracking built in."],
            ["02", "People & HR", "Onboarding, scheduling, time-off requests, training records, performance reviews, disciplinary logs, and digital contract signatures — your entire people layer, organized."],
            ["03", "Kitchen & Menu", "Recipe archive with automatic portion scaling, menu costing tied directly to recipes, and a full supplier and vendor directory with order history and contacts."],
            ["04", "Communication", "Platform notifications, SMS alerts, and WhatsApp messaging keep your team connected in real time — without the chaos of a third-party app nobody actually uses."],
            ["05", "Marketing & Quality", "Manage your Google My Business listing, run in-platform review contests, and track mystery shopper evaluations with weighted scoring and trend reports."],
            ["06", "Roles & Permissions", "Every module is controlled by a unified roles and permissions layer. Owners see everything. Managers see what they need. Staff see what's relevant to their shift."],
          ],
    [lang],
  );

  const valueCards = useMemo(
    () =>
      lang === "es"
        ? [
            ["Fluidez", "Cada interacción tiene que sentirse natural. Si requiere más de un clic, preguntamos por qué. Hacemos el trabajo duro de nuestro lado para que nuestros clientes no tengan que hacerlo del suyo."],
            ["Empatía", "Trabajamos cada turno. Construimos para la persona que todavía está en el piso a medianoche — que no tiene tiempo de aprender software nuevo ni leer tutoriales."],
            ["Claridad", "Todo lo que un usuario necesita está visible en una pantalla. Sin menús enterrados, sin confusión. Una plataforma que se explica sola desde el momento en que la abrís."],
            ["Responsabilidad", "Ayudamos a los equipos a construir una cultura de propiedad — por turno, departamento y persona. Cada acción firmada. Cada estándar trazado."],
          ]
        : [
            ["Fluidity", "Every interaction should feel natural. If it takes more than one click, we ask why. We do the hard work on our end so our clients don't have to on theirs."],
            ["Empathy", "We've worked every shift. We build for the person still on the floor at midnight — who doesn't have time to learn new software or read a tutorial."],
            ["Clarity", "Everything a user needs is visible on one screen. No buried menus, no confusion. A platform that explains itself the moment you open it."],
            ["Accountability", "We help teams build a culture of ownership — by shift, by department, by person. Every action signed off. Every standard tracked."],
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
        ? ["Cadenas de restaurantes", "Servicio completo", "Quick Service", "Bares y cervecerías", "Ghost Kitchens", "Coffee Shops", "Food Trucks", "Catering"]
        : ["Restaurant Chains", "Full Service Restaurants", "Quick Service", "Bars & Breweries", "Ghost Kitchens", "Coffee Shops", "Food Trucks", "Catering"],
    [lang],
  );

  const realityItems = useMemo(
    () =>
      lang === "es"
        ? [
            ["Checklist digitales", "por turno, departamento y locación — firmados y trazados"],
            ["Onboarding de empleados", "centralizado — documentos, contratos y capacitación en un lugar"],
            ["Turnos y horarios", "hechos para restaurantes — filtros por rol, disponibilidad y visibilidad"],
            ["SOPs y archivos", "organizados por locación, departamento o rol — siempre accesibles"],
            ["Comunicación de equipo", "dentro de la plataforma — sin grupos de WhatsApp externos"],
            ["Registros de seguridad alimentaria", "listos para cualquier inspección, registrados cada turno"],
          ]
        : [
            ["Digital checklists", "by shift, department, and location — signed off and tracked"],
            ["Employee onboarding", "centralized — documents, contracts, and training in one place"],
            ["Scheduling", "built for restaurants — role filters, availability, and shift visibility"],
            ["SOPs and files", "organized by location, department, or role — always accessible"],
            ["Team communication", "inside the platform — no WhatsApp groups, no third-party apps"],
            ["Food safety logs", "ready for any health inspection, logged every shift"],
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
      // silent
    } finally {
      setLoadingPlanId(null);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--gbp-bg)] text-[var(--gbp-text)]">

      {/* ═══ NAV ═══ */}
      <header
        id="marketing-nav"
        className={`fixed left-0 right-0 top-0 z-50 h-16 bg-[var(--gbp-bg)]/92 backdrop-blur-xl transition-all duration-300 ${navScrolled ? "border-b border-[var(--gbp-border)]" : "border-b border-transparent"}`}
      >
        <div className="mx-auto flex h-full w-full max-w-[1400px] items-center justify-between px-10">
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
            <a href="#platform" className="rounded-md px-3 py-1.5 text-[13px] font-medium text-[var(--gbp-text2)] hover:bg-[var(--gbp-surface2)] hover:text-[var(--gbp-text)]">{copy.nav.platform}</a>
            <button
              onMouseEnter={() => setMegaOpen(true)}
              onClick={() => setMegaOpen((v) => !v)}
              className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-[13px] font-medium text-[var(--gbp-text2)] hover:bg-[var(--gbp-surface2)] hover:text-[var(--gbp-text)]"
            >
              {copy.nav.modules}
              <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${megaOpen ? "rotate-180" : "rotate-0"}`} />
            </button>
            <a href="#ai" className="rounded-md px-3 py-1.5 text-[13px] font-medium text-[var(--gbp-text2)] hover:bg-[var(--gbp-surface2)] hover:text-[var(--gbp-text)]">{copy.nav.ai}</a>
            <a href="#pricing" className="rounded-md px-3 py-1.5 text-[13px] font-medium text-[var(--gbp-text2)] hover:bg-[var(--gbp-surface2)] hover:text-[var(--gbp-text)]">{copy.nav.pricing}</a>
            <a href="#integrations" className="rounded-md px-3 py-1.5 text-[13px] font-medium text-[var(--gbp-text2)] hover:bg-[var(--gbp-surface2)] hover:text-[var(--gbp-text)]">{copy.nav.integrations}</a>
            <a href="#faq" className="rounded-md px-3 py-1.5 text-[13px] font-medium text-[var(--gbp-text2)] hover:bg-[var(--gbp-surface2)] hover:text-[var(--gbp-text)]">{copy.nav.faq}</a>
          </nav>

          <div className="flex items-center gap-3">
            {/* Language toggle */}
            <button
              type="button"
              aria-label="Toggle language"
              onClick={() => setLang((v) => (v === "en" ? "es" : "en"))}
              className="relative inline-flex h-8 w-16 select-none items-center rounded-full border border-[var(--gbp-border2)] bg-[var(--gbp-surface2)] px-1"
            >
              <span className="pointer-events-none absolute left-2 text-[10px] font-black uppercase tracking-[0.08em] text-[var(--gbp-muted)]">EN</span>
              <span className="pointer-events-none absolute right-2 text-[10px] font-black uppercase tracking-[0.08em] text-[var(--gbp-muted)]">ES</span>
              <span className={`pointer-events-none absolute left-1 top-1 h-6 w-7 rounded-full bg-white text-center text-[10px] font-black leading-6 text-[#111827] shadow-sm transition-transform duration-200 ${lang === "es" ? "translate-x-[28px]" : "translate-x-0"}`}>
                {lang === "es" ? "ES" : "EN"}
              </span>
            </button>

            {/* Day/Night shift toggle */}
            <div className="hidden items-center gap-2 md:flex">
              <span className="w-[72px] text-right text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--gbp-muted)]">
                {darkMode ? (lang === "es" ? "Turno Noche" : "Night Shift") : (lang === "es" ? "Turno Día" : "Day Shift")}
              </span>
              <button
                type="button"
                aria-label="Toggle day or night shift"
                onClick={() => setDarkMode((v) => !v)}
                className={`relative inline-flex h-[26px] w-12 shrink-0 cursor-pointer items-center rounded-full border-none p-0 outline-none transition-colors duration-200 ${darkMode ? "bg-[var(--gbp-violet)]" : "bg-[var(--gbp-border2)]"}`}
              >
                <span className={`absolute left-[3px] top-[3px] flex h-5 w-5 items-center justify-center rounded-full bg-white text-[11px] shadow-sm transition-transform duration-[280ms] ${darkMode ? "translate-x-[22px]" : "translate-x-0"}`}>
                  {darkMode ? "🌙" : "☀️"}
                </span>
              </button>
            </div>

            <Link href="/auth/login" className="rounded-md border border-[var(--gbp-border2)] px-3 py-1.5 text-[13px] font-semibold text-[var(--gbp-text)] hover:bg-[var(--gbp-surface2)]">{copy.nav.login}</Link>
            <button
              type="button"
              onClick={() => document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" })}
              className="rounded-md bg-[var(--gbp-accent)] px-[18px] py-2 text-[12px] font-bold tracking-[0.03em] text-white transition-all hover:bg-[var(--gbp-accent-hover)] hover:-translate-y-px"
            >
              {lang === "es" ? "Prueba 30d" : "Trial 30d"}
            </button>
          </div>
        </div>

        {/* Mega menu */}
        {megaOpen && (
          <div
            onMouseLeave={() => setMegaOpen(false)}
            className="border-b border-[var(--gbp-border)] bg-[var(--gbp-surface)] shadow-[0_20px_60px_rgba(17,24,39,0.1)]"
          >
            <div
              className="mx-auto px-10 py-9"
              style={{ maxWidth: "1400px", display: "grid", gridTemplateColumns: "1fr 1px 1fr 1px 1fr", gap: 0 }}
            >
              {/* Starter */}
              <div className="pr-9">
                <div className="mb-[18px] flex items-center gap-2.5 border-b border-[var(--gbp-border)] pb-3.5">
                  <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.1em] text-emerald-500">Starter</span>
                  <span className="text-[11px] text-[var(--gbp-muted)]">
                    {starterPlan?.monthly ? `from $${starterPlan.monthly}/mo` : "from $49/mo"}
                  </span>
                </div>
                <ul className="flex flex-col gap-0.5">
                  {groupedModules.starter.map((name) => (
                    <li key={name}>
                      <a href="#modules" onClick={() => setMegaOpen(false)} className="flex items-center gap-2.5 rounded-md px-2.5 py-[7px] text-[13px] font-medium text-[var(--gbp-text2)] transition-colors hover:bg-[var(--gbp-surface2)] hover:text-[var(--gbp-text)]">
                        <span className="h-[5px] w-[5px] shrink-0 rounded-full bg-emerald-500" />
                        {name}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="bg-[var(--gbp-border)]" />

              {/* Growth */}
              <div className="px-9">
                <div className="mb-[18px] flex items-center gap-2.5 border-b border-[var(--gbp-border)] pb-3.5">
                  <span className="rounded-full bg-[var(--gbp-violet-soft)] px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.1em] text-[var(--gbp-violet)]">Growth</span>
                  <span className="text-[11px] text-[var(--gbp-muted)]">
                    {growthPlan?.monthly ? `from $${growthPlan.monthly}/mo` : "from $129/mo"}
                  </span>
                </div>
                <ul className="flex flex-col gap-0.5">
                  {groupedModules.growth.map((name) => {
                    const isAi = name.toLowerCase().includes("ai") || name.toLowerCase().includes("assistant") || name.toLowerCase().includes("report");
                    return (
                      <li key={name}>
                        <a href="#modules" onClick={() => setMegaOpen(false)} className={`flex items-center gap-2.5 rounded-md px-2.5 py-[7px] text-[13px] font-medium transition-colors hover:bg-[var(--gbp-surface2)] ${isAi ? "text-[var(--gbp-violet)]" : "text-[var(--gbp-text2)] hover:text-[var(--gbp-text)]"}`}>
                          <span className="h-[5px] w-[5px] shrink-0 rounded-full bg-[var(--gbp-violet)]" />
                          {isAi ? `✦ ${name}` : name}
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div className="bg-[var(--gbp-border)]" />

              {/* Pro */}
              <div className="pl-9">
                <div className="mb-[18px] flex items-center gap-2.5 border-b border-[var(--gbp-border)] pb-3.5">
                  <span className="rounded-full bg-[var(--gbp-accent-glow)] px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.1em] text-[var(--gbp-accent)]">Pro</span>
                  <span className="text-[11px] text-[var(--gbp-muted)]">
                    {proPlan?.monthly ? `from $${proPlan.monthly}/mo` : "from $249/mo"}
                  </span>
                </div>
                <ul className="flex flex-col gap-0.5">
                  {groupedModules.pro.map((name) => {
                    const isAi = name.toLowerCase().includes("ai") || name.toLowerCase().includes("assistant");
                    return (
                      <li key={name}>
                        <a href="#modules" onClick={() => setMegaOpen(false)} className={`flex items-center gap-2.5 rounded-md px-2.5 py-[7px] text-[13px] font-medium transition-colors hover:bg-[var(--gbp-surface2)] ${isAi ? "text-[var(--gbp-violet)]" : "text-[var(--gbp-text2)] hover:text-[var(--gbp-text)]"}`}>
                          <span className="h-[5px] w-[5px] shrink-0 rounded-full bg-[var(--gbp-accent)]" />
                          {isAi ? `✦ ${name}` : name}
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
            <div className="mx-auto flex max-w-[1400px] items-center justify-between border-t border-[var(--gbp-border)] px-10 py-4">
              <p className="text-[13px] text-[var(--gbp-muted)]">
                <strong className="text-[var(--gbp-text)]">{totalModulesCount} modules</strong>
                {" · "}Start with what you need, add more as you grow · All plans include unlimited locations via Enterprise
              </p>
              <a
                href="#modules"
                onClick={() => setMegaOpen(false)}
                className="flex items-center gap-1.5 rounded-md border border-[var(--gbp-accent)]/20 bg-[var(--gbp-accent-glow)] px-4 py-2 text-[12px] font-bold text-[var(--gbp-accent)] transition-colors hover:bg-[var(--gbp-accent)] hover:text-white"
              >
                {lang === "es" ? "Ver todos los módulos →" : "See all modules →"}
              </a>
            </div>
          </div>
        )}
      </header>

      <main className="pt-[64px]">

        {/* ═══ HERO ═══ */}
        <section className="relative overflow-hidden px-6 pb-20 pt-[140px] md:min-h-screen md:pb-20">
          <div
            className="pointer-events-none absolute inset-0"
            style={{ background: "radial-gradient(ellipse 65% 60% at 75% 35%, rgba(212,83,26,0.07) 0%, transparent 60%), radial-gradient(ellipse 45% 50% at 15% 85%, rgba(212,83,26,0.04) 0%, transparent 55%)" }}
          />

          {/* Scroll hint */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: navScrolled ? 0 : 1 }}
            transition={{ duration: 0.6, delay: navScrolled ? 0 : 1 }}
            className="pointer-events-none fixed bottom-8 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-[7px] md:flex"
          >
            <div className="scroll-hint-line" />
            <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--gbp-muted)]">Scroll</span>
          </motion.div>

          <div className="mx-auto grid w-full max-w-[1240px] items-center gap-16 md:grid-cols-2">
            {/* Left */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut", delay: 0.1 }}
            >
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[var(--gbp-accent)]/20 bg-[var(--gbp-accent-glow)] px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--gbp-accent)]">
                <span className="hero-badge-dot inline-block h-1.5 w-1.5 rounded-full bg-[var(--gbp-accent)]" />
                {copy.hero.badge}
              </div>

              <h1 className="hero-title font-bold leading-[1.02] tracking-[-0.03em] text-[var(--gbp-text)]">
                {copy.hero.titleA}<br />
                {copy.hero.titleB} <span className="grad-orange">{copy.hero.titleC.split(" ").slice(0, -1).join(" ")}</span><br />
                {copy.hero.titleC.split(" ").slice(-1)[0]}
              </h1>

              <p className="mt-6 max-w-[460px] text-[17px] leading-[1.75] text-[var(--gbp-text2)]">
                {copy.hero.sub}
              </p>

              <div className="mt-10 flex flex-wrap items-center gap-3.5">
                <button
                  type="button"
                  onClick={() => document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" })}
                  className="inline-flex items-center gap-2 rounded-md bg-[var(--gbp-accent)] px-[26px] py-3.5 text-[14px] font-bold text-white shadow-[0_4px_14px_var(--gbp-accent-glow)] transition-all hover:bg-[var(--gbp-accent-hover)] hover:-translate-y-0.5 hover:shadow-[0_6px_20px_var(--gbp-accent-glow)]"
                >
                  {copy.hero.primary}
                </button>
                <a
                  href="#modules"
                  className="inline-flex items-center gap-2 rounded-md border border-[var(--gbp-border2)] px-[22px] py-3.5 text-[14px] font-semibold text-[var(--gbp-text)] transition-all hover:border-[var(--gbp-text)] hover:bg-[var(--gbp-surface2)]"
                >
                  {copy.hero.secondary}
                </a>
              </div>

              {/* Trust */}
              <div className="mt-9 flex items-center gap-3.5">
                <div className="flex">
                  <span className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-full border-2 border-[var(--gbp-bg)] bg-gradient-to-br from-[var(--gbp-accent)] to-[#FF8A50] text-[10px] font-bold text-white">MA</span>
                  <span className="-ml-2 inline-flex h-[30px] w-[30px] items-center justify-center rounded-full border-2 border-[var(--gbp-bg)] bg-gradient-to-br from-emerald-500 to-emerald-600 text-[10px] font-bold text-white">RG</span>
                  <span className="-ml-2 inline-flex h-[30px] w-[30px] items-center justify-center rounded-full border-2 border-[var(--gbp-bg)] bg-gradient-to-br from-blue-500 to-blue-600 text-[10px] font-bold text-white">JP</span>
                </div>
                <p className="text-[12px] font-medium text-[var(--gbp-muted)]">{copy.hero.trust}</p>
              </div>

              {/* Countdown */}
              <div className="mt-8 inline-flex items-center gap-1.5">
                {[
                  { val: countdown.days, label: lang === "es" ? "días" : "days" },
                  { val: countdown.hours, label: lang === "es" ? "hrs" : "hrs" },
                  { val: countdown.mins, label: lang === "es" ? "min" : "min" },
                ].map(({ val, label }, i) => (
                  <span key={label} className="inline-flex items-center gap-1.5">
                    {i > 0 && <span className="mb-3 self-start text-[20px] font-black text-[var(--gbp-accent)]">:</span>}
                    <span className="text-center">
                      <span className="block text-[26px] font-black leading-none text-[var(--gbp-text)]">{String(val).padStart(2, "0")}</span>
                      <span className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--gbp-muted)]">{label}</span>
                    </span>
                  </span>
                ))}
                <div className="ml-3 border-l border-[var(--gbp-border2)] pl-3">
                  <p className="text-[11px] leading-[1.4] text-[var(--gbp-muted)]">
                    {lang === "es" ? "Hasta el lanzamiento" : "Until soft launch"}<br />
                    {lang === "es" ? "Agosto 1, 2026" : "August 1, 2026"}
                  </p>
                </div>
              </div>
            </motion.div>

            {/* Right: mock window */}
            <motion.div
              initial={{ opacity: 0, y: 26 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.65, ease: "easeOut", delay: 0.4 }}
              whileHover={{ y: -3 }}
              onMouseEnter={() => setFloatPaused(true)}
              onMouseLeave={() => setFloatPaused(false)}
              className="relative rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-4 shadow-[var(--gbp-shadow-lg)]"
            >
              <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-[var(--gbp-accent)]/12 blur-2xl" />

              <div className="mb-3 flex items-center gap-1.5 rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-bg2)] px-3 py-2">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                <span className="ml-2 text-[11px] font-semibold text-[var(--gbp-muted)]">GetBackplate · {lang === "es" ? "Panel Operativo" : "Operations Dashboard"}</span>
              </div>

              <div className="mb-3 grid grid-cols-3 gap-2">
                <div className="rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-bg2)] p-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--gbp-muted)]">{lang === "es" ? "Locaciones" : "Locations"}</p>
                  <p className="mt-1 text-2xl font-bold text-[var(--gbp-accent)]">3</p>
                  <p className="text-[11px] text-[var(--gbp-muted)]">{lang === "es" ? "Activas" : "Active"}</p>
                </div>
                <div className="rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-bg2)] p-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--gbp-muted)]">{lang === "es" ? "Checklist" : "Checklists"}</p>
                  <p className="mt-1 text-2xl font-bold text-emerald-500">94%</p>
                  <p className="text-[11px] text-[var(--gbp-muted)]">{lang === "es" ? "Hoy" : "Today"}</p>
                </div>
                <div className="rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-bg2)] p-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--gbp-muted)]">{lang === "es" ? "Incidencias" : "Issues"}</p>
                  <p className="mt-1 text-2xl font-bold text-[var(--gbp-accent)]">2</p>
                  <p className="text-[11px] text-[var(--gbp-muted)]">{lang === "es" ? "Abiertas" : "Open"}</p>
                </div>
              </div>

              <div className="space-y-2 rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-bg2)] p-3 text-sm text-[var(--gbp-text2)]">
                <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--gbp-muted)]">{lang === "es" ? "Checklist apertura · hoy" : "Opening checklist · today"}</p>
                <div className="flex items-center justify-between rounded-md bg-[var(--gbp-surface)] px-3 py-2">
                  <span>{lang === "es" ? "Temperatura completada" : "Temperature log complete"}</span>
                  <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-bold text-emerald-500">Done</span>
                </div>
                <div className="flex items-center justify-between rounded-md bg-[var(--gbp-surface)] px-3 py-2">
                  <span>{lang === "es" ? "Ingreso de staff verificado" : "Staff sign-in verified"}</span>
                  <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-bold text-emerald-500">Done</span>
                </div>
                <div className="flex items-center justify-between rounded-md bg-[var(--gbp-surface)] px-3 py-2">
                  <span>{lang === "es" ? "Revisión de equipos" : "Equipment walkthrough"}</span>
                  <span className="rounded-full bg-[var(--gbp-accent)]/15 px-2 py-0.5 text-[11px] font-bold text-[var(--gbp-accent)]">Open</span>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between rounded-lg border border-[var(--gbp-violet)]/30 bg-[var(--gbp-violet-soft)] p-3">
                <strong className="text-[13px] text-[var(--gbp-text)]">✦ {lang === "es" ? "Alerta IA:" : "AI Alert:"}</strong>
                <span className="text-[12px] text-[var(--gbp-text2)]">{lang === "es" ? "3 contratos vencen en 5 días" : "3 contracts expiring in 5 days"}</span>
                <span className="rounded-full bg-[var(--gbp-violet)] px-2 py-0.5 text-[11px] font-bold text-white">{lang === "es" ? "Ver" : "View"}</span>
              </div>

              {/* Float badges */}
              <div
                className="float-badge float-badge-1 absolute -right-2 -top-[18px] rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-3 py-2 text-xs font-semibold text-[var(--gbp-text)] shadow-[0_14px_30px_rgba(0,0,0,0.14)]"
                style={{ animationPlayState: floatPaused ? "paused" : "running" }}
              >
                <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-emerald-500" />
                {lang === "es" ? "Checklist completo · Biloxi" : "All checklists complete · Biloxi ✓"}
              </div>
              <div
                className="float-badge float-badge-2 absolute -bottom-2 -left-6 rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-3 py-2 text-xs font-semibold text-[var(--gbp-text)] shadow-[0_14px_30px_rgba(0,0,0,0.14)]"
                style={{ animationPlayState: floatPaused ? "paused" : "running" }}
              >
                <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-[var(--gbp-violet)]" />
                {lang === "es" ? "Impulsado por IA ✦" : "Powered by AI Intelligence ✦"}
              </div>
            </motion.div>
          </div>
        </section>

        {/* ═══ MARQUEE ═══ */}
        <div className="relative flex items-center overflow-hidden border-y border-[var(--gbp-border)] bg-[var(--gbp-bg)] py-[22px]">
          <span className="relative z-10 shrink-0 bg-[var(--gbp-bg)] pl-10 pr-8 text-[11px] font-black uppercase tracking-[0.14em] text-[var(--gbp-text)]">
            {lang === "es" ? "Diseñado para" : "Built for"}
          </span>
          <div className="relative min-w-0 flex-1 overflow-hidden">
            <div
              className="pointer-events-none absolute right-0 top-0 bottom-0 z-10 w-20"
              style={{ background: "linear-gradient(to left, var(--gbp-bg), transparent)" }}
            />
            <div className="marquee-inner flex w-max items-center whitespace-nowrap">
              {[...builtForItems, ...builtForItems].map((item, idx) => (
                <span key={`${item}-${idx}`} className="inline-flex items-center">
                  <span className={`px-5 text-[15px] tracking-[-0.01em] ${idx % 3 === 0 ? "font-bold text-[var(--gbp-accent)]" : "font-semibold text-[var(--gbp-text2)]"}`}>{item}</span>
                  <span className="text-[14px] text-[var(--gbp-border2)] opacity-70">—</span>
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* ═══ REALITY ═══ */}
        <section className="bg-[var(--gbp-bg)] px-6 py-24 md:py-28">
          <div className="mx-auto max-w-[1240px]">
            <div className="grid gap-20 md:grid-cols-2 md:items-center">
              <motion.div
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, ease: "easeOut" }}
                viewport={{ once: true, amount: 0.4 }}
              >
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--gbp-accent)]/20 bg-[var(--gbp-accent-glow)] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--gbp-accent)]">
                  {lang === "es" ? "La Realidad" : "The Reality"}
                </span>
                <h2 className="mt-3.5 text-[clamp(34px,4vw,52px)] font-bold leading-[1.05] tracking-[-0.03em] text-[var(--gbp-text)]">
                  {copy.sections.realityTitle}<br />
                  <span className="grad-orange">{copy.sections.realityTitleAccent}</span>
                </h2>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, ease: "easeOut", delay: 0.06 }}
                viewport={{ once: true, amount: 0.3 }}
              >
                <p className="text-[16px] leading-[1.8] text-[var(--gbp-text2)]">{copy.sections.realityBody}</p>
                <p className="mt-7 text-[15px] font-bold text-[var(--gbp-text)]">{copy.sections.realityWith}</p>
                <ul className="mt-0 list-none">
                  {realityItems.map(([strong, rest], idx) => (
                    <li
                      key={strong}
                      className={`flex items-center gap-3 border-b border-[var(--gbp-border)] py-[13px] text-[14px] font-medium text-[var(--gbp-text2)] ${idx === 0 ? "mt-7 border-t" : ""}`}
                    >
                      <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-[var(--gbp-accent)]" />
                      <span><strong className="text-[var(--gbp-text)]">{strong}</strong> {rest}</span>
                    </li>
                  ))}
                </ul>
              </motion.div>
            </div>
          </div>
        </section>

        {/* ═══ PLATFORM ═══ */}
        <section className="border-t border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-6 py-24 md:py-28" id="platform">
          <div className="mx-auto max-w-[1240px]">
            <div className="mb-[60px] text-center">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--gbp-accent)]/20 bg-[var(--gbp-accent-glow)] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--gbp-accent)]">
                {lang === "es" ? "La Plataforma" : "The Platform"}
              </span>
              <h2 className="mt-3.5 text-[clamp(34px,4vw,52px)] font-bold leading-[1.05] tracking-[-0.03em] text-[var(--gbp-text)]">
                {lang === "es"
                  ? <>Una plataforma. Cada sistema que tu restaurante<br />ha estado ejecutando <span className="grad-orange">sin.</span></>
                  : <>One platform. Every system your restaurant<br />has been running <span className="grad-orange">without.</span></>}
              </h2>
              <p className="mx-auto mt-3.5 max-w-[560px] text-[16px] leading-[1.7] text-[var(--gbp-text2)]">
                {lang === "es"
                  ? "GetBackplate gestiona todo lo que tu POS deja atrás — operaciones, personas, cocina, comunicación y más."
                  : "GetBackplate manages everything your POS leaves behind — operations, people, kitchen, communication, and more."}
              </p>
            </div>
            <div className="grid gap-px overflow-hidden rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-border)] md:grid-cols-2 lg:grid-cols-3">
              {platformCards.map(([num, title, body], idx) => (
                <motion.article
                  key={num}
                  initial={{ opacity: 0, y: 18 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.45, ease: "easeOut", delay: idx * 0.06 }}
                  viewport={{ once: true, amount: 0.2 }}
                  className="group bg-[var(--gbp-surface)] p-9 transition-colors hover:bg-[var(--gbp-surface2)]"
                >
                  <p className="text-[42px] font-black leading-none tracking-[-0.04em] text-[var(--gbp-border2)] transition-colors duration-200 group-hover:text-[var(--gbp-accent)]">{num}</p>
                  <h3 className="mt-[18px] text-[15px] font-bold text-[var(--gbp-text)]">{title}</h3>
                  <p className="mt-2.5 text-[13px] leading-[1.75] text-[var(--gbp-text2)]">{body}</p>
                </motion.article>
              ))}
            </div>
          </div>
        </section>

        {/* ═══ MULTI-LOCATION ═══ */}
        <section className="bg-[var(--gbp-bg)] px-6 py-24 md:py-28">
          <div className="mx-auto max-w-[1200px]">
            <div className="grid gap-[60px] md:grid-cols-2 md:items-center md:gap-[80px]">
              <div>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[var(--gbp-muted)]">
                  {lang === "es" ? "Multi-locación" : "Multi-Location"}
                </span>
                <h2 className="mt-4 text-[clamp(34px,4vw,52px)] font-bold leading-[1.05] tracking-[-0.03em] text-[var(--gbp-text)]">
                  {lang === "es" ? (
                    <>Todas tus locaciones. Una pantalla.<br /><span className="grad-orange">Sin cambiar pestañas.</span></>
                  ) : (
                    <>All your locations. One screen.<br /><span className="grad-orange">No tab switching.</span></>
                  )}
                </h2>
              </div>
              <div>
                <p className="text-[16px] leading-[1.8] text-[var(--gbp-text2)]">
                  {lang === "es"
                    ? "La mayoría de los operadores con varias sucursales entran a cada una por separado — dashboards distintos, logins distintos, ventanas distintas. GetBackplate te da una vista unificada de todas tus locaciones. Checklists, personal, cocina, incidentes abiertos — todo, lado a lado, en tiempo real."
                    : "Most operators running multiple locations are logging into each one separately — different dashboards, different logins, different windows. GetBackplate gives you a unified view across every location. Checklists, staff, kitchen status, open incidents — all of it, side by side, in real time."}
                </p>
                <div className="mt-9 grid grid-cols-3 gap-3">
                  {[
                    { val: "ONE", label: lang === "es" ? "Login para todas las locaciones" : "Login for all locations" },
                    { val: "ZERO", label: lang === "es" ? "Cambio de tabs requerido" : "Tab switching required" },
                    { val: "∞", label: lang === "es" ? "Locaciones soportadas" : "Locations supported" },
                  ].map(({ val, label }) => (
                    <div key={val} className="rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-[24px_20px] text-center shadow-[var(--gbp-shadow-sm)]">
                      <p className="text-[24px] font-extrabold uppercase leading-none tracking-[-0.01em] text-[var(--gbp-accent)]">{val}</p>
                      <p className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--gbp-muted)]">{label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ═══ NOT A POS ═══ */}
        <section className={`px-6 py-20 md:py-24 ${darkMode ? "bg-[var(--gbp-surface)] border-y border-[var(--gbp-border)]" : "bg-[var(--gbp-text)]"}`}>
          <div className="mx-auto max-w-[1100px] text-center">
            <span className={`inline-flex items-center rounded-full border px-4 py-1 text-[10px] font-black uppercase tracking-[0.11em] ${darkMode ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" : "border-emerald-400/35 bg-emerald-500/10 text-emerald-300"}`}>
              {lang === "es" ? "Qué sí es GetBackplate" : "What GetBackplate is"}
            </span>
            <h3 className={`mt-5 text-[clamp(26px,3.8vw,44px)] font-bold leading-[1.1] tracking-[-0.03em] ${darkMode ? "text-[var(--gbp-text)]" : "text-white"}`}>
              {lang === "es"
                ? "Plataforma operativa de restaurantes.\nNo un POS. No nómina.\nLa capa que corre todo lo que está en el medio."
                : "Restaurant operations platform.\nNot a POS. Not payroll.\nThe layer that runs everything in between."}
            </h3>
            <p className={`mx-auto mt-4 max-w-4xl text-[15px] leading-[1.75] ${darkMode ? "text-[var(--gbp-text2)]" : "text-white/55"}`}>
              {lang === "es"
                ? "Toast, Waycloud, Square y Clover corren tus transacciones. GetBackplate corre todo lo demás — tu gente, tus procesos, tus estándares, tu comunicación. No reemplazamos tu POS. Lo completamos."
                : "Toast, Waycloud, Square, and Clover run your transactions. GetBackplate runs everything else — your people, your processes, your standards, your communication. We don't replace your POS. We complete it."}
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2.5">
              {notPosTags.yes.map((item) => (
                <span key={`yes-${item}`} className="rounded-md border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-[12px] font-semibold text-emerald-300">✓ {item}</span>
              ))}
              {notPosTags.no.map((item) => (
                <span key={`no-${item}`} className="rounded-md border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-[12px] font-semibold text-rose-300">× {item}</span>
              ))}
            </div>
            <p className={`mt-7 text-[12px] ${darkMode ? "text-[var(--gbp-muted)]" : "text-white/28"}`}>
              {lang === "es"
                ? "Compatible con Toast, Square, Clover, Aloha y cualquier POS existente."
                : "Compatible with Toast, Square, Clover, Aloha, and any existing POS system."}
            </p>
          </div>
        </section>

        {/* ═══ MODULES ═══ */}
        <section className="bg-[var(--gbp-bg)] px-6 py-24 md:py-28" id="modules">
          <div className="mx-auto max-w-[1240px]">
            <div className="mb-[52px] grid gap-[60px] md:grid-cols-2 md:items-end">
              <div>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--gbp-accent)]/20 bg-[var(--gbp-accent-glow)] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--gbp-accent)]">
                  {lang === "es" ? "Módulos de Plataforma" : "Platform Modules"}
                </span>
                <h2 className="mt-3.5 text-[clamp(34px,4vw,52px)] font-bold leading-[1.05] tracking-[-0.03em] text-[var(--gbp-text)]">
                  {copy.sections.modulesTitle}
                </h2>
              </div>
              <p className="text-[16px] leading-[1.8] text-[var(--gbp-text2)]">
                {lang === "es"
                  ? "GetBackplate es modular por diseño. Empezá con lo que necesitás, agregá módulos mientras crecés — y dejá que nuestra IA trabaje en todos ellos para mostrar lo que importa."
                  : "GetBackplate is modular by design. Start with what you need, add modules as you grow — and let our AI work across all of them to surface what matters."}
              </p>
            </div>

            {/* Starter modules grid */}
            <div className="grid gap-px overflow-hidden rounded-t-xl border border-[var(--gbp-border)] bg-[var(--gbp-border)] md:grid-cols-3">
              {groupedModules.starter.slice(0, 6).map((name, idx) => (
                <motion.article
                  key={name}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, ease: "easeOut", delay: idx * 0.07 }}
                  viewport={{ once: true, amount: 0.2 }}
                  className="group flex flex-col gap-3 bg-[var(--gbp-surface)] p-[34px_28px] transition-colors hover:bg-[var(--gbp-surface2)]"
                >
                  <p className="text-[38px] font-black leading-none tracking-[-0.03em] text-[var(--gbp-border2)] transition-colors duration-200 group-hover:text-[var(--gbp-accent)]">
                    {String(idx + 1).padStart(2, "0")}
                  </p>
                  <h3 className="text-[15px] font-bold text-[var(--gbp-text)]">{name}</h3>
                  {MODULE_DESCRIPTIONS[name] && (
                    <p className="text-[13px] leading-[1.7] text-[var(--gbp-text2)]">{MODULE_DESCRIPTIONS[name]}</p>
                  )}
                </motion.article>
              ))}
            </div>

            {/* Expand bar */}
            <button
              type="button"
              onClick={() => setModulesExpanded((v) => !v)}
              className="flex w-full items-center justify-between gap-8 border border-t-0 border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-7 py-[18px] transition-colors hover:bg-[var(--gbp-surface2)] last:rounded-b-xl"
            >
              <p className="text-left text-[13px] leading-[1.6] text-[var(--gbp-text2)]">
                {lang === "es" ? (
                  <>Plus <strong className="text-[var(--gbp-text)]">{extraModulesCount} módulos más</strong> — SMS &amp; WhatsApp, Asignación de Tareas, Incidentes, Vacaciones, Mantenimiento de Equipos, Constructor de Turnos, Integración Zoom, Costo de Menú, Recetas, Temperatura &amp; Seguridad Alimentaria, Evaluaciones, GMB, Review Champions, Mystery Shopper, ✦ AI Quick Reports, ✦ Full AI Assistant.</>
                ) : (
                  <>Plus <strong className="text-[var(--gbp-text)]">{extraModulesCount} more modules</strong> — SMS &amp; WhatsApp, Task Assignment, Incident Log, Time-Off Requests, Disciplinary Log, Equipment Tracker, Schedule Builder, Zoom Integration, Menu Costing, Recipe Archive, Temperature &amp; Food Safety, Performance Reviews, Google My Business, Review Champions, Mystery Shopper, ✦ AI Quick Reports, ✦ Full AI Assistant.</>
                )}
              </p>
              <span className="flex shrink-0 items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.06em] text-[var(--gbp-accent)]">
                {modulesExpanded ? (lang === "es" ? "Ocultar" : "Hide") : (lang === "es" ? "Ver todos" : "See all modules")}
                <span className={`inline-block transition-transform duration-200 ${modulesExpanded ? "rotate-180" : ""}`}>↓</span>
              </span>
            </button>

            {/* Expandable panel */}
            {modulesExpanded && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.25 }}
                className="overflow-hidden rounded-b-xl border border-t-0 border-[var(--gbp-border)]"
              >
                {groupedModules.growth.length > 0 && (
                  <>
                    <div className="flex items-center gap-4 bg-[var(--gbp-bg2)] px-[22px] py-[11px]">
                      <span className="whitespace-nowrap text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--gbp-violet)]">
                        {lang === "es" ? "Módulos Plan Growth" : "Growth Plan Modules"}
                      </span>
                      <div className="h-px flex-1 bg-[var(--gbp-border2)]" />
                    </div>
                    <div className="grid gap-px bg-[var(--gbp-border)] md:grid-cols-4">
                      {groupedModules.growth.map((name) => (
                        <div key={name} className="flex flex-col gap-1.5 bg-[var(--gbp-surface2)] p-[26px_22px]">
                          <span className="inline-block w-fit rounded-full bg-[var(--gbp-violet-soft)] px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--gbp-violet)]">Growth</span>
                          <p className="text-[14px] font-bold text-[var(--gbp-text)]">{name}</p>
                          {MODULE_DESCRIPTIONS[name] && (
                            <p className="text-[12px] leading-[1.65] text-[var(--gbp-text2)]">{MODULE_DESCRIPTIONS[name]}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                )}
                {groupedModules.pro.length > 0 && (
                  <>
                    <div className="flex items-center gap-4 bg-[var(--gbp-bg2)] px-[22px] py-[11px]">
                      <span className="whitespace-nowrap text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--gbp-accent)]">
                        {lang === "es" ? "Módulos Plan Pro" : "Pro Plan Modules"}
                      </span>
                      <div className="h-px flex-1 bg-[var(--gbp-border2)]" />
                    </div>
                    <div className="grid gap-px bg-[var(--gbp-border)] md:grid-cols-4">
                      {groupedModules.pro.map((name) => (
                        <div key={name} className="flex flex-col gap-1.5 bg-[var(--gbp-surface2)] p-[26px_22px]">
                          <span className="inline-block w-fit rounded-full bg-[var(--gbp-accent-glow)] px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--gbp-accent)]">Pro</span>
                          <p className="text-[14px] font-bold text-[var(--gbp-text)]">{name}</p>
                          {MODULE_DESCRIPTIONS[name] && (
                            <p className="text-[12px] leading-[1.65] text-[var(--gbp-text2)]">{MODULE_DESCRIPTIONS[name]}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </motion.div>
            )}
          </div>
        </section>

        {/* ═══ AI INTELLIGENCE ═══ */}
        <section className="border-t border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-6 py-24 md:py-28" id="ai">
          <div className="mx-auto max-w-[1240px]">
            <div className="grid gap-[72px] md:grid-cols-[360px_1fr] md:items-start">

              {/* Left sticky */}
              <div className="md:sticky md:top-[84px]">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--gbp-violet)]/25 bg-[var(--gbp-violet-soft)] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--gbp-violet)]">
                  {lang === "es" ? "Inteligencia IA" : "AI Intelligence"}
                </span>
                <h2 className="mt-3.5 text-[clamp(34px,4vw,52px)] font-bold leading-[1.05] tracking-[-0.03em] text-[var(--gbp-text)]">
                  {copy.sections.aiTitle}<br />
                  <span className="grad-violet">{copy.sections.aiTitleAccent}</span>
                </h2>
                <p className="mt-7 text-[15px] leading-[1.8] text-[var(--gbp-text2)]">
                  {lang === "es"
                    ? "GetBackplate AI trabaja en todos los módulos — redacta contenido, detecta alertas y responde preguntas sobre tus propias operaciones. Sin prompts que aprender. Sin herramientas separadas."
                    : "GetBackplate AI works across every module — drafting content, surfacing alerts, and answering questions about your own operations. No prompts to learn. No separate tool to open."}
                </p>
                <div className="mt-7 inline-flex items-center gap-2 rounded-xl border border-[var(--gbp-violet)]/20 bg-gradient-to-br from-[var(--gbp-violet-soft)] to-transparent px-4 py-2.5 text-[12px] font-bold text-[var(--gbp-text)]">
                  <span>✦</span>
                  <span>{lang === "es" ? "Potenciado por IA" : "Powered by AI"}</span>
                  <span className="text-[var(--gbp-violet)]">— {lang === "es" ? "planes Growth y Pro" : "available on Growth & Pro plans"}</span>
                </div>
              </div>

              {/* Right tabs */}
              <div>
                {/* Tab nav */}
                <div className="flex gap-px overflow-hidden rounded-t-xl border border-[var(--gbp-border)] bg-[var(--gbp-border)]" style={{ flexDirection: "row" }}>
                  {(["draft", "know", "ask"] as const).map((tab) => {
                    const labels: Record<string, { verb: string; desc: string }> = {
                      draft: { verb: lang === "es" ? "Redactá." : "Draft it.", desc: lang === "es" ? "Escribí una frase. Obtené un borrador listo." : "Write one sentence. Get a publish-ready draft." },
                      know: { verb: lang === "es" ? "Detectá." : "Know it.", desc: lang === "es" ? "Detectá problemas antes que tu manager." : "Surface problems before your manager does." },
                      ask: { verb: lang === "es" ? "Preguntá." : "Ask it.", desc: lang === "es" ? "Tus operaciones, en el idioma que pensás." : "Your operations, in the language you think in." },
                    };
                    return (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setAiTab(tab)}
                        className={`flex-1 border-b-2 px-[22px] py-[18px] text-left transition-colors ${aiTab === tab ? "border-[var(--gbp-violet)] bg-[var(--gbp-surface)]" : "border-transparent bg-[var(--gbp-surface2)] hover:bg-[var(--gbp-bg2)]"}`}
                      >
                        <p className={`text-[17px] font-black leading-none tracking-[-0.02em] ${aiTab === tab ? "text-[var(--gbp-violet)]" : "text-[var(--gbp-text)]"}`}>{labels[tab].verb}</p>
                        <p className="mt-1 text-[12px] leading-[1.4] text-[var(--gbp-text2)]">{labels[tab].desc}</p>
                      </button>
                    );
                  })}
                </div>

                {/* Panel */}
                <div className="rounded-b-xl border border-t-0 border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-[26px]">
                  {aiTab === "draft" && (
                    <motion.div key="draft" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.22 }}>
                      <div className="mb-3 flex items-center gap-2">
                        <span className="inline-flex rounded-full border border-[var(--gbp-violet)]/20 bg-[var(--gbp-violet-soft)] px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--gbp-violet)]">Growth Plan</span>
                        <p className="text-[14px] font-semibold text-[var(--gbp-text2)]">{lang === "es" ? "Escribí una frase. Obtené un borrador listo para publicar." : "Write one sentence. Get a publish-ready draft."}</p>
                      </div>
                      <div className="overflow-hidden rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-bg2)]">
                        <div className="flex items-center gap-1.5 border-b border-[var(--gbp-border)] bg-[var(--gbp-surface2)] px-3 py-2">
                          <span className="h-[7px] w-[7px] rounded-full bg-rose-500" />
                          <span className="h-[7px] w-[7px] rounded-full bg-amber-400" />
                          <span className="h-[7px] w-[7px] rounded-full bg-emerald-500" />
                          <span className="ml-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--gbp-muted)]">New Announcement · AI Assistant</span>
                        </div>
                        <div className="flex flex-col gap-2.5 p-3.5">
                          <div className="flex items-start gap-2">
                            <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full border border-[var(--gbp-accent)]/20 bg-[var(--gbp-accent-glow)] text-[9px] font-black text-[var(--gbp-accent)]">MA</span>
                            <div className="max-w-[88%] rounded-[9px_9px_9px_2px] border border-[var(--gbp-accent)]/12 bg-[var(--gbp-accent-glow)] px-3 py-2 text-[12px] leading-[1.55] text-[var(--gbp-text)]">
                              {lang === "es" ? '"Crear un aviso urgente para todo el personal de cocina sobre el nuevo protocolo de seguridad alimentaria que empieza el lunes."' : '"Create an urgent notice for all kitchen staff about the new food safety protocol starting Monday."'}
                            </div>
                          </div>
                          <div className="flex flex-row-reverse items-start gap-2">
                            <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full border border-[var(--gbp-violet)]/20 bg-[var(--gbp-violet-soft)] text-[9px] font-black text-[var(--gbp-violet)]">AI</span>
                            <div className="max-w-[88%] rounded-[9px_9px_2px_9px] border border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-3 py-2 text-[12px] leading-[1.55] text-[var(--gbp-text2)]">
                              <strong className="mb-1 block font-bold text-[var(--gbp-text)]">
                                🔴 {lang === "es" ? "Urgente — Actualización Protocolo Seguridad Alimentaria" : "Urgent — Food Safety Protocol Update"}
                              </strong>
                              {lang === "es"
                                ? "A partir de este lunes, todo el personal de cocina debe seguir el procedimiento actualizado de registro de temperatura en cada turno. Revisen el nuevo SOP en Archivos antes de su próximo turno."
                                : "Effective this Monday, all kitchen staff must follow the updated temperature logging procedure every shift. Review the new SOP in Files before your next shift."}
                              <div className="mt-2 flex flex-wrap gap-1">
                                {["All Locations", "BOH Staff", "Urgent"].map((t) => (
                                  <span key={t} className="rounded-full border border-[var(--gbp-violet)]/20 bg-[var(--gbp-violet-soft)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--gbp-violet)]">{t}</span>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {aiTab === "know" && (
                    <motion.div key="know" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.22 }}>
                      <div className="mb-3 flex items-center gap-2">
                        <span className="inline-flex rounded-full border border-[var(--gbp-violet)]/20 bg-[var(--gbp-violet-soft)] px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--gbp-violet)]">Growth Plan</span>
                        <p className="text-[14px] font-semibold text-[var(--gbp-text2)]">{lang === "es" ? "Detectá problemas antes de que tu manager lo haga." : "Surface problems before your manager does."}</p>
                      </div>
                      <div className="overflow-hidden rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-bg2)]">
                        <div className="flex items-center gap-1.5 border-b border-[var(--gbp-border)] bg-[var(--gbp-surface2)] px-3 py-2">
                          <span className="h-[7px] w-[7px] rounded-full bg-rose-500" />
                          <span className="h-[7px] w-[7px] rounded-full bg-amber-400" />
                          <span className="h-[7px] w-[7px] rounded-full bg-emerald-500" />
                          <span className="ml-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--gbp-muted)]">Proactive Alerts · This Week</span>
                        </div>
                        {[
                          {
                            icon: "⚠",
                            colorClass: "border-[var(--gbp-accent)]/20 bg-[var(--gbp-accent-glow)]",
                            title: lang === "es" ? "3 contratos vencen en 5 días" : "3 contracts expiring in 5 days",
                            sub: "Carlos M. · Long Beach · Laura R. · Biloxi · Miguel T. · Saucier",
                            badge: lang === "es" ? "Acción Requerida" : "Action Needed",
                            badgeClass: "bg-[var(--gbp-accent-glow)] text-[var(--gbp-accent)]",
                          },
                          {
                            icon: "↻",
                            colorClass: "border-amber-500/20 bg-amber-500/10",
                            title: lang === "es" ? "Checklist de apertura fallando 3× esta semana" : "Opening checklist failing 3× this week",
                            sub: lang === "es" ? "Long Beach · Revisión de equipos omitida desde el martes" : "Long Beach · Equipment Review missed every day since Tuesday",
                            badge: lang === "es" ? "Patrón" : "Pattern",
                            badgeClass: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
                          },
                          {
                            icon: "✓",
                            colorClass: "border-emerald-500/20 bg-emerald-500/10",
                            title: lang === "es" ? "Biloxi — checklists al 100% esta semana" : "Biloxi — all checklists 100% this week",
                            sub: lang === "es" ? "Racha de 7 días · Mejor cumplimiento de todas las locaciones" : "7-day streak · Best compliance across all locations",
                            badge: lang === "es" ? "En Camino" : "On Track",
                            badgeClass: "bg-emerald-500/10 text-emerald-600",
                          },
                        ].map(({ icon, colorClass, title, sub, badge, badgeClass }) => (
                          <div key={title} className="flex items-start gap-2.5 border-b border-[var(--gbp-border)] p-2.5 last:border-b-0">
                            <div className={`flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[7px] border text-[13px] ${colorClass}`}>{icon}</div>
                            <div className="flex-1">
                              <p className="text-[12px] font-bold text-[var(--gbp-text)]">{title}</p>
                              <p className="mt-0.5 text-[11px] text-[var(--gbp-muted)]">{sub}</p>
                            </div>
                            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] ${badgeClass}`}>{badge}</span>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}

                  {aiTab === "ask" && (
                    <motion.div key="ask" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.22 }}>
                      <div className="mb-3 flex items-center gap-2">
                        <span className="inline-flex rounded-full border border-[var(--gbp-violet)]/20 bg-[var(--gbp-violet-soft)] px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--gbp-violet)]">Pro Plan</span>
                        <p className="text-[14px] font-semibold text-[var(--gbp-text2)]">{lang === "es" ? "Tus datos en español o inglés — tú decidís." : "Your data in plain English or Spanish — tú decides."}</p>
                      </div>
                      <div className="overflow-hidden rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-bg2)]">
                        <div className="flex items-center gap-1.5 border-b border-[var(--gbp-border)] bg-[var(--gbp-surface2)] px-3 py-2">
                          <span className="h-[7px] w-[7px] rounded-full bg-rose-500" />
                          <span className="h-[7px] w-[7px] rounded-full bg-amber-400" />
                          <span className="h-[7px] w-[7px] rounded-full bg-emerald-500" />
                          <span className="ml-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--gbp-muted)]">Operations Query · AI Assistant</span>
                        </div>
                        <div className="p-3.5">
                          <div className="mb-3.5 flex items-center gap-2 rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-3 py-2.5">
                            <span className="text-[15px] font-black text-[var(--gbp-violet)]">›</span>
                            <span className="text-[12px] italic text-[var(--gbp-text2)]">
                              {lang === "es" ? '"¿Cuál locación tuvo más incidentes abiertos el mes pasado?"' : '"Which location had the most open incidents last month?"'}
                            </span>
                          </div>
                          <p className="mb-2.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--gbp-muted)]">Results — Last 30 Days</p>
                          <div className="grid grid-cols-3 gap-2">
                            {[
                              { label: "Long Beach", val: "7", sub: lang === "es" ? "incidentes" : "incidents", valClass: "text-[var(--gbp-accent)]" },
                              { label: "Biloxi", val: "3", sub: lang === "es" ? "incidentes" : "incidents", valClass: "text-[var(--gbp-text)]" },
                              { label: "Saucier", val: "1", sub: lang === "es" ? "incidentes" : "incidents", valClass: "text-emerald-500" },
                            ].map(({ label, val, sub, valClass }) => (
                              <div key={label} className="rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-2.5">
                                <p className={`text-[15px] font-black ${valClass}`}>{val}</p>
                                <p className="text-[11px] font-semibold text-[var(--gbp-text)]">{label}</p>
                                <p className="text-[10px] text-[var(--gbp-muted)]">{sub}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ═══ TAGLINE BREAK ═══ */}
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

        {/* ═══ TESTIMONIAL ═══ */}
        <section className="border-y border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-6 py-24 md:py-28">
          <div className="mx-auto grid max-w-[980px] gap-12 md:grid-cols-[150px_1fr] md:items-center">
            <div className="rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-bg)] p-[24px_20px] text-center">
              <p className="text-[52px] font-extrabold leading-none text-[var(--gbp-accent)]">7</p>
              <p className="mt-2 whitespace-pre-line text-[11px] font-bold uppercase leading-[1.5] tracking-[0.08em] text-[var(--gbp-muted)]">
                {lang === "es" ? "Restaurantes\nLocaciones\n2 Estados" : "Restaurant\nLocations\n2 States"}
              </p>
              <p className="mt-2.5 text-[18px]">⭐⭐⭐⭐⭐</p>
            </div>
            <div>
              <span className="block text-[clamp(42px,4vw,56px)] font-black leading-none text-[var(--gbp-accent)] opacity-30">&quot;</span>
              <p className="text-[17px] leading-[1.8] text-[var(--gbp-text)]">
                {lang === "es"
                  ? "Llevamos GetBackplate a todo nuestro equipo directivo — dueños, administradores y managers en todas nuestras locaciones. Al final de la demo, todos en esa sala entendieron exactamente cuánto tiempo, dinero y caos habíamos estado dejando sobre la mesa. Esto es lo que nos faltaba."
                  : "We brought GetBackplate to our entire leadership team — owners, administrators, and managers across all our locations. By the end of the demo, everyone in that room understood exactly how much time, money, and chaos we've been leaving on the table. This is what we've been missing."}
              </p>
              <div className="mt-6 flex items-center gap-4">
                <div className="h-px w-10 bg-[var(--gbp-border2)]" />
                <div>
                  <p className="text-[14px] font-bold text-[var(--gbp-text)]">{lang === "es" ? "Dueño de Restaurante" : "Restaurant Owner"}</p>
                  <p className="text-[12px] text-[var(--gbp-muted)]">{lang === "es" ? "Grupo Multi-Locación · 7 Locaciones · 2 Estados" : "Multi-Location Group · 7 Locations · 2 States"}</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ═══ FIRST TABLE PROGRAM ═══ */}
        <section className={`relative overflow-hidden px-6 py-24 md:py-28 ${darkMode ? "border-t border-[var(--gbp-border)] bg-[var(--gbp-bg)]" : "bg-[var(--gbp-text)]"}`} id="first-table">
          <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(ellipse 60% 80% at 70% 50%, rgba(212,83,26,0.08) 0%, transparent 60%)" }} />
          <div className="relative z-10 mx-auto grid max-w-[1200px] gap-[60px] md:grid-cols-2 md:items-start md:gap-[80px]">
            {/* LEFT */}
            <div>
              <p className={`text-[11px] font-bold uppercase tracking-[0.12em] ${darkMode ? "text-[var(--gbp-muted)]" : "text-white/50"}`}>
                {lang === "es" ? "Programa First Table" : "First Table Program"}
              </p>
              <h2 className={`mt-3.5 text-[clamp(34px,4.5vw,56px)] font-bold leading-[1.0] tracking-[-0.03em] ${darkMode ? "text-[var(--gbp-text)]" : "text-white"}`}>
                {lang === "es" ? (
                  <>La Primera Mesa<br />está reservada para<br />los correctos <em className="not-italic text-[var(--gbp-accent)]">pocos.</em></>
                ) : (
                  <>The First Table<br />is reserved for<br />the right <em className="not-italic text-[var(--gbp-accent)]">few.</em></>
                )}
              </h2>
              <p className={`mb-9 mt-[18px] text-[15px] leading-[1.8] ${darkMode ? "text-[var(--gbp-text2)]" : "text-white/55"}`}>
                {lang === "es"
                  ? "No estamos abriendo GetBackplate a todos en el lanzamiento. Lo abrimos a un grupo selecto de restaurantes serios en sus operaciones. Los miembros del First Table obtienen más que acceso anticipado — obtienen un lugar en la mesa donde se construye la plataforma."
                  : "We're not opening GetBackplate to everyone at launch. We're opening it to a select group of restaurants that are serious about their operations. First Table Members get more than early access — they get a seat at the table where the platform gets built."}
              </p>
              <div className="flex flex-col gap-[18px]">
                {[
                  { icon: "🔒", title: lang === "es" ? "Precio Bloqueado — Para Siempre" : "Locked-In Pricing — Forever", desc: lang === "es" ? "La tarifa con la que entrás es la que conservás. Sin aumentos de precio. Nunca." : "The rate you join at is the rate you keep. No price increases. Ever." },
                  { icon: "⚡", title: lang === "es" ? "Acceso Prioritario Antes del Lanzamiento Público" : "Priority Access Before Public Launch", desc: lang === "es" ? "Los miembros del First Table salen en vivo antes que todos. Sin lista de espera." : "First Table Members go live before anyone else. No waiting in line." },
                  { icon: "🤝", title: lang === "es" ? "Línea Directa con el Equipo" : "Direct Line to the Team", desc: lang === "es" ? "Una persona real. No un ticket. Tu feedback moldea lo que se construye después." : "A real person. Not a ticket. Your feedback shapes what gets built next." },
                  { icon: "🏆", title: lang === "es" ? "Insignia de Miembro First Table" : "First Table Member Badge", desc: lang === "es" ? "Permanentemente en tu cuenta. Llegaste primero — y se nota." : "Permanently on your account. You were here first — and it shows." },
                ].map(({ icon, title, desc }) => (
                  <div key={title} className="flex items-start gap-[13px]">
                    <div className={`flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[9px] text-[15px] ${darkMode ? "bg-[var(--gbp-surface2)]" : "bg-white/[0.08]"}`}>{icon}</div>
                    <div>
                      <p className={`text-[14px] font-bold ${darkMode ? "text-[var(--gbp-text)]" : "text-white"}`}>{title}</p>
                      <p className={`mt-0.5 text-[12px] leading-[1.6] ${darkMode ? "text-[var(--gbp-text2)]" : "text-white/45"}`}>{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {/* RIGHT: box */}
            <div className="overflow-hidden rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] shadow-[0_8px_40px_rgba(0,0,0,0.18)]">
              <div className="border-b border-[var(--gbp-border)] p-7">
                <p className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--gbp-muted)]">
                  {lang === "es" ? "Asientos Disponibles" : "Seats Remaining"}
                </p>
                <p className="mb-[11px] text-[30px] font-extrabold leading-none text-[var(--gbp-text)]">
                  <span className="text-[var(--gbp-accent)]">62</span> of 100 left
                </p>
                <div className="mb-[9px] h-[6px] overflow-hidden rounded-full bg-[var(--gbp-border)]">
                  <div className="h-full w-[38%] rounded-full" style={{ background: "linear-gradient(90deg, var(--gbp-accent), var(--gbp-violet))" }} />
                </div>
                <p className="text-[12px] text-[var(--gbp-muted)]">
                  {lang === "es" ? "38 asientos ya reservados · El soft launch cierra al llenarse" : "38 seats already reserved · Soft launch closes when full"}
                </p>
              </div>
              <div className="p-7">
                <Link
                  href="/auth/register"
                  className="block w-full rounded-lg bg-[var(--gbp-accent)] py-[15px] text-center text-[15px] font-bold text-white transition-opacity hover:opacity-85"
                >
                  {lang === "es" ? "Solicitar Mi Asiento →" : "Request My Seat →"}
                </Link>
                <p className="mt-3 text-center text-[11px] text-[var(--gbp-muted)]">
                  {lang === "es" ? "Solo por invitación · Una persona real te contactará dentro de 24h." : "By invitation only · A real person will reach out within 24h."}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ═══ PRICING ═══ */}
        <section className="px-6 py-24 md:py-28" id="pricing">
          <div className="mx-auto max-w-[1240px]">
            <div className="text-center">
              <span className="inline-flex rounded-full border border-[var(--gbp-violet)]/35 bg-[var(--gbp-violet-soft)] px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[var(--gbp-violet)]">
                {lang === "es" ? "Precios" : "Pricing"}
              </span>
              <h2 className="text-[clamp(34px,4vw,52px)] font-bold tracking-tight text-[var(--gbp-text)]">{copy.sections.pricingTitle}</h2>
              <p className="mx-auto mt-3 max-w-3xl text-sm leading-7 text-[var(--gbp-text2)]">{copy.sections.pricingSub}</p>
            </div>

            <div className="mt-7 flex items-center justify-center gap-3">
              <button type="button" onClick={() => setBillingMode("monthly")} className={`text-sm font-semibold ${billingMode === "monthly" ? "text-[var(--gbp-text)]" : "text-[var(--gbp-muted)]"}`}>{lang === "es" ? "Mensual" : "Monthly"}</button>
              <button
                type="button"
                onClick={() => setBillingMode((v) => (v === "monthly" ? "annual" : "monthly"))}
                className={`relative inline-flex h-7 w-12 items-center rounded-full p-0.5 transition-colors focus-visible:outline-none ${billingMode === "annual" ? "bg-[var(--gbp-violet)]" : "bg-[var(--gbp-border2)]"}`}
                aria-label={lang === "es" ? "Alternar facturación" : "Toggle billing cycle"}
              >
                <span className={`h-6 w-6 rounded-full bg-white shadow-sm transition-transform ${billingMode === "annual" ? "translate-x-[20px]" : "translate-x-0"}`} />
              </button>
              <button type="button" onClick={() => setBillingMode("annual")} className={`text-sm font-semibold ${billingMode === "annual" ? "text-[var(--gbp-text)]" : "text-[var(--gbp-muted)]"}`}>{lang === "es" ? "Anual" : "Annual"}</button>
              <span className={`ml-1 rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] transition-all ${billingMode === "annual" ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-400" : "border-transparent text-[var(--gbp-muted)]"}`}>
                {lang === "es" ? "2 meses gratis" : "2 months free"}
              </span>
            </div>

            <div className="mt-8 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {planCards.map((plan, idx) => {
                const isEnterprise = !!plan.is_enterprise;
                const featured = !isEnterprise && (plan.tier === "growth" || plan.tier === "pro" || !!plan.is_featured);
                return (
                  <motion.article
                    key={plan.id}
                    initial={{ opacity: 0, y: 18 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.45, ease: "easeOut", delay: idx * 0.08 }}
                    viewport={{ once: true, amount: 0.25 }}
                    whileHover={{ y: -4 }}
                    className={`relative rounded-xl border p-5 bg-[var(--gbp-surface)] transition-shadow ${
                      isEnterprise
                        ? "border-dashed border-[var(--gbp-border)]"
                        : featured
                        ? "border-[var(--gbp-violet)] shadow-[0_0_0_1px_var(--gbp-violet),0_18px_50px_rgba(108,71,255,0.18)]"
                        : "border-[var(--gbp-border)]"
                    }`}
                  >
                    {featured && (
                      <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[var(--gbp-violet)] px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-white">
                        {lang === "es" ? "Más popular" : "Most popular"}
                      </span>
                    )}
                    <p className="text-xs font-black uppercase tracking-[0.1em] text-[var(--gbp-muted)]">{plan.name}</p>
                    {isEnterprise ? (
                      <>
                        <p className="mt-3 text-5xl font-extrabold tracking-tight text-[var(--gbp-text)]">Custom</p>
                        <p className="mt-1 text-xs text-[var(--gbp-muted)]">
                          {lang === "es" ? "a medida para tu operación" : "tailored to your operation"}
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="mt-3 text-5xl font-extrabold tracking-tight text-[var(--gbp-text)]">
                          {billingMode === "annual" ? formatPrice(plan.annualBilled) : formatPrice(plan.monthly)}
                        </p>
                        <p className="mt-1 text-xs text-[var(--gbp-muted)]">
                          {billingMode === "annual"
                            ? plan.annualBilled && plan.annualPerMonth
                              ? lang === "es" ? `por año, equivale a ${formatPrice(plan.annualPerMonth)}/mes` : `per year, equals ${formatPrice(plan.annualPerMonth)}/mo`
                              : lang === "es" ? "anual" : "annual"
                            : lang === "es" ? "por mes" : "per month"}
                        </p>
                      </>
                    )}
                    {isEnterprise ? (
                      <button
                        type="button"
                        onClick={() => {
                          const email = plan.cta_email ?? "";
                          if (email) window.location.href = `mailto:${email}?subject=GetBackplate - ${plan.name}`;
                        }}
                        className="mt-4 w-full rounded-md px-3 py-2 text-sm font-bold transition-colors bg-[var(--gbp-accent)] text-white hover:bg-[var(--gbp-accent-hover)]"
                      >
                        {plan.cta_text ?? (lang === "es" ? "Contactar ventas →" : "Talk to Sales →")}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => startCheckout(plan.id)}
                        disabled={loadingPlanId === plan.id}
                        className={`mt-4 w-full rounded-md px-3 py-2 text-sm font-bold transition-colors ${featured ? "bg-[var(--gbp-violet)] text-white hover:bg-[var(--gbp-violet-hover)]" : "bg-[var(--gbp-accent)] text-white hover:bg-[var(--gbp-accent-hover)]"}`}
                      >
                        {loadingPlanId === plan.id ? "..." : lang === "es" ? "Comenzar trial 30 días" : "Start 30-day trial"}
                      </button>
                    )}
                    <ul className="mt-4 space-y-2">
                      {plan.features
                        .filter((feature) => !feature.annual_only || billingMode === "annual")
                        .map((feature) => (
                          <li key={`${plan.id}-${feature.text}`} className={`text-xs ${feature.highlight ? "font-semibold text-[var(--gbp-text)]" : "text-[var(--gbp-text2)]"}`}>
                            {feature.everything ? "✦ " : "✓ "}{feature.text}
                          </li>
                        ))}
                    </ul>
                  </motion.article>
                );
              })}
            </div>
            <p className="mt-6 rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-4 py-3 text-center text-xs text-[var(--gbp-text2)]">
              <strong className="text-[var(--gbp-text)]">{lang === "es" ? "Facturación anual" : "Annual billing"}:</strong>{" "}
              {lang === "es" ? "equivale a 10 meses cobrados por año (2 meses bonificados)." : "equals 10 charged months per year (2 months free)."}
            </p>
          </div>
        </section>

        {/* ═══ INTEGRATIONS ═══ */}
        <section className="border-t border-[var(--gbp-border)] px-6 py-24 md:py-28" id="integrations">
          <div className="mx-auto max-w-[1240px]">
            <div className="grid gap-[72px] md:grid-cols-[360px_1fr] md:items-start">

              {/* Left sticky */}
              <div className="md:sticky md:top-[84px]">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--gbp-accent)] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.1em] text-white">
                  {lang === "es" ? "Integraciones" : "Integrations"}
                </span>
                <h2 className="mt-3.5 text-[clamp(34px,4vw,52px)] font-bold leading-[1.05] tracking-[-0.03em] text-[var(--gbp-text)]">
                  {lang === "es" ? (
                    <>QuickBooks Online no habla<br />con Restaurant365.<br /><span className="text-[var(--gbp-accent)]">Lo resolvimos.</span></>
                  ) : (
                    <>QuickBooks Online doesn&apos;t<br />talk to Restaurant365.<br /><span className="text-[var(--gbp-accent)]">We fixed that.</span></>
                  )}
                </h2>
                <p className="mt-7 text-[15px] leading-[1.8] text-[var(--gbp-text2)]">
                  {lang === "es"
                    ? "La única integración nativa entre QuickBooks Online y Restaurant365. Enviá facturas directamente a R365 — automáticamente, en tiempo real. Sin exportaciones. Sin cadenas de correos. Sin entrada manual."
                    : "The only native integration between QuickBooks Online and Restaurant365. Send invoices directly into R365 — automatically, in real time. No exports. No email chains. No manual entry."}
                </p>
                <div
                  className="mt-7 inline-flex items-center gap-2 rounded-xl border border-[var(--gbp-accent)]/20 px-4 py-2.5 text-[12px] font-bold whitespace-nowrap"
                  style={{ background: "linear-gradient(135deg, rgba(212,83,26,0.1), rgba(212,83,26,0.03))" }}
                >
                  <span className="text-[var(--gbp-accent)]">⚡</span>
                  <span className="text-[var(--gbp-accent)]">Standalone</span>
                  <span className="text-[var(--gbp-text2)]">— {lang === "es" ? "no requiere suscripción a GetBackplate" : "no GetBackplate subscription required"}</span>
                </div>
              </div>

              {/* Right tabs */}
              <div>
                <div className="flex gap-px overflow-hidden rounded-t-xl border border-[var(--gbp-border)] bg-[var(--gbp-border)]">
                  {(["send", "receive"] as const).map((tab) => {
                    const labels = {
                      send: { verb: lang === "es" ? "Envío facturas." : "I send invoices.", desc: lang === "es" ? "Proveedores y Distribuidores" : "Vendors & Distributors" },
                      receive: { verb: lang === "es" ? "Recibo facturas." : "I receive invoices.", desc: lang === "es" ? "Grupos de Restaurantes" : "Restaurant Groups" },
                    };
                    return (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setIntTab(tab)}
                        className={`flex-1 border-b-2 px-[22px] py-[18px] text-left transition-colors ${intTab === tab ? "border-[var(--gbp-accent)] bg-[var(--gbp-surface)]" : "border-transparent bg-[var(--gbp-surface2)] hover:bg-[var(--gbp-bg2)]"}`}
                      >
                        <p className={`text-[17px] font-black leading-none tracking-[-0.02em] ${intTab === tab ? "text-[var(--gbp-accent)]" : "text-[var(--gbp-text)]"}`}>{labels[tab].verb}</p>
                        <p className="mt-1 text-[12px] leading-[1.4] text-[var(--gbp-text2)]">{labels[tab].desc}</p>
                      </button>
                    );
                  })}
                </div>

                <div className="rounded-b-xl border border-t-0 border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-[26px]">
                  {intTab === "send" && (
                    <motion.div key="send" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.22 }}>
                      <div className="mb-3 flex items-center gap-2">
                        <span className="inline-flex rounded-full bg-[var(--gbp-accent)] px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] text-white">QBO → R365</span>
                        <p className="text-[14px] font-semibold text-[var(--gbp-text2)]">
                          {lang === "es" ? "Tus clientes están en R365. Tus facturas también deberían estarlo." : "Your restaurant clients are on R365. Your invoices should be too."}
                        </p>
                      </div>
                      <div className="mt-3.5 overflow-hidden rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-bg2)]">
                        <div className="flex items-center gap-1.5 border-b border-[var(--gbp-border)] bg-[var(--gbp-surface2)] px-3 py-2">
                          <span className="h-[7px] w-[7px] rounded-full bg-rose-500" />
                          <span className="h-[7px] w-[7px] rounded-full bg-amber-400" />
                          <span className="h-[7px] w-[7px] rounded-full bg-emerald-500" />
                          <span className="ml-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--gbp-muted)]">QuickBooks Online · Invoice Sent</span>
                        </div>
                        <div>
                          {[
                            { inv: "INV-1084 · Taco Well", amt: "$4,218.00 · Just now" },
                            { inv: "INV-1083 · Taco Well", amt: "$1,875.50 · 2 hrs ago" },
                            { inv: "INV-1081 · Taco Well", amt: "$3,140.00 · Yesterday" },
                          ].map(({ inv, amt }) => (
                            <div key={inv} className="flex items-center justify-between gap-2 border-b border-[var(--gbp-border)] p-2.5 last:border-b-0">
                              <div>
                                <p className="text-[12px] font-bold text-[var(--gbp-text)]">{inv}</p>
                                <p className="mt-0.5 text-[11px] text-[var(--gbp-muted)]">{amt}</p>
                              </div>
                              <span className="shrink-0 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] text-emerald-600">Sent</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="mt-5 flex flex-wrap items-center justify-between gap-3.5 border-t border-[var(--gbp-border)] pt-[18px]">
                        <div>
                          <p className="text-[26px] font-extrabold leading-none tracking-[-0.04em] text-[var(--gbp-text)]">{formatPrice(integrationPricingSummary.cheapestPlan)}<span className="text-[12px] font-semibold text-[var(--gbp-muted)]">/mo</span></p>
                          <p className="mt-0.5 text-[11px] text-[var(--gbp-muted)]">{lang === "es" ? `${integrationPricingSummary.totalPlans} planes para elegir` : `${integrationPricingSummary.totalPlans} plans to choose from`}</p>
                        </div>
                        <a href="/integrations/qbo-r365" className="rounded-lg bg-[var(--gbp-accent)] px-[22px] py-[11px] text-[13px] font-bold text-white transition-opacity hover:opacity-85">
                          {lang === "es" ? "Comenzar a Enviar →" : "Start Sending →"}
                        </a>
                      </div>
                    </motion.div>
                  )}
                  {intTab === "receive" && (
                    <motion.div key="receive" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.22 }}>
                      <div className="mb-3 flex items-center gap-2">
                        <span className="inline-flex rounded-full bg-[var(--gbp-accent)] px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] text-white">QBO → R365</span>
                        <p className="text-[14px] font-semibold text-[var(--gbp-text2)]">
                          {lang === "es" ? "Tus proveedores están en QBO. Sus facturas deben llegar a R365 — no a tu bandeja." : "Your vendors are on QBO. Their invoices should land in R365 — not your inbox."}
                        </p>
                      </div>
                      <div className="mt-3.5 overflow-hidden rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-bg2)]">
                        <div className="flex items-center gap-1.5 border-b border-[var(--gbp-border)] bg-[var(--gbp-surface2)] px-3 py-2">
                          <span className="h-[7px] w-[7px] rounded-full bg-rose-500" />
                          <span className="h-[7px] w-[7px] rounded-full bg-amber-400" />
                          <span className="h-[7px] w-[7px] rounded-full bg-emerald-500" />
                          <span className="ml-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--gbp-muted)]">Restaurant365 · New Invoice Received</span>
                        </div>
                        <div>
                          {[
                            { inv: "US Disposables · INV-1084", amt: "$4,218.00 · Just now" },
                            { inv: "US Disposables · INV-1083", amt: "$1,875.50 · 2 hrs ago" },
                            { inv: "US Disposables · INV-1081", amt: "$3,140.00 · Yesterday" },
                          ].map(({ inv, amt }) => (
                            <div key={inv} className="flex items-center justify-between gap-2 border-b border-[var(--gbp-border)] p-2.5 last:border-b-0">
                              <div>
                                <p className="text-[12px] font-bold text-[var(--gbp-text)]">{inv}</p>
                                <p className="mt-0.5 text-[11px] text-[var(--gbp-muted)]">{amt}</p>
                              </div>
                              <span className="shrink-0 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] text-emerald-600">Received</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="mt-5 flex flex-wrap items-center justify-between gap-3.5 border-t border-[var(--gbp-border)] pt-[18px]">
                        <div>
                          <p className="text-[26px] font-extrabold leading-none tracking-[-0.04em] text-[var(--gbp-text)]">{formatPrice(integrationPricingSummary.cheapestPlan)}<span className="text-[12px] font-semibold text-[var(--gbp-muted)]">/mo</span></p>
                          <p className="mt-0.5 text-[11px] text-[var(--gbp-muted)]">{lang === "es" ? `${integrationPricingSummary.totalPlans} planes para elegir` : `${integrationPricingSummary.totalPlans} plans to choose from`}</p>
                        </div>
                        <a href="/integrations/qbo-r365" className="rounded-lg bg-[var(--gbp-accent)] px-[22px] py-[11px] text-[13px] font-bold text-white transition-opacity hover:opacity-85">
                          {lang === "es" ? "Comenzar a Recibir →" : "Start Receiving →"}
                        </a>
                      </div>
                    </motion.div>
                  )}
                </div>
              </div>

            </div>
          </div>
        </section>

        {/* ═══ FAQ ═══ */}
        <section className="border-t border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-6 py-24 md:py-28" id="faq">
          <div className="mx-auto max-w-[1000px]">
            <div className="mb-[60px] text-center">
              <span className="inline-flex rounded-full border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[var(--gbp-muted)]">FAQ</span>
              <h2 className="text-[clamp(34px,4vw,52px)] font-bold tracking-[-0.03em] text-[var(--gbp-text)]">{copy.sections.faqTitle}</h2>
            </div>
            <div className="grid gap-x-[60px] md:grid-cols-2">
              {faqs.map(([q, a], idx) => {
                const open = faqOpen === idx;
                return (
                  <motion.div
                    key={q}
                    initial={{ opacity: 0, y: 10 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, ease: "easeOut", delay: idx * 0.04 }}
                    viewport={{ once: true, amount: 0.3 }}
                    className="border-b border-[var(--gbp-border)]"
                  >
                    <button
                      type="button"
                      onClick={() => setFaqOpen(open ? null : idx)}
                      className={`flex w-full items-center justify-between gap-4 py-[22px] text-left text-[15px] font-bold transition-colors hover:text-[var(--gbp-accent)] ${open ? "text-[var(--gbp-accent)]" : "text-[var(--gbp-text)]"}`}
                    >
                      <span>{q}</span>
                      <span className={`text-[20px] font-light leading-none text-[var(--gbp-muted)] transition-all ${open ? "rotate-45 text-[var(--gbp-accent)]" : ""}`}>+</span>
                    </button>
                    {open && (
                      <p className="pb-[22px] text-[14px] leading-[1.8] text-[var(--gbp-text2)]">{a}</p>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ═══ VALUES ═══ */}
        <section className="border-t border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-6 py-24 md:py-28">
          <div className="mx-auto max-w-[1240px]">
            <div className="mb-[60px] grid gap-[60px] md:grid-cols-2 md:items-start">
              <div>
                <span className="mb-5 inline-flex rounded-full border border-[var(--gbp-border2)] bg-[var(--gbp-bg)] px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[var(--gbp-muted)]">
                  {lang === "es" ? "Por qué existimos" : "Why We Exist"}
                </span>
                <h2 className="mt-4 text-[clamp(34px,4vw,52px)] font-bold tracking-tight text-[var(--gbp-text)]">
                  {lang === "es"
                    ? <>Porque los restaurantes merecen un solo lugar donde <span className="grad-orange">todo funciona junto.</span></>
                    : <>Because restaurants deserve one place where <span className="grad-orange">everything works together.</span></>}
                </h2>
              </div>
              <p className="text-sm leading-8 text-[var(--gbp-text2)]">
                {lang === "es"
                  ? "La industria restaurantera funciona con pasión, esfuerzo y personas — pero siempre le han faltado las herramientas para estar a la altura de esa energía. GetBackplate existe porque ninguna plataforma ha entendido verdaderamente lo que se siente trabajar en cada rol de un restaurante y aún así no tener un sistema que lo una todo."
                  : "The restaurant industry runs on passion, hustle, and people — but it has always lacked the tools to match that energy. GetBackplate exists because no platform has ever truly understood what it feels like to work every role in a restaurant and still not have a system that brings it all together."}
              </p>
            </div>
            <div className="grid gap-px overflow-hidden rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-border)] md:grid-cols-2 lg:grid-cols-4">
              {valueCards.map(([title, body], idx) => (
                <motion.article
                  key={title}
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, ease: "easeOut", delay: idx * 0.06 }}
                  viewport={{ once: true, amount: 0.2 }}
                  className="group bg-[var(--gbp-surface)] p-[34px_26px] transition-colors hover:bg-[var(--gbp-surface2)]"
                >
                  <h3 className="text-[21px] font-extrabold tracking-[-0.02em] text-[var(--gbp-text)] transition-colors group-hover:text-[var(--gbp-accent)]">{title}</h3>
                  <p className="mt-3 text-[13px] leading-[1.75] text-[var(--gbp-text2)]">{body}</p>
                </motion.article>
              ))}
            </div>
          </div>
        </section>

      </main>

      {/* ═══ FOOTER ═══ */}
      <footer className={`px-6 py-10 text-white ${darkMode ? "bg-[var(--gbp-bg2)]" : "bg-[var(--gbp-text)]"}`}>
        <div className="mx-auto grid max-w-[1200px] gap-3 md:grid-cols-3 md:items-center">
          <p className="inline-flex items-center">
            <Image src="/getbackplate-logo-footer.svg" alt="GetBackplate" width={160} height={22} className="h-[22px] w-auto" />
          </p>
          <p className="text-center text-xs italic text-white/60">
            {lang === "es" ? "Opera tu restaurante. No solo tu caja." : "Run your restaurant. Not just your register."}
          </p>
          <p className="text-right text-[11px] text-white/50">
            © 2026 GetBackplate. All rights reserved.<br />
            Site by <a href="https://marketingsolutions.com" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 opacity-70 hover:opacity-100">Marketing Solutions</a>
            {" · "}
            <a href="/legal/" className="underline underline-offset-2 opacity-70 hover:opacity-100">Legal</a>
          </p>
        </div>
      </footer>

      <style jsx>{`
        .hero-title {
          font-size: clamp(44px, 6.6vw, 78px);
        }

        .hero-badge-dot {
          animation: badgePulse 2s ease infinite;
        }
        @keyframes badgePulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.8); }
        }

        .scroll-hint-line {
          width: 1px;
          height: 36px;
          background: linear-gradient(to bottom, var(--gbp-muted), transparent);
          animation: shPulse 1.8s ease-in-out infinite;
        }
        @keyframes shPulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }

        .marquee-inner {
          animation: marqueeScroll 26s linear infinite;
        }
        .marquee-inner:hover {
          animation-play-state: paused;
        }
        @keyframes marqueeScroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }

        .tagline-break {
          background: linear-gradient(135deg, var(--gbp-violet) 0%, #9b82ff 50%, var(--gbp-accent) 100%);
          background-size: 220% 220%;
          padding: 76px 0;
          text-align: center;
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
        @keyframes iridescentShift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
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

        @media (prefers-reduced-motion: reduce) {
          .float-badge-1,
          .float-badge-2,
          .tagline-break,
          .marquee-inner,
          .scroll-hint-line,
          .hero-badge-dot {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );
}
