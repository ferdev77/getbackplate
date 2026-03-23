"use client";

import Link from "next/link";
import Image from "next/image";
import { MoveRight, CheckCircle2, Menu, X, Users, FileText, Bell } from "lucide-react";
import { useState } from "react";
import { FadeIn, SlideUp, AnimatedList, AnimatedItem, AnimatedButton, Interactive } from "@/shared/ui/animations";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";

export function LandingNavbar() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <nav className="fixed top-0 z-50 w-full border-b border-line/40 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-2 group">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand text-white shadow-lg shadow-brand/20 transition-transform group-hover:scale-105">
            <span className="text-xl font-bold italic">B</span>
          </div>
          <span className="text-xl font-bold tracking-tight text-foreground">GetBackplate</span>
        </Link>
        
        <div className="hidden md:flex items-center gap-8">
          <Link href="#features" className="text-sm font-medium text-muted-foreground hover:text-brand transition-colors">Funcionalidades</Link>
          <Link href="#pricing" className="text-sm font-medium text-muted-foreground hover:text-brand transition-colors">Planes</Link>
          <Link href="/auth/login">
            <AnimatedButton className="rounded-full bg-brand px-6 py-2.5 text-sm font-bold text-white shadow-md hover:bg-brand-dark">
              Ingresar
            </AnimatedButton>
          </Link>
        </div>

        <button className="md:hidden text-foreground" onClick={() => setIsOpen(!isOpen)}>
          {isOpen ? <X /> : <Menu />}
        </button>
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-full left-0 w-full border-b border-line bg-background p-6 md:hidden shadow-xl"
          >
            <div className="flex flex-col gap-4">
              <Link href="#features" onClick={() => setIsOpen(false)} className="text-lg font-medium">Funcionalidades</Link>
              <Link href="#pricing" onClick={() => setIsOpen(false)} className="text-lg font-medium">Planes</Link>
              <Link href="/auth/login" onClick={() => setIsOpen(false)} className="w-full text-center rounded-xl bg-brand py-3 font-bold text-white">
                Ingresar
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}

export function LandingHero() {
  return (
    <section className="relative overflow-hidden pt-32 pb-20 md:pt-48 md:pb-32">
      <div className="pointer-events-none absolute -top-24 -left-20 h-96 w-96 rounded-full bg-brand/5 blur-3xl" />
      <div className="pointer-events-none absolute top-1/2 -right-20 h-96 w-96 -translate-y-1/2 rounded-full bg-brand/5 blur-3xl" />
      
      <div className="mx-auto max-w-7xl px-6 text-center">
        <FadeIn>
          <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-brand/20 bg-brand/5 px-4 py-1.5 text-sm font-bold text-brand italic shadow-sm">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand opacity-75"></span>
              <span className="relative inline-flex h-2 w-2 rounded-full bg-brand"></span>
            </span>
            Operativa de Vanguardia
          </div>
        </FadeIn>
        
        <SlideUp delay={0.1}>
          <h1 className="mx-auto mb-8 max-w-4xl text-5xl font-extrabold tracking-tight text-foreground md:text-7xl leading-[1.1]">
            La infraestructura operativa para tu <span className="text-brand">restaurante</span>
          </h1>
        </SlideUp>
        
        <SlideUp delay={0.2}>
          <p className="mx-auto mb-10 max-w-2xl text-lg text-muted-foreground md:text-xl leading-relaxed">
            GetBackplate centraliza la gestión de empleados, documentos y procesos operativos en una plataforma premium diseñada para el sector gastronómico.
          </p>
        </SlideUp>

        <SlideUp delay={0.3}>
          <div className="flex flex-col items-center justify-center gap-8 sm:flex-row">
            <div className="relative w-full sm:w-auto">
              <AnimatedButton className="w-full sm:w-auto rounded-full bg-brand px-10 py-4 text-lg font-bold text-white shadow-xl shadow-brand/20 hover:bg-brand-dark transition-all">
                Contratar ahora
              </AnimatedButton>
              <span className="absolute -right-4 -top-3 flex h-auto items-center justify-center rounded-full bg-brand px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-white shadow-lg ring-2 ring-background animate-pulse">
                Próximamente
              </span>
            </div>
            
            <Interactive>
              <div className="relative">
                <Link href="/auth/login" className="flex items-center gap-2 text-lg font-bold text-foreground hover:text-brand transition-colors group">
                  Ver demo en vivo <MoveRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
                </Link>
                <span className="absolute -right-12 -top-6 block rounded-full border border-brand/20 bg-brand/5 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-brand backdrop-blur-sm">
                  Próximamente
                </span>
              </div>
            </Interactive>
          </div>
        </SlideUp>

        <SlideUp delay={0.5} className="mt-20">
          <div className="relative mx-auto max-w-5xl rounded-3xl border border-line bg-panel p-2 shadow-2xl">
            <div className="overflow-hidden rounded-2xl">
              <Image
                src="/dashboard-preview.png"
                alt="GetBackplate Dashboard Preview"
                width={1600}
                height={900}
                className="h-auto w-full opacity-90 transition-opacity hover:opacity-100"
                priority
              />
            </div>
            {/* Overlay indicators */}
            <div className="absolute -bottom-6 -right-6 hidden lg:block rounded-2xl bg-white p-6 shadow-xl border border-line">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-600">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-bold text-foreground">Sistema Configurado</p>
                  <p className="text-xs text-muted-foreground">Todo en orden hoy.</p>
                </div>
              </div>
            </div>
          </div>
        </SlideUp>
      </div>
    </section>
  );
}

