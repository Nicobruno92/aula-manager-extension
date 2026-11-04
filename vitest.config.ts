import { defineConfig } from "vitest/config";

// Tests run as a development build: both origins are allowed.
export default defineConfig({ define: { __DESARROLLO__: "true" }, test: { globals: true, include: ["pruebas/**/*.test.ts"] } });
