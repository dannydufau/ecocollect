const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');
const Ajv = require('ajv/dist/2020');
const addFormats = require('ajv-formats');

const root = path.join(__dirname, '..');

const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const load = (file) => YAML.parse(read(file));

const common = load('schemas/common.yaml');
const openapi = load('openapi.yaml');
const asyncapi = load('asyncapi.yaml');

// Both specs point at the shared definitions with a file $ref. Putting everything
// under one $defs block lets ajv resolve them without any file loading.
const fixRefs = (value) =>
  JSON.parse(
    JSON.stringify(value)
      .replaceAll('./schemas/common.yaml#/', '#/$defs/')
      .replaceAll('#/components/schemas/', '#/$defs/'),
  );

function compile(schema, spec) {
  const ajv = new Ajv({ strict: false, allErrors: true });
  addFormats(ajv);
  const defs = fixRefs({ ...common, ...spec?.components.schemas });
  return ajv.compile({ ...fixRefs(schema), $defs: defs });
}

// A validator for one named schema, like validator(openapi, 'CreateRequests').
const validator = (spec, name) => compile({ $ref: `#/$defs/${name}` }, spec);

// A validator for a schema written inline in a spec, like a response body.
const inline = (spec, schema) => compile(schema, spec);

// One of the shared definitions from schemas/common.yaml.
const shared = (name) => compile({ $ref: `#/$defs/${name}` });

const responseBody = (method, route, status) =>
  openapi.paths[route][method].responses[status].content['application/json'].schema;

module.exports = { root, read, load, common, openapi, asyncapi, validator, inline, shared, responseBody };