const features = [
  {
    title: "Gestión de Empleados",
    description: "Organiza tu plantilla por sucursales, departamentos y rangos con total claridad.",
    icon: <Users className="h-6 w-6" />,
    color: "bg-blue-50 text-blue-600"
  },
  {
    title: "Documentación Digital",
    description: "Almacenamiento seguro de contratos, legajos y archivos operativos importantes.",
    icon: <FileText className="h-6 w-6" />,
    color: "bg-orange-50 text-orange-600"
  },
  {
    title: "Comunicación Instantánea",
    description: "Anuncios que llegan a todo el equipo al instante con confirmación de lectura.",
    icon: <Bell className="h-6 w-6" />,
    color: "bg-brand/10 text-brand"
  }
];

export function LandingFeatures() {
  return (
    <section id="features" className="bg-panel py-24 md:py-32">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mb-16 text-center">
          <FadeIn>
            <h2 className="mb-4 text-3xl font-bold tracking-tight text-foreground md:text-5xl">Todo lo que necesitas para escalar</h2>
            <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
              Hemos diseñado cada módulo pensando en la agilidad que requiere un restaurante moderno.
            </p>
          </FadeIn>
        </div>

        <AnimatedList className="grid gap-8 md:grid-cols-3">
          {features.map((feature, idx) => (
            <AnimatedItem key={idx}>
              <div className="group rounded-3xl border border-line bg-white p-8 transition-all hover:border-brand/30 hover:shadow-xl">
                <div className={`mb-6 inline-flex h-14 w-14 items-center justify-center rounded-2xl ${feature.color} shadow-sm group-hover:scale-110 transition-transform`}>
                  {feature.icon}
                </div>
                <h3 className="mb-3 text-xl font-bold text-foreground">{feature.title}</h3>
                <p className="text-muted-foreground leading-relaxed">{feature.description}</p>
              </div>
            </AnimatedItem>
          ))}
        </AnimatedList>
      </div>
    </section>
  );
}

type LandingPlan = {
  id: string;
  plan_id?: string;
  code?: string;
  name: string;
  price_amount?: number | null;
  currency_code?: string | null;
  billing_period?: string | null;
  description?: string | null;
  stripe_price_id?: string | null;
  max_branches?: number | null;
  max_users?: number | null;
  max_employees?: number | null;
  max_storage_mb?: number | null;
  modules_count?: number | null;
  [key: string]: unknown;
};

