import { z } from 'zod'
import type { ApiTokenScope } from '@/db/schema/api-tokens'

// ---------------------------------------------------------------------------
// Internal registry types
// ---------------------------------------------------------------------------

type JSONSchema = Record<string, unknown>

type OpenAPIParamIn = 'path' | 'query' | 'header'

type RegisterRouteOptions = {
  scope: ApiTokenScope
  summary: string
  description?: string
  requestSchema?: z.ZodTypeAny
  responseSchema?: z.ZodTypeAny
  params?: Array<{ name: string; in: OpenAPIParamIn; required?: boolean; description?: string }>
  tags?: string[]
}

type RegistryEntry = RegisterRouteOptions & {
  method: string
  path: string
}

// Module-level registry — populated at import time by each route file calling registerRoute()
const registry: RegistryEntry[] = []

/**
 * registerRoute — called by each route file at module scope to self-register
 * in the OpenAPI document.
 *
 * @param method  HTTP method in uppercase (GET, POST, PATCH, DELETE, PUT)
 * @param path    OpenAPI path string e.g. '/api/notes/{noteId}'
 * @param options Route metadata including scope, schemas, description
 */
export function registerRoute(
  method: string,
  path: string,
  options: RegisterRouteOptions
): void {
  registry.push({ method: method.toUpperCase(), path, ...options })
}

// ---------------------------------------------------------------------------
// OpenAPI 3.1 document builder
// ---------------------------------------------------------------------------

function toJsonSchema(schema: z.ZodTypeAny): JSONSchema {
  try {
    // Zod 4 ships built-in z.toJSONSchema()
    return z.toJSONSchema(schema) as JSONSchema
  } catch {
    return {}
  }
}

function buildScopeDescription(scope: ApiTokenScope): string {
  if (scope === 'admin') return 'Requires admin scope'
  if (scope === 'write') return 'Requires write scope (admin satisfies this)'
  return 'Requires read scope (write and admin satisfy this)'
}

export function getOpenApiDocument(): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {}
  const schemas: Record<string, JSONSchema> = {}

  for (const entry of registry) {
    const { method, path, scope, summary, description, requestSchema, responseSchema, params, tags } = entry

    // Convert Next.js [param] syntax to OpenAPI {param} syntax
    const openApiPath = path.replace(/\[([^\]]+)\]/g, '{$1}')

    if (!paths[openApiPath]) {
      paths[openApiPath] = {}
    }

    const operation: Record<string, unknown> = {
      summary,
      description: description ?? buildScopeDescription(scope),
      security: [{ bearerAuth: [] }],
      tags: tags ?? [openApiPath.split('/')[2] ?? 'general'],
    }

    // Path parameters
    if (params && params.length > 0) {
      operation.parameters = params.map((p) => ({
        name: p.name,
        in: p.in,
        required: p.required ?? p.in === 'path',
        description: p.description ?? p.name,
        schema: { type: 'string' },
      }))
    }

    // Request body
    if (requestSchema) {
      const schemaName = `${method}_${openApiPath.replace(/[^a-zA-Z0-9]/g, '_')}_body`
      const jsonSchema = toJsonSchema(requestSchema)
      schemas[schemaName] = jsonSchema
      operation.requestBody = {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: `#/components/schemas/${schemaName}` },
          },
        },
      }
    }

    // Response
    const responseSchemaName = `${method}_${openApiPath.replace(/[^a-zA-Z0-9]/g, '_')}_response`
    const responseJsonSchema = responseSchema ? toJsonSchema(responseSchema) : { type: 'object', properties: { ok: { type: 'boolean' } } }
    schemas[responseSchemaName] = responseJsonSchema

    operation.responses = {
      '200': {
        description: 'Success',
        content: {
          'application/json': {
            schema: { $ref: `#/components/schemas/${responseSchemaName}` },
          },
        },
      },
      '401': { description: 'Unauthorized — missing or invalid token' },
      '403': { description: 'Forbidden — insufficient scope' },
      '429': { description: 'Rate limit exceeded' },
      '500': { description: 'Internal server error' },
    }

    paths[openApiPath][method.toLowerCase()] = operation
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'SkillAi API',
      version: '1.0.0',
      description:
        'Internal REST API for SkillAi — AI-powered recruiting portal. ' +
        'All endpoints require a Bearer API token (skl_<env>_...) issued via Settings → API Tokens.',
    },
    servers: [{ url: 'https://your-skillai-host', description: 'Production' }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'skl_<env>_<random>',
          description: 'API token issued from Settings → API Tokens. Format: skl_dev_... or skl_prod_...',
        },
      },
      schemas,
    },
    security: [{ bearerAuth: [] }],
    paths,
  }
}
