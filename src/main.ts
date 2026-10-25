import { loadAdminName } from "./admin";
import { createApp } from "./app";
import { loadConfig } from "./config";

if (import.meta.main) {
  const config = loadConfig();
  const adminName = await loadAdminName(config);

  Bun.serve({
    port: config.port,
    fetch: createApp(config, adminName).fetch,
  });
}
