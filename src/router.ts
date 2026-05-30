import { FastifyInstance, FastifyPluginAsync, preHandlerHookHandler } from 'fastify';
import { globSync } from 'glob';
import path from 'path';
import { EndpointConfig, MethodSchema, RouteHooks } from './sfe';
import { runWithFastify } from './fastify';

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

function buildUrlPrefix(dirPath: string, baseDir: string): string {
  const relativePath = path.relative(baseDir, dirPath).replace(/\\/g, '/');
  if (!relativePath || relativePath === '.') return '';
  let prefix = `/${relativePath}`;
  prefix = prefix.replace(/\[(\w+)\]/g, ':$1');
  return prefix;
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
    const result = await runWithFastify(request.server, () => handler(request, reply));
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

type DirectoryConfig = {
  routes: string[];
  middleware?: preHandlerHookHandler;
  plugin?: FastifyPluginAsync;
  children: Set<string>;
};

function toPreHandlerHooks(hooks?: RouteHooks): preHandlerHookHandler[] {
  if (!hooks) return [];
  const hookValue = hooks.preHandler;
  if (!hookValue) return [];
  return Array.isArray(hookValue) ? hookValue : [hookValue];
}

export async function registerTridentRoutes(
  fastify: FastifyInstance,
  options?: { routesDir?: string }
) {
  const routesDir = options?.routesDir ?? 'src/routes';
  const routesRoot = path.resolve(routesDir);
  const extensions = ['js', 'ts', 'jsx', 'tsx', 'mjs', 'cjs'];
  const extPattern = `@(${extensions.join('|')})`;
  
  const targetFiles = [
    { key: 'middleware', pattern: `**/_middleware.${extPattern}` },
    { key: 'plugin', pattern: `**/_plugin.${extPattern}` },
    { key: 'route', pattern: `**/!(_)*.${extPattern}` },
  ];
  
  const patterns = Object.fromEntries(
    targetFiles.map(({ key, pattern }) => [
      `${key}Pattern`,
      path.join(routesDir, pattern).replace(/\\/g, '/')
    ])
  );
  
  const { middlewarePattern, pluginPattern, routePattern } = patterns;


  const middlewareFiles = globSync(middlewarePattern, { nodir: true });
  const pluginFiles = globSync(pluginPattern, { nodir: true });
  const routeFiles = globSync(routePattern, { nodir: true });

  const directoryMap = new Map<string, DirectoryConfig>();
  const ensureDirectory = (dirPath: string): DirectoryConfig => {
    const resolved = path.resolve(dirPath);
    const existing = directoryMap.get(resolved);
    if (existing) return existing;
    const created: DirectoryConfig = {
      routes: [],
      children: new Set()
    };
    directoryMap.set(resolved, created);
    return created;
  };

  for (const file of middlewareFiles) {
    const mod = await import(path.resolve(file));
    if (typeof mod.default === 'function') {
      const dir = path.resolve(path.dirname(file));
      ensureDirectory(dir).middleware = mod.default;
    }
  }

  for (const file of pluginFiles) {
    const mod = await import(path.resolve(file));
    if (typeof mod.default === 'function') {
      const dir = path.resolve(path.dirname(file));
      ensureDirectory(dir).plugin = mod.default as FastifyPluginAsync;
    }
  }

  for (const file of routeFiles) {
    const dir = path.resolve(path.dirname(file));
    ensureDirectory(dir).routes.push(path.resolve(file));
  }

  ensureDirectory(routesRoot);

  for (const dirPath of directoryMap.keys()) {
    if (dirPath === routesRoot) continue;
    const parentDir = path.dirname(dirPath);
    if (parentDir.startsWith(routesRoot)) {
      ensureDirectory(parentDir).children.add(dirPath);
    }
  }

  const registerDirectory = async (parent: FastifyInstance, dirPath: string, baseDir: string) => {
    const config = directoryMap.get(dirPath);
    const prefix = buildUrlPrefix(dirPath, baseDir);

    await parent.register(
      async (scope) => {
        if (config?.plugin) {
          await config.plugin(scope, {} as any);
        }

        if (config?.middleware) {
          scope.addHook('preHandler', config.middleware);
        }

        for (const file of config?.routes ?? []) {
          const urlPath = buildUrlPath(file, dirPath);
          const module = await import(file);
          const endpointConfig = module.default as EndpointConfig | undefined;
          if (!endpointConfig) continue;

          const schema = endpointConfig.schema;
          const methods = ['get', 'post', 'put', 'delete', 'patch'] as const;
          for (const method of methods) {
            const handler = endpointConfig[method];
            if (handler) {
              const methodHooks: preHandlerHookHandler[] = [];

              let methodSchema: MethodSchema | undefined;
              if (schema) {
                if (isMethodSpecificSchema(schema)) {
                  methodSchema = (schema as Record<string, MethodSchema | undefined>)[method];
                } else {
                  methodSchema = schema as MethodSchema;
                }
              }

              if (
                methodSchema &&
                (methodSchema.params || methodSchema.querystring || methodSchema.body)
              ) {
                methodHooks.push(createValidationPreHandler(methodSchema));
              }

              const endpointHooks = endpointConfig.hooks?.[method];
              const endpointPreHandlers = toPreHandlerHooks(endpointHooks);
              if (endpointPreHandlers.length > 0) {
                methodHooks.push(...endpointPreHandlers);
              }

              scope.route({
                method: method.toUpperCase() as any,
                url: urlPath,
                preHandler: methodHooks,
                handler: wrapHandler(handler, methodSchema)
              });
            }
          }
        }

        const children = Array.from(config?.children ?? []).sort();
        for (const childDir of children) {
          await registerDirectory(scope, childDir, dirPath);
        }
      },
      prefix ? { prefix } : { }
    );
  };

  await registerDirectory(fastify, routesRoot, routesRoot);
}
