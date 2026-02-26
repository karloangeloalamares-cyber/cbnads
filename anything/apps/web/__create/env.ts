const requiredEnvVars = ['DATABASE_URL'] as const;

function missingVars(env: Record<string, string | undefined>): string[] {
  return requiredEnvVars.filter((key) => !env[key] || env[key]?.trim() === '');
}

export function assertRuntimeEnv(env: Record<string, string | undefined> = process.env): void {
  const missing = missingVars(env);
  if (missing.length === 0) {
    return;
  }

  throw new Error(
    `Missing required environment variables: ${missing.join(', ')}. ` +
      'Set them in your Vercel project before deploying.'
  );
}
