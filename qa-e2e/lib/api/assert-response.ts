import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import type { APIResponse } from '@playwright/test';
import type { BundledOpenApiDocument } from './openapi-bundle.ts';

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

function resolveRef(doc: BundledOpenApiDocument, ref: string): Record<string, unknown> | undefined {
  if (!ref.startsWith('#/')) return undefined;
  const parts = ref.slice(2).split('/');
  let node: unknown = doc;
  for (const part of parts) {
    if (node == null || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return node as Record<string, unknown> | undefined;
}

/** 按 OpenAPI bundled spec 校验 JSON 响应体（L3，辅助断言）。 */
export function assertMatchesOpenApiSchema(
  doc: BundledOpenApiDocument,
  schemaRef: string,
  body: unknown,
): void {
  const schema = resolveRef(doc, schemaRef);
  if (!schema) {
    throw new Error(`Schema ref not found: ${schemaRef}`);
  }
  const validate = ajv.compile(schema);
  const ok = validate(body);
  if (!ok) {
    throw new Error(
      `OpenAPI schema validation failed: ${ajv.errorsText(validate.errors, { separator: '; ' })}`,
    );
  }
}

export async function readJsonBody(response: APIResponse): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`Response is not JSON (status ${response.status()})`);
  }
}
