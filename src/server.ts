import app from './app.js';
import { validateEnv } from './utils/env-validation.js';

// Validate environment variables before starting server
try {
  validateEnv();
} catch (error) {
  console.error('❌ Environment validation failed:');
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`✅ Server started on port ${PORT}`);
  console.log(`📚 API documentation available at http://localhost:${PORT}/api/docs`);
});

