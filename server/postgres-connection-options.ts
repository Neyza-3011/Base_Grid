export interface PostgresConnectionOptions {
  connectionString?: string;
  ssl: false | { rejectUnauthorized: true; ca?: string };
}

/**
 * Build PostgreSQL connection options with one fail-closed TLS policy shared by
 * application startup and the migration CLI. Production must never disable
 * certificate verification or let URL parameters override the explicit TLS config.
 */
export function getPostgresConnectionOptions(
  dbUrl: string | undefined,
  isProduction: boolean,
  ca?: string,
): PostgresConnectionOptions {
  if (!isProduction) {
    return { connectionString: dbUrl, ssl: false };
  }

  if (!dbUrl) {
    throw new Error("CRITICAL SECURITY ERROR: DATABASE_URL is missing in production.");
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(dbUrl);
  } catch {
    throw new Error("CRITICAL SECURITY ERROR: DATABASE_URL must be a valid PostgreSQL URL in production.");
  }

  if (parsedUrl.protocol !== "postgres:" && parsedUrl.protocol !== "postgresql:") {
    throw new Error("CRITICAL SECURITY ERROR: DATABASE_URL must use the PostgreSQL protocol in production.");
  }

  const hostname = parsedUrl.hostname.toLowerCase();
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "0.0.0.0") {
    throw new Error("CRITICAL SECURITY ERROR: DATABASE_URL must point to a remote PostgreSQL host in production.");
  }

  const sslModeEntries = [...parsedUrl.searchParams.entries()]
    .filter(([key]) => key.toLowerCase() === "sslmode");
  const sslModes = sslModeEntries.map(([, value]) => value.toLowerCase());
  if (sslModes.some((mode) => !["require", "verify-ca", "verify-full"].includes(mode))) {
    throw new Error("CRITICAL SECURITY ERROR: production DATABASE_URL cannot use a PostgreSQL sslmode that permits plaintext or fallback connections.");
  }

  // node-postgres lets sslmode in the URL replace the explicit SSL options.
  // Remove it so the verified TLS settings below cannot be silently overridden.
  for (const key of [...parsedUrl.searchParams.keys()]) {
    if (key.toLowerCase() === "sslmode") parsedUrl.searchParams.delete(key);
  }

  const customCertificateOptions = [...parsedUrl.searchParams.keys()]
    .filter((key) => ["sslrootcert", "sslcert", "sslkey"].includes(key.toLowerCase()));
  if (customCertificateOptions.length > 0) {
    throw new Error("CRITICAL SECURITY ERROR: production DATABASE_URL must not override TLS certificate settings through query parameters; configure DATABASE_SSL_CA for a custom trusted CA.");
  }

  return {
    connectionString: parsedUrl.toString(),
    // A custom provider CA is trusted explicitly, but certificate verification stays enabled.
    ssl: ca ? { rejectUnauthorized: true, ca } : { rejectUnauthorized: true },
  };
}
