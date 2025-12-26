import swaggerJsdoc from 'swagger-jsdoc';

const getSwaggerSpec = (port: number) => {
  const options: swaggerJsdoc.Options = {
    definition: {
      openapi: '3.0.0',
      info: {
        title: 'Quiz Generator API',
        version: '1.0.0',
        description: 'API documentation for Quiz Generator application',
      },
      servers: [
        {
          url: `http://localhost:${port}`,
          description: 'Development server',
        },
      ],
    },
    apis: ['./src/routes/*.ts', './src/**/*.ts'], // Paths to files containing OpenAPI definitions
  };

  return swaggerJsdoc(options);
};

export default getSwaggerSpec;

