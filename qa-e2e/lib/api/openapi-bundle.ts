import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const GENERATED_DIR = dirname(fileURLToPath(import.meta.url));

export type BundledOpenApiDocument = Record<string, unknown> & {
  components?: { schemas?: Record<string, unknown> };
};

/** 读取 `openapi:sync` 产出的 bundled JSON（已消除 $ref）。 */
export async function loadBundledSpec(service: string): Promise<BundledOpenApiDocument> {
  const path = join(GENERATED_DIR, 'generated', `${service}.bundled.json`);
  const raw = await readFile(path, 'utf8');
  return JSON.parse(raw) as BundledOpenApiDocument;
}
