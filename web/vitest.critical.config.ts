import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  envDir: false,
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./test/network-guard.ts"],
    include: [
      "src/modules/integrations/qbo-r365/__tests__/{crypto,oauth-state,pipeline-rules,qbo-client,qbo-environment,qbo-webhook-payload,r365-csv,webhook-auth}.test.ts",
      "src/modules/integrations/qbo-r365/usage-billing-rules.test.ts",
      "src/modules/organizations/services/plan-module-rules.test.ts",
      "src/shared/lib/__tests__/{document-access,private-document-access,scope-policy}.test.ts",
      "src/shared/lib/__tests__/{notification-guards,notification-recipients}.test.ts",
      "src/modules/vendors/__tests__/notifications.test.ts",
      "src/modules/checklists/lib/notification-channels.test.ts",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: [
        "src/modules/integrations/qbo-r365/{crypto,oauth-state,pipeline-rules,qbo-client,qbo-environment,qbo-webhook-payload,r365-csv,usage-billing-rules,webhook-auth}.ts",
        "src/modules/organizations/services/plan-module-rules.ts",
        "src/shared/lib/{document-access,scope-policy}.ts",
      ],
      thresholds: {
        statements: 70,
        branches: 65,
        functions: 75,
        lines: 70,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "server-only": path.resolve(__dirname, "./test/mocks/server-only.ts"),
    },
  },
});
