// Test rápido de la API de Anthropic con Claude Sonnet 4.6
// Ejecutar con: node --env-file=.env.local scripts/test-anthropic.mjs

import Anthropic from "@anthropic-ai/sdk";

const apiKey = process.env.ANTHROPIC_API_KEY;
const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

if (!apiKey) {
  console.error("❌ No se encontró ANTHROPIC_API_KEY en el .env.local");
  process.exit(1);
}

console.log("🔑 API Key encontrada:", `${apiKey.slice(0, 20)}...`);
console.log("🤖 Modelo a usar:", model);
console.log("⏳ Enviando consulta a Anthropic...\n");

const client = new Anthropic({ apiKey });

try {
  const message = await client.messages.create({
    model,
    max_tokens: 300,
    temperature: 0.2,
    system: "Eres el asistente operativo de GetBackplate. Responde siempre en español, de forma concisa.",
    messages: [
      {
        role: "user",
        content: "Di hola y confirma tu versión de modelo en una sola frase.",
      },
    ],
  });

  const respuesta = message.content?.[0]?.text;
  const usage = message.usage;

  console.log("✅ Conexión exitosa con Anthropic!\n");
  console.log("📝 Respuesta:", respuesta);
  console.log("\n📊 Uso de tokens:");
  console.log("   - Input:", usage?.input_tokens);
  console.log("   - Output:", usage?.output_tokens);
  console.log("   - Total:", (usage?.input_tokens ?? 0) + (usage?.output_tokens ?? 0));
  console.log("\n🎯 Modelo real usado:", message.model);
} catch (error) {
  console.error("❌ Error al conectar con Anthropic:");
  if (error instanceof Error) {
    console.error("   Mensaje:", error.message);
  } else {
    console.error("   Error desconocido:", error);
  }
  process.exit(1);
}
