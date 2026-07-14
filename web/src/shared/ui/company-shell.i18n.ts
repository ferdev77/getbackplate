// Diccionario español → inglés para el shell de la app de company_admin.
// Se usa vía t("texto en español") -> string en inglés si locale === "en".
// Ir agregando entradas a medida que se traducen más pantallas.
export const COMPANY_SHELL_EN: Record<string, string> = {
  // ── Sidebar sections (SECTIONS in company-shell.config.ts) ────
  "Operaciones": "Operations",
  "Checklist": "Checklist",
  "Comunicacion": "Communication",
  "File Manager": "File Manager",
  "Proveedores": "Vendors",
  "Mantenimiento": "Maintenance",
  "Integraciones": "Integrations",
  "Recursos Humanos": "Human Resources",

  // ── Sidebar items (SECTIONS[].items[].label) ───────────────────
  "Dashboard": "Dashboard",
  "Ajustes Empresa": "Company Settings",
  "Reportes Checklists": "Checklist Reports",
  "Mis Checklists": "My Checklists",
  "Nuevo Checklist": "New Checklist",
  "Avisos": "Announcements",
  "Nuevo Aviso": "New Announcement",
  "Documentos": "Documents",
  "Crear Carpeta": "Create Folder",
  "Subir Archivo": "Upload File",
  "Papelera": "Trash",
  "Requests": "Requests",
  "Integración QuickBooks": "QuickBooks Integration",
  "Usuarios / Empleados": "Users / Employees",
  "Nuevo Usuario / Empleado": "New User / Employee",
  "Administradores": "Admins",
  "Nuevo Administrador": "New Admin",

  // ── Sidebar chrome ───────────────────────────────────────────
  "Empleados": "Employees",
  "Anuncios": "Announcements",
  "Checklists": "Checklists",
  "Ajustes": "Settings",
  "Sucursales": "Branches",
  "Todas las sucursales": "All branches",
  "Agregar sucursal": "Add branch",
  "Administrador": "Admin",
  "Cerrar sesión": "Log out",
  "Colapsar menú": "Collapse menu",
  "Expandir menú": "Expand menu",

  // ── Topbar ─────────────────────────────────────────────────────
  "Buscar...": "Search...",
  "Notificaciones": "Notifications",
  "Centro de notificaciones": "Notification center",
  "sin leer": "unread",
  "No tenés notificaciones todavía.": "You don't have any notifications yet.",
  "Ver todas": "View all",
  "Todas": "All",
  "Marcar todas como leídas": "Mark all as read",
  "No hay notificaciones para mostrar.": "There are no notifications to show.",
  "Cargando más": "Loading...",
  "Cargar más": "Load more",
  "Historial de emails y notificaciones push que recibiste.": "History of emails and push notifications you received.",
  "Perfil": "Profile",
  "Mi cuenta": "My account",
  "Feedback": "Feedback",
  "Instalar app": "Install app",
  "Configuración": "Settings",
  "Abrir menu": "Open menu",
  "Modo superadmin activo: estás operando dentro de una organización en modo impersonación.":
    "Superadmin mode active: you are operating inside an organization in impersonation mode.",
  "Saliendo...": "Exiting...",
  "Salir de impersonación": "Exit impersonation",
  "El acceso al panel permanece bloqueado hasta confirmar la suscripción en Stripe.":
    "Dashboard access remains blocked until the subscription is confirmed in Stripe.",

  // ── Settings — general ─────────────────────────────────────────
  "Ajustes generales": "General settings",
  "Facturación": "Billing",
  "Preferences": "Preferences",
  "Perfil de la empresa": "Company profile",
  "Marca y apariencia": "Branding & appearance",
  "Guardar cambios": "Save changes",
  "Guardar": "Save",
  "Cancelar": "Cancel",
  "Cerrar": "Close",
  "Volver": "Back",
  "Empresa": "Company",
  "Sin plan": "No plan",

  // ── Settings — preferences panel ──────────────────────────────
  "Appearance": "Appearance",
  "Selected Theme": "Selected theme",
  "Language & Time": "Language & time",
  "Language": "Language",
  "Date Format": "Date format",
  "Time Zone": "Time zone",
  "Automatic by location": "Automatic by location",
  "Manual": "Manual",
  "Privacy": "Privacy",
  "Cookie Settings": "Cookie settings",
  "Manage": "Manage",
  "Analytics": "Analytics",
  "Security": "Security",
  "Pedir código por email al iniciar sesión": "Ask for an email code at login",
  "Guardar seguridad": "Save security",
  "Guardar preferences": "Save preferences",
  "La verificación en dos pasos por email es obligatoria para cuentas con la integración de QuickBooks activa.":
    "Email two-step verification is required for accounts with the QuickBooks integration active.",
  "Administrar cookies": "Manage cookies",
  "Tema": "Theme",
  "Cambiar contraseña": "Change password",
  "Nombre": "Name",
  "Plan asignado": "Assigned plan",
  "El cambio de plan se gestiona desde Superadmin para mantener consistencia del tenant.":
    "Plan changes are managed from Superadmin to keep tenant consistency.",
  "Próximamente": "Coming soon",
  "Pago y Facturación": "Payment & Billing",

  // ── Billing panel ──────────────────────────────────────────────
  "Plan actual": "Current plan",
  "Cambiar plan": "Change plan",
  "Método de pago": "Payment method",
  "Gestiona tus métodos de pago, datos de facturación y descarga tus facturas de forma segura a través del portal de Stripe.":
    "Manage your payment methods, billing details, and securely download your invoices through the Stripe portal.",
  "Abrir Portal de Pagos": "Open Billing Portal",

  // ── Feedback modal ────────────────────────────────────────────
  "iAyudanos a mejorar!": "Help us improve!",
  "Reportar problema": "Report a problem",
  "Nueva idea / integracion": "New idea / integration",
  "Titulo del mensaje": "Message title",
  "Resume el problema o idea en una linea...": "Summarize the problem or idea in one line...",
  "Descripcion detallada": "Detailed description",
  "Cuentanos con detalle...": "Tell us in detail...",
  "Enviando msj...": "Sending msg...",
  "Enviar mensaje": "Send message",

  // ── Misc labels used across the shell ─────────────────────────
  "Admin de empresa": "Company admin",
  "Empleado": "Employee",
  "Usuario": "User",
  "Cargando...": "Loading...",
  "Guardando...": "Saving...",
};

export function createTranslator(locale: "es" | "en" | undefined) {
  return function t(spanish: string): string {
    if (locale !== "en") return spanish;
    return COMPANY_SHELL_EN[spanish] ?? spanish;
  };
}
