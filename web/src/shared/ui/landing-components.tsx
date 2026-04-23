import Link from "next/link";
import Image from "next/image";
import { MoveRight, CheckCircle2, Users, FileText, Bell } from "lucide-react";
import { FadeIn, SlideUp, AnimatedList, AnimatedItem, AnimatedButton, Interactive } from "@/shared/ui/animations";
import { LandingNavbar, LandingPricing } from "@/shared/ui/landing-client";

export { LandingNavbar, LandingPricing };

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
                <span className="absolute -right-12 -top-6 block rounded-full border border-brand/20 bg-brand/5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-brand backdrop-blur-sm">
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
                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 80vw, 1600px"
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
    description: "Organiza tu plantilla por locaciones, departamentos y rangos con total claridad.",
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
    description: "Avisos que llegan a todo el equipo al instante con confirmación de lectura.",
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
            <h4 className="mb-6 text-sm font-bold uppercase tracking-widest text-[var(--gbp-muted)]">Producto</h4>
            <ul className="space-y-4 text-sm font-medium">
              <li><Link href="#features" className="text-muted-foreground hover:text-brand">Funcionalidades</Link></li>
              <li><Link href="#pricing" className="text-muted-foreground hover:text-brand">Precios</Link></li>
              <li><Link href="/auth/login" className="text-muted-foreground hover:text-brand">Dashboard</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="mb-6 text-sm font-bold uppercase tracking-widest text-[var(--gbp-muted)]">Compañía</h4>
            <ul className="space-y-4 text-sm font-medium">
              <li><Link href="#" className="text-muted-foreground hover:text-brand">Sobre Nosotros</Link></li>
              <li><Link href="#" className="text-muted-foreground hover:text-brand">Contacto</Link></li>
              <li><Link href="#" className="text-muted-foreground hover:text-brand">Términos</Link></li>
            </ul>
          </div>
        </div>
        <div className="mt-20 border-t border-line pt-10 text-center text-xs font-semibold uppercase tracking-[0.1em] text-[var(--gbp-muted)]">
          &copy; {new Date().getFullYear()} GetBackplate. Todos los derechos reservados.
        </div>
      </div>
    </footer>
  );
}