export function LandingPricing({ plans, highlightPlanId, compact }: { plans: LandingPlan[]; highlightPlanId?: string; compact?: boolean }) {
  const router = useRouter();
  const [loadingPriceId, setLoadingPriceId] = useState<string | null>(null);

  const handleCheckout = async (priceId: string, planId: string) => {
    if (!priceId) return;
    
    setLoadingPriceId(priceId);
    try {
      const response = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ priceId, planId }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        if (data.error === 'AuthRequired' || response.status === 401) {
           // Redirect to register, passing the plan info so we can auto-checkout after they register
           router.push(`/auth/register?priceId=${priceId}&planId=${planId}`);
           return;
        }
        throw new Error(data.message || data.error || "Error initiating checkout");
      }

      if (data.url) {
        window.location.href = data.url; // Redirects to Stripe Checkout Hosted Page
      } else {
        console.error("No checkout URL returned", data);
        alert(data.error || "Error initiating checkout");
      }
    } catch (error: unknown) {
      console.error("Checkout Request Failed", error);
      const message = error instanceof Error ? error.message : "Something went wrong";
      alert(message);
    } finally {
        setLoadingPriceId(null);
    }
  };

  if (!plans || plans.length === 0) return null;

  const formattedPlans = plans.map((plan) => {
    const features = [];
    
    // Dynamic features based on limits
    if (plan.max_branches) features.push(`Hasta ${plan.max_branches} sucursales`);
    else features.push("Sucursales ilimitadas");
    
    if (plan.max_users) features.push(`Hasta ${plan.max_users} usuarios`);
    else features.push("Usuarios ilimitados");
    
    if (plan.max_employees) features.push(`Hasta ${plan.max_employees} empleados`);
    else features.push("Empleados ilimitados");
    
    if (plan.max_storage_mb) {
      const gb = plan.max_storage_mb / 1024;
      features.push(gb >= 1 ? `${gb.toFixed(1)} GB almacenamiento` : `${plan.max_storage_mb} MB almacenamiento`);
    } else {
      features.push("Almacenamiento ilimitado");
    }

    // Logic for highlighting the "PRO" or highest plan (excluding enterprise usually)
    const isPro = highlightPlanId 
        ? plan.plan_id === highlightPlanId || plan.id === highlightPlanId
        : (plan.code?.toLowerCase().includes('pro') || plan.name?.toLowerCase().includes('pro'));
    
    return {
      name: plan.name,
      price: plan.price_amount ? `${plan.currency_code === 'ARS' ? '$' : '$'}${plan.price_amount}` : "Consultar",
      billing: plan.billing_period === "monthly" ? "/mes" : plan.billing_period === "yearly" ? "/año" : "",
      description: plan.description || "Solución profesional para tu negocio.",
      features,
      highlight: isPro,
      modules_count: plan.modules_count || 0,
      cta: plan.price_amount ? "Empezar Ahora" : "Contactar Ventas",
      price_id: plan.stripe_price_id || "", 
      plan_id: plan.id,
      price_amount: plan.price_amount
    };
  });

  return (
    <section id="pricing" className={compact ? "py-8" : "py-24 md:py-32"}>
      <div className="mx-auto max-w-7xl px-6">
        <div className="mb-16 text-center">
          <FadeIn>
            <h2 className="mb-4 text-3xl font-bold tracking-tight text-foreground md:text-5xl">Precios Transparentes</h2>
            <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
              Sin costos ocultos. Elige el plan que mejor se adapte a tu tamaño actual.
            </p>
          </FadeIn>
        </div>

        <div className="flex flex-wrap justify-center gap-8">
          {formattedPlans.map((plan, idx) => (
            <FadeIn key={idx} delay={idx * 0.1} className="w-full md:w-auto md:min-w-[340px] max-w-[400px]">
              <div className={`relative flex flex-col h-full rounded-4xl border ${plan.highlight ? 'border-brand/40 bg-white ring-8 ring-brand/5' : 'border-line bg-white'} p-8 shadow-sm transition-all hover:shadow-xl hover:-translate-y-2`}>
                {plan.highlight && (
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand px-4 py-1 text-xs font-bold text-white uppercase tracking-wider">
                    Más Popular
                  </div>
                )}
                <div className="mb-8">
                  <h3 className="text-lg font-bold text-foreground">{plan.name}</h3>
                  <div className="mt-4 flex items-baseline gap-1">
                    <span className="text-4xl font-extrabold tracking-tight text-foreground">{plan.price}</span>
                    <span className="text-sm font-medium text-muted-foreground">{plan.billing}</span>
                  </div>
                  <p className="mt-4 text-sm text-muted-foreground">{plan.description}</p>
                  <p className="mt-2 text-sm font-bold text-muted-foreground">{plan.modules_count || 0} módulos</p>
                </div>
                <div className="flex-1">
                  <ul className="space-y-4">
                    {plan.features.map((f: string, i: number) => (
                      <li key={i} className="flex items-center gap-3 text-sm text-foreground">
                        <CheckCircle2 className="h-5 w-5 text-brand flex-shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
                <button 
                  onClick={() => plan.price_amount && handleCheckout(plan.price_id, plan.plan_id)}
                  disabled={loadingPriceId === plan.price_id}
                  className={`mt-10 w-full rounded-2xl py-4 font-bold transition-all flex justify-center items-center ${plan.highlight ? 'bg-brand text-white hover:bg-brand-dark shadow-lg shadow-brand/20' : 'bg-line/30 text-foreground hover:bg-line/50 font-semibold'} ${loadingPriceId === plan.price_id ? 'opacity-70 cursor-wait' : ''}`}
                >
                  {loadingPriceId === plan.price_id ? (
                    <span className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                  ) : plan.cta}
                </button>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}

export function LandingFooter() {
  return (
    <footer className="border-t border-line bg-panel pt-20 pb-10">
      <div className="mx-auto max-w-7xl px-6">
        <div className="grid gap-12 md:grid-cols-4">
          <div className="col-span-2">
            <Link href="/" className="mb-6 flex items-center gap-2 group">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand text-white shadow-lg shadow-brand/20 transition-transform group-hover:scale-105">
                <span className="text-xl font-bold italic">B</span>
              </div>
              <span className="text-xl font-bold tracking-tight text-foreground">GetBackplate</span>
            </Link>
            <p className="max-w-xs text-sm text-muted-foreground leading-relaxed">
              Elevando los estándares operativos del sector gastronómico con tecnología de vanguardia.
            </p>
          </div>
          <div>
            <h4 className="mb-6 text-sm font-bold uppercase tracking-widest text-[#aaa]">Producto</h4>
            <ul className="space-y-4 text-sm font-medium">
              <li><Link href="#features" className="text-muted-foreground hover:text-brand">Funcionalidades</Link></li>
              <li><Link href="#pricing" className="text-muted-foreground hover:text-brand">Precios</Link></li>
              <li><Link href="/auth/login" className="text-muted-foreground hover:text-brand">Dashboard</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="mb-6 text-sm font-bold uppercase tracking-widest text-[#aaa]">Compañía</h4>
            <ul className="space-y-4 text-sm font-medium">
              <li><Link href="#" className="text-muted-foreground hover:text-brand">Sobre Nosotros</Link></li>
              <li><Link href="#" className="text-muted-foreground hover:text-brand">Contacto</Link></li>
              <li><Link href="#" className="text-muted-foreground hover:text-brand">Términos</Link></li>
            </ul>
          </div>
        </div>
        <div className="mt-20 border-t border-line pt-10 text-center text-xs font-semibold text-[#aaa] uppercase tracking-[0.1em]">
          &copy; {new Date().getFullYear()} GetBackplate. Todos los derechos reservados.
        </div>
      </div>
    </footer>
  );
}
