/**
 * Test script: verifica qué formato de coordenadas acepta DocuSeal
 * Crea una submission con un PDF mínimo para ver el resultado
 * 
 * Run: node scripts/test-docuseal-coords.mjs
 */

// Minimal 1-page PDF in base64 — a real readable PDF
const MINIMAL_PDF_BASE64 = `JVBERi0xLjQKJcfsj6IKNSAwIG9iago8PAovTGVuZ3RoIDYgMCBSCi9GaWx0ZXIgL0ZsYXRlRGVjb2RlCj4+CnN0cmVhbQp4nCtUMlQqS80rUShXslIqLU4tykvMTQUAIe8GCgplbmRzdHJlYW0KZW5kb2JqCjYgMCBvYmoKMzAKZW5kb2JqCjQgMCBvYmoKPDwKL1R5cGUgL1BhZ2UKL01lZGlhQm94IFswIDAgNjEyIDc5Ml0KL1Jlc291cmNlcyA8PAovRm9udCA8PAovRjEgPDwvVHlwZSAvRm9udCAvU3VidHlwZSAvVHlwZTEgL0Jhc2VGb250IC9IZWx2ZXRpY2E+PgovRjIgMiAwIFIKPj4KPj4KL0NvbnRlbnRzIDUgMCBSCi9QYXJlbnQgMyAwIFIKPj4KZW5kb2JqCjIgMCBvYmoKPDwKL1R5cGUgL0ZvbnQKL1N1YnR5cGUgL1R5cGUxCi9CYXNlRm9udCAvSGVsdmV0aWNhCj4+CmVuZG9iagoxIDAgb2JqCjw8Ci9UeXBlIC9DYXRhbG9nCi9QYWdlcyAzIDAgUgo+PgplbmRvYmoKMyAwIG9iago8PAovVHlwZSAvUGFnZXMKL0tpZHMgWzQgMCBSXQovQ291bnQgMQo+PgplbmRvYmoKeHJlZgowIDcKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMjMzIDAwMDAwIG4gCjAwMDAwMDAxNzkgMDAwMDAgbiAKMDAwMDAwMDI4MiAwMDAwMCBuIAowMDAwMDAwMDY4IDAwMDAwIG4gCjAwMDAwMDAwMTUgMDAwMDAgbiAKMDAwMDAwMDA0NSAwMDAwMCBuIAp0cmFpbGVyCjw8Ci9TaXplIDcKL1Jvb3QgMSAwIFIKPj4Kc3RhcnR4cmVmCjMzMQolJUVPRgo=`;

const API_KEY = process.env.DOCUSEAL_API_KEY || "";
const API_URL = process.env.DOCUSEAL_API_URL || "https://api.docuseal.com";

async function testWithCoords(label, areas) {
  console.log(`\n=== TEST: ${label} ===`);
  const body = {
    name: `Test Firma Coords ${label}`,
    send_email: false,
    documents: [
      {
        name: "test-firma.pdf",
        file: MINIMAL_PDF_BASE64,
        fields: [
          {
            name: "Firma",
            type: "signature",
            role: "Empleado",
            required: true,
            areas: areas,
          },
        ],
      },
    ],
    submitters: [
      {
        role: "Empleado",
        name: "Test Empleado",
        email: "test-embed@example.com",
        send_email: false,
      },
    ],
  };

  try {
    const resp = await fetch(`${API_URL}/submissions/pdf`, {
      method: "POST",
      headers: {
        "X-Auth-Token": API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await resp.json();

    if (!resp.ok) {
      console.error("❌ Error:", JSON.stringify(data, null, 2));
      return;
    }

    const submitter = data.submitters?.[0];
    console.log("✅ Submission ID:", data.id);
    console.log("   embed_src:", submitter?.embed_src);
    console.log("   Status:", submitter?.status);
    
    // Check fields response to see how DocuSeal normalizes coordinates
    if (data.fields?.length > 0) {
      console.log("   Fields stored as (DocuSeal normalized):", JSON.stringify(data.fields[0]?.areas?.[0], null, 4));
    }

    // Clean up: delete the submission
    if (data.id) {
      await fetch(`${API_URL}/submissions/${data.id}`, {
        method: "DELETE",
        headers: { "X-Auth-Token": API_KEY },
      });
      console.log("   (Submission deleted)");
    }
  } catch (err) {
    console.error("❌ Fetch error:", err.message);
  }
}

async function main() {
  if (!API_KEY) {
    throw new Error("DOCUSEAL_API_KEY no configurada");
  }

  console.log("DocuSeal API:", API_URL);
  console.log("Testing coordinates format...\n");

  // Test 1: Pixel coordinates (current incorrect implementation)
  await testWithCoords("PIXELS (current - incorrect)", [
    { page: 1, x: 350, y: 700, w: 200, h: 50 },
  ]);

  // Test 2: Relative 0-1 coordinates (as per official docs)
  await testWithCoords("RELATIVE 0-1 (correct per docs)", [
    { page: 1, x: 0.55, y: 0.82, w: 0.30, h: 0.06 },
  ]);

  // Test 3: Check what the API returns to confirm normalization
  console.log("\n=== DIAGNOSIS COMPLETE ===");
  console.log("Fields in the areas response show what DocuSeal actually stores");
  console.log("x/y/w/h > 1.0 = DocuSeal received pixel values (wrong)");
  console.log("x/y/w/h between 0-1 = DocuSeal received relative values (correct)");
}

main().catch(console.error);
