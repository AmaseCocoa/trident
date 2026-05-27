import { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

type ResolveTarget<T extends z.ZodTypeAny | undefined> = T extends z.ZodTypeAny
  ? z.infer<T>
  : unknown;

export interface MethodSchema {
  params?: z.ZodTypeAny;
  querystring?: z.ZodTypeAny;
  body?: z.ZodTypeAny;
  response?: Record<number, z.ZodTypeAny>;
}

export type EndpointSchema = MethodSchema | Record<string, MethodSchema | undefined>;

export type ContextualRequest<TSchema extends MethodSchema> = Omit<
  FastifyRequest,
  'body' | 'query' | 'params'
> & {
  body: ResolveTarget<TSchema['body']>;
  query: ResolveTarget<TSchema['querystring']>;
  params: ResolveTarget<TSchema['params']>;
};

type MethodHandler<TSchema extends MethodSchema = MethodSchema> = (
  req: ContextualRequest<TSchema>,
  res: FastifyReply
) => Promise<unknown> | unknown;

type ExtractMethodSchema<T extends EndpointSchema, M extends string> = T extends Record<
  string,
  MethodSchema | undefined
>
  ? M extends keyof T
    ? T[M] extends MethodSchema
      ? T[M]
      : MethodSchema
    : MethodSchema
  : T extends MethodSchema
    ? T
    : MethodSchema;

export interface EndpointConfig<TSchema extends EndpointSchema = EndpointSchema> {
  schema?: TSchema;
  get?: MethodHandler<ExtractMethodSchema<TSchema, 'get'>>;
  post?: MethodHandler<ExtractMethodSchema<TSchema, 'post'>>;
  put?: MethodHandler<ExtractMethodSchema<TSchema, 'put'>>;
  delete?: MethodHandler<ExtractMethodSchema<TSchema, 'delete'>>;
  patch?: MethodHandler<ExtractMethodSchema<TSchema, 'patch'>>;
}

export function defineEndpoint<TSchema extends EndpointSchema = EndpointSchema>(
  config: EndpointConfig<TSchema>
): EndpointConfig<TSchema> {
  return config;
}
