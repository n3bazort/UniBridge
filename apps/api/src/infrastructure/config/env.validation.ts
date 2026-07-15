import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().default(3001),
  DATABASE_URL: Joi.string().required(),
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().default(6379),
  JWT_SECRET: Joi.string().required(),
  JWT_REFRESH_SECRET: Joi.string().required(),
  // CORS
  CORS_ORIGINS: Joi.string().optional(),
  // MinIO / Almacenamiento
  DISABLE_MINIO: Joi.string().valid('true', 'false').default('false'),
  MINIO_ENDPOINT: Joi.string().default('localhost'),
  MINIO_PORT: Joi.number().default(9000),
  MINIO_USE_SSL: Joi.string().valid('true', 'false').default('false'),
  MINIO_ACCESS_KEY: Joi.when('DISABLE_MINIO', {
    is: 'true',
    then: Joi.string().optional(),
    otherwise: Joi.string().required(),
  }),
  MINIO_SECRET_KEY: Joi.when('DISABLE_MINIO', {
    is: 'true',
    then: Joi.string().optional(),
    otherwise: Joi.string().required(),
  }),
  // OpenSearch
  DISABLE_OPENSEARCH: Joi.string().valid('true', 'false').default('false'),
  OPENSEARCH_URL: Joi.string().default('https://localhost:9200'),
  OPENSEARCH_USERNAME: Joi.string().default('admin'),
  OPENSEARCH_PASSWORD: Joi.string().optional(),
});
