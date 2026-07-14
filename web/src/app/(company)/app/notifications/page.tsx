import { Bell } from "lucide-react";
import { requireTenantContext } from "@/shared/lib/access";
import { PageContent } from "@/shared/ui/page-content";
import { SlideUp } from "@/shared/ui/animations";
import { NotificationsHistoryList } from "@/shared/ui/notifications-history-list";
import { getCurrentUser } from "@/modules/memberships/queries";
import { resolveUserLocale } from "@/shared/lib/locale";
import { createTranslator } from "@/shared/ui/company-shell.i18n";

export default async function CompanyNotificationsPage() {
  const tenant = await requireTenantContext();
  const user = await getCurrentUser();
  const locale = await resolveUserLocale({ organizationId: tenant.organizationId, userId: user?.id ?? null });
  const t = createTranslator(locale);

  return (
    <PageContent>
      <SlideUp>
        <section className="mb-5 flex flex-col gap-1">
          <div className="inline-flex items-center gap-2 text-[var(--gbp-text)]">
            <Bell className="h-4 w-4" />
            <h1 className="text-lg font-bold">{t("Notificaciones")}</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            {t("Historial de emails y notificaciones push que recibiste.")}
          </p>
        </section>
      </SlideUp>

      <SlideUp delay={0.1}>
        <NotificationsHistoryList locale={locale} />
      </SlideUp>
    </PageContent>
  );
}
