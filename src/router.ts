import { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { globSync } from 'glob';
import path from 'path';
import { EndpointConfig, MethodSchema } from './sfe';

type ValidationIssue = {
  location: 'params' | 'querystring' | 'body';
  path: (string | number)[];
  message: string;
};

function buildUrlPath(filePath: string, routesRoot: string): string {
  const relativePath = path.relative(routesRoot, filePath).replace(/\\/g, '/');
  let urlPath = `/${relativePath.replace(/\.ts$/, '')}`.replace(/\/index$/, '');
  urlPath = urlPath.replace(/\[(\w+)\]/g, ':$1');
  if (urlPath === '') urlPath = '/';
  return urlPath;
}

function isMethodSchema(value: any): value is MethodSchema {
  return value && (value.params || value.querystring || value.body || value.response);
}

function isMethodSpecificSchema(value: any): boolean {
  if (!value || typeof value !== 'object') return false;
  const methodKeys = ['get', 'post', 'put', 'delete', 'patch'];
  return methodKeys.some((key) => key in value && isMethodSchema(value[key]));
}

function createValidationPreHandler(schema: MethodSchema): preHandlerHookHandler {
  return async (request, reply) => {
    const issues: ValidationIssue[] = [];

    if (schema.params) {
      const parsed = schema.params.safeParse(request.params);
      if (parsed.success) {
        (request as { params: unknown }).params = parsed.data;
      } else {
        issues.push(
          ...parsed.error.issues.map((issue) => ({
            location: 'params' as const,
            path: (issue.path as (string | number)[]) || [],
            message: issue.message
          }))
        );
      }
    }

    if (schema.querystring) {
      const parsed = schema.querystring.safeParse(request.query);
      if (parsed.success) {
        (request as { query: unknown }).query = parsed.data;
      } else {
        issues.push(
          ...parsed.error.issues.map((issue) => ({
            location: 'querystring' as const,
            path: (issue.path as (string | number)[]) || [],
            message: issue.message
          }))
        );
      }
    }

    const method = request.method.toUpperCase();
    const shouldValidateBody =
      schema.body &&
      !(
        (method === 'GET' || method === 'DELETE' || method === 'HEAD' || method === 'OPTIONS') &&
        request.body === undefined
      );
    if (shouldValidateBody && schema.body) {
      const parsed = schema.body.safeParse(request.body);
      if (parsed.success) {
        (request as { body: unknown }).body = parsed.data;
      } else {
        issues.push(
          ...parsed.error.issues.map((issue) => ({
            location: 'body' as const,
            path: (issue.path as (string | number)[]) || [],
            message: issue.message
          }))
        );
      }
    }

    if (issues.length > 0) {
      return reply.status(400).send({ error: 'ValidationError', issues });
    }
  };
}

function wrapHandler(
  handler: (...args: any[]) => any,
  schema?: MethodSchema
) {
  return async (request: any, reply: any) => {
    const result = await handler(request, reply);
    if (reply.sent) return result;

    const responseSchemas = schema?.response;
    if (responseSchemas && result !== undefined) {
      const statusCode = reply.statusCode ?? 200;
      const responseSchema =
        responseSchemas[statusCode] ??
        responseSchemas[200] ??
        responseSchemas[201] ??
        responseSchemas[204];
      if (responseSchema) {
        const parsed = responseSchema.safeParse(result);
        if (!parsed.success) {
          reply.status(500).send({
            error: 'ResponseValidationError',
            issues: parsed.error.issues
          });
          return;
        }
        return parsed.data;
      }
    }

    return result;
  };
}

export async function registerTridentRoutes(
  fastify: FastifyInstance,
  options?: { routesDir?: string }
) {
  const routesDir = options?.routesDir ?? 'src/routes';
  const routesRoot = path.resolve(routesDir);
  const middlewarePattern = path.join(routesDir, '**/_middleware.ts').replace(/\\/g, '/');
  const routePattern = path.join(routesDir, '**/!(_)*.ts').replace(/\\/g, '/');
  const middlewareFiles = globSync(middlewarePattern, { nodir: true });
  const middlewareMap = new Map<string, preHandlerHookHandler>();

  for (const file of middlewareFiles) {
    const mod = await import(path.resolve(file));
    if (typeof mod.default === 'function') {
      middlewareMap.set(path.resolve(path.dirname(file)), mod.default);
    }
  }

  const routeFiles = globSync(routePattern, { nodir: true });

  for (const file of routeFiles) {
    const absolutePath = path.resolve(file);
    const urlPath = buildUrlPath(absolutePath, routesRoot);
    const module = await import(absolutePath);
    const endpointConfig = module.default as EndpointConfig | undefined;
    if (!endpointConfig) continue;

    const schema = endpointConfig.schema;

    const baseHooks: preHandlerHookHandler[] = [];
    let currentDir = path.resolve(path.dirname(file));
    while (currentDir.startsWith(routesRoot)) {
      const matched = middlewareMap.get(currentDir);
      if (matched) baseHooks.unshift(matched);
      currentDir = path.dirname(currentDir);
    }

    const methods = ['get', 'post', 'put', 'delete', 'patch'] as const;
    for (const method of methods) {
      const handler = endpointConfig[method];
      if (handler) {
        const methodHooks = [...baseHooks];

        let methodSchema: MethodSchema | undefined;
        if (schema) {
          if (isMethodSpecificSchema(schema)) {
            methodSchema = (schema as Record<string, MethodSchema | undefined>)[method];
          } else {
            methodSchema = schema as MethodSchema;
          }
        }

        if (methodSchema && (methodSchema.params || methodSchema.querystring || methodSchema.body)) {
          methodHooks.push(createValidationPreHandler(methodSchema));
        }

        fastify.route({
          method: method.toUpperCase() as any,
          url: urlPath,
          preHandler: methodHooks,
          handler: wrapHandler(handler, methodSchema)
        });
      }
    }
  }
}
