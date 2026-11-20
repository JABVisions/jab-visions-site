import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function typescriptUrl(filePath) {
  const file = filePath.endsWith(".ts") ? filePath : `${filePath}.ts`;
  return pathToFileURL(file).href;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    return { url: typescriptUrl(path.join(root, specifier.slice(2))), shortCircuit: true };
  }
  const parentIsTypeScript = context.parentURL?.endsWith(".ts");
  if (parentIsTypeScript && (specifier.startsWith("./") || specifier.startsWith("../"))) {
    const parent = fileURLToPath(context.parentURL);
    return {
      url: typescriptUrl(path.resolve(path.dirname(parent), specifier)),
      shortCircuit: true,
    };
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (!url.endsWith(".ts")) return nextLoad(url, context);
  const source = stripTypeScriptTypes(readFileSync(fileURLToPath(url), "utf8"), { mode: "strip" });
  return { format: "module", source, shortCircuit: true };
}
