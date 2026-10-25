import { createApp } from "./app";
import { loadConfig } from "./config";

if (import.meta.main) {
  const config = loadConfig();

  Bun.serve({
    port: config.port,
    fetch: createApp(config).fetch,
  });
}
