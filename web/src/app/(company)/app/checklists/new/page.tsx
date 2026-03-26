import CompanyChecklistsPage from "../page";



export default function NewChecklistPage() {
  return (
    <CompanyChecklistsPage
      searchParams={Promise.resolve({
        modal: "checklist-create",
      })}
    />
  );
}
