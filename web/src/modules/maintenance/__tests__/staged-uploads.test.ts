import { describe, expect, it } from "vitest";

import { stagedMaintenanceUploadsFromFormData } from "@/modules/maintenance/services";

/**
 * Como llegan los adjuntos de mantenimiento desde que la subida es directa.
 *
 * El archivo ya no viaja dentro del formulario: el borde corta los cuerpos de
 * mas de 4.5 MB. El navegador sube los bytes a la carpeta de paso y manda dos
 * listas paralelas, file_paths y file_names, que se casan por posicion. Si se
 * desalinean, el adjunto queda guardado con el nombre de otro archivo.
 */

describe("stagedMaintenanceUploadsFromFormData", () => {
  it("casa cada ruta con su nombre por posicion", () => {
    const formData = new FormData();
    formData.append("file_paths", "org-1/staging/maintenance/1-foto.jpg");
    formData.append("file_paths", "org-1/staging/maintenance/2-factura.pdf");
    formData.append("file_names", "foto.jpg");
    formData.append("file_names", "factura.pdf");

    expect(stagedMaintenanceUploadsFromFormData(formData)).toEqual([
      { path: "org-1/staging/maintenance/1-foto.jpg", name: "foto.jpg" },
      { path: "org-1/staging/maintenance/2-factura.pdf", name: "factura.pdf" },
    ]);
  });

  it("no devuelve nada cuando el formulario no trae rutas", () => {
    const formData = new FormData();
    formData.set("title", "Heladera");

    expect(stagedMaintenanceUploadsFromFormData(formData)).toEqual([]);
  });

  it("descarta las posiciones vacias sin correr las que siguen", () => {
    const formData = new FormData();
    formData.append("file_paths", "");
    formData.append("file_paths", "org-1/staging/maintenance/2-factura.pdf");
    formData.append("file_names", "");
    formData.append("file_names", "factura.pdf");

    expect(stagedMaintenanceUploadsFromFormData(formData)).toEqual([
      { path: "org-1/staging/maintenance/2-factura.pdf", name: "factura.pdf" },
    ]);
  });

  it("tolera que falte el nombre en lugar de tomar el de otro archivo", () => {
    const formData = new FormData();
    formData.append("file_paths", "org-1/staging/maintenance/1-foto.jpg");
    formData.append("file_paths", "org-1/staging/maintenance/2-factura.pdf");
    formData.append("file_names", "foto.jpg");

    expect(stagedMaintenanceUploadsFromFormData(formData)).toEqual([
      { path: "org-1/staging/maintenance/1-foto.jpg", name: "foto.jpg" },
      { path: "org-1/staging/maintenance/2-factura.pdf", name: "" },
    ]);
  });
});
