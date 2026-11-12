import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { pathToFileURL } from "node:url";

const agentDir = process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent");
const install = process.env.PI_MANAGED_INSTALL_ROOT ?? join(agentDir, "install");
const version = readFileSync(join(install, "current-version"), "utf8").trim();
const modules = join(install, "releases", version, "node_modules");
const { createJiti } = await import(pathToFileURL(join(modules, "jiti/lib/jiti.mjs")).href);
const ccPackage = join(agentDir, "npm/node_modules/pi-cc-extensions");
const alias = { "pi-cc-extensions": ccPackage };
for (const name of ["pi-coding-agent", "pi-tui", "pi-ai", "pi-agent-core"]) {
	alias[`@earendil-works/${name}`] = join(modules, "@earendil-works", name, "dist/index.js");
}
const jiti = createJiti(import.meta.url, { fsCache: false, alias });
await jiti.import(join(import.meta.dirname, "assistant-text.test.ts"));
await jiti.import(join(import.meta.dirname, "user-message.test.ts"));
await jiti.import(join(import.meta.dirname, "skill-read.test.ts"));
if (existsSync(ccPackage)) {
	await jiti.import(join(import.meta.dirname, "pi-cc-extensions.test.ts"));
} else {
	console.log("pi-cc-extensions not installed; skipping its integration check.");
}
