// Shared pieces of the body shape checks (one Valibot schema per body, in its
// own *-body.ts file) and the UUID check for path ids.
import * as v from 'valibot';
import { validationFailed } from './errors.ts';

export const Uuid = v.pipe(v.string(), v.uuid());

// The object schemas report three cases themselves (missing key, unknown key,
// not an object), told apart by `expected`. Valibot's paths are dotted
// (items.0.quantity); the contract's are items[0].quantity. The first issue
// for a path wins, so each field has one entry.
export function toFields(issues: v.BaseIssue<unknown>[]): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of issues) {
    const path = (v.getDotPath(issue) ?? 'body').replace(/\.(\d+)/g, '[$1]');
    let message = issue.message;
    if (issue.type === 'strict_object') {
      message = issue.expected === 'never' ? 'unknown field'
        : issue.expected === 'Object' ? 'must be an object' : 'is required';
    }
    fields[path] ??= message;
  }
  return fields;
}

// Checks a body against its schema: the typed body, or a 400 listing every
// failing field. strictObject accepts an array (typeof [] is 'object') and
// reports its indexes as unknown keys; a clearer answer for a JSON array.
export function parseBody<S extends v.GenericSchema>(schema: S, body: unknown): v.InferOutput<S> {
  if (Array.isArray(body)) throw validationFailed({ body: 'must be an object' });
  const result = v.safeParse(schema, body);
  if (!result.success) throw validationFailed(toFields(result.issues));
  return result.output;
}
