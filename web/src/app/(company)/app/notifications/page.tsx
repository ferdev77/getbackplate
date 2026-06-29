import { Bell } from "lucide-react";
import { requireTenantContext } from "@/shared/lib/access";
import { PageContent } from "@/shared/ui/page-content";
import { SlideUp } from "@/shared/ui/animations";
import { NotificationsHistoryList } from "@/shared/ui/notifications-history-list";

export default async function CompanyNotificationsPage() {
  await requireTenantContext();

  return (
    <PageContent>
      <SlideUp>
        <section className="mb-5 flex flex-col gap-1">
          <div className="inline-flex items-center gap-2 text-[var(--gbp-text)]">
            <Bell className="h-4 w-4" />
            <h1 className="text-lg font-bold">Notificaciones</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Historial de emails y notificaciones push que recibiste.
          </p>
        </section>
      </SlideUp>

      <SlideUp delay={0.1}>
        <NotificationsHistoryList />
      </SlideUp>
    </PageContent>
  );
}
