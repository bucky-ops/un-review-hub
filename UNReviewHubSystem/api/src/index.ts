import fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';

const server = fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
  },
});

// Register plugins
server.register(cors, {
  origin: process.env.CORS_ORIGIN || true,
  credentials: true,
});

server.register(helmet, {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
});

server.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
  errorResponseBuilder: (request, context) => ({
    code: 'RATE_LIMIT_EXCEEDED',
    error: 'Rate limit exceeded, retry in 1 minute',
    expiresIn: context.ttl,
  }),
});

server.register(swagger, {
  openapi: {
    info: {
      title: 'ReviewHub API',
      description: 'Human-in-the-Loop Review Platform API',
      version: '1.0.0',
      contact: {
        name: 'ReviewHub Support',
        email: 'support@unsublog.io',
      },
    },
    servers: [
      {
        url: process.env.API_BASE_URL || 'http://localhost:3000',
        description: 'Development server',
      },
    ],
    tags: [
      { name: 'auth', description: 'Authentication endpoints' },
      { name: 'reviews', description: 'Review management' },
      { name: 'users', description: 'User management' },
      { name: 'organizations', description: 'Organization management' },
    ],
  },
});

server.register(swaggerUi, {
  routePrefix: '/docs',
});

// Health check endpoint
server.get('/health', async (request, reply) => {
  return {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    database: 'not connected (development mode)',
  };
});

server.get('/api/v1/status', async (request, reply) => {
  return {
    service: 'ReviewHub API',
    status: 'operational',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  };
});

// Start server
const start = async () => {
  try {
    const port = parseInt(process.env.PORT || '3000', 10);
    const host = process.env.HOST || '0.0.0.0';

    await server.listen({ port, host });
    console.log(`🚀 ReviewHub API ready at http://${host}:${port}`);
    console.log(`📚 API Documentation: http://${host}:${port}/docs`);
  } catch (error) {
    console.error('Error starting server:', error);
    process.exit(1);
  }
};

start();