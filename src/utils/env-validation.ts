/**
 * Validates required environment variables on startup
 * Throws an error if any required variables are missing
 */
export function validateEnv() {
  const requiredEnvVars = [
    'DATABASE_URL',
    'OPENAI_API_KEY',
  ];

  const missing: string[] = [];

  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      missing.push(envVar);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}\n` +
      'Please check your .env file or environment configuration.'
    );
  }

  // Validate URL format for DATABASE_URL
  try {
    new URL(process.env.DATABASE_URL!);
  } catch (error) {
    throw new Error('DATABASE_URL must be a valid URL');
  }
}

