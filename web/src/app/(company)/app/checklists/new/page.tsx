import CompanyChecklistsPage from "../page";

export const dynamic = "force-dynamic";

export default function NewChecklistPage() {
  return (
    <CompanyChecklistsPage
      searchParams={Promise.resolve({
        modal: "checklist-create",
      })}
    />
  );
}
