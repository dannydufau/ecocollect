// The body schema of one response documented in openapi.yaml, for the
// validators in contracts/test/helpers.js (contracts.inline). The contracts'
// own responseBody reads only responses written inline; many responses are
// instead a $ref to a shared one, e.g. '404': { $ref: '#/components/responses/NotFound' }.
// Every such $ref in openapi.yaml points into components/responses, and none of
// those points further, so one step is enough.

type Response = { $ref?: string; content?: { 'application/json'?: { schema?: unknown } } };

// The two parts of openapi.yaml read here (helpers.js is untyped JavaScript).
export type OpenApi = {
  paths: Record<string, Record<string, { responses: Record<string, Response> }>>;
  components: { responses: Record<string, Response> };
};

export function responseSchema(openapi: OpenApi, method: string, route: string, status: string): unknown {
  let response = openapi.paths[route]?.[method]?.responses[status];
  if (response?.$ref) response = openapi.components.responses[response.$ref.split('/').pop()!];
  const schema = response?.content?.['application/json']?.schema;
  if (schema === undefined) throw new Error(`no response ${method} ${route} ${status} in openapi.yaml`);
  return schema;
}
