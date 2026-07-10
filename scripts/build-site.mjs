import { cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const dist = resolve(root, "dist");
const client = resolve(dist, "client");
const calculator = resolve(client, "calculator");

await rm(dist, { recursive: true, force: true });
await mkdir(calculator, { recursive: true });
await mkdir(resolve(dist, "server"), { recursive: true });
await mkdir(resolve(dist, ".openai"), { recursive: true });

for (const file of ["index.html", "app.js", "calc.js", "styles.css"]) {
  await cp(resolve(root, file), resolve(calculator, file));
}
await cp(resolve(root, "public", "og.png"), resolve(client, "og.png"));
await cp(resolve(root, "worker", "index.js"), resolve(dist, "server", "index.js"));
await cp(resolve(root, ".openai", "hosting.json"), resolve(dist, ".openai", "hosting.json"));
