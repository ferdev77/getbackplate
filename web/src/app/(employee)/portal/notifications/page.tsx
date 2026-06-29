import { Bell } from "lucide-react";
import { requireEmployeeAccess } from "@/shared/lib/access";
import { NotificationsHistoryList } from "@/shared/ui/notifications-history-list";

export default async function EmployeeNotificationsPage() {
  await requireEmployeeAccess();

  return (
    <div className="px-4 py-6 sm:px-8">
      <section className="mb-5 flex flex-col gap-1">
        <div className="inline-flex items-center gap-2 text-[var(--gbp-text)]">
          <Bell className="h-4 w-4" />
          <h1 className="text-lg font-bold">Notificaciones</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Historial de emails y notificaciones push que recibiste.
        </p>
      </section>

      <NotificationsHistoryList />
    </div>
  );
}
