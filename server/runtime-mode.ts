export type RuntimeMode = "production" | "ai-studio" | "development" | "test";

/**
 * Determines the authoritative runtime mode of BaseGrid.
 * 
 * 1. Explicit override via BASEGRID_RUNTIME_MODE:
 *    - "production"  => Real production (strict PostgreSQL, Redis, JWT secret, superadmin credentials)
 *    - "ai-studio"   => Google AI Studio standalone container (ephemeral JWT secret, in-memory DB/Redis fallback)
 *    - "development" => Local development server
 *    - "test"        => Automated test runner (Vitest)
 * 
 * 2. Automated detection fallback:
 *    - If NODE_ENV === "test" => "test"
 *    - If NODE_ENV === "development" || !NODE_ENV => "development"
 *    - If NODE_ENV === "production":
 *        Strict auto-detection for Google AI Studio Cloud Run preview/sharing container:
 *        Only resolves to "ai-studio" if Cloud Run environment is detected (K_SERVICE / K_REVISION),
 *        no DATABASE_URL is set, no REDIS_URL is set, and GEMINI_API_KEY (AI Studio indicator) is present.
 *        Otherwise stays strictly "production".
 */
export function getRuntimeMode(env: NodeJS.ProcessEnv = process.env): RuntimeMode {
  const explicit = env.BASEGRID_RUNTIME_MODE?.trim().toLowerCase();
  if (explicit === "production") return "production";
  if (explicit === "ai-studio" || explicit === "aistudio" || explicit === "ai_studio") return "ai-studio";
  if (explicit === "development" || explicit === "dev") return "development";
  if (explicit === "test") return "test";

  const nodeEnv = env.NODE_ENV?.trim().toLowerCase();

  if (nodeEnv === "test") {
    return "test";
  }

  if (nodeEnv === "development" || !nodeEnv) {
    return "development";
  }

  if (nodeEnv === "production") {
    // Restrictive auto-detection for Google AI Studio Cloud Run preview/share container
    const isCloudRun = Boolean(env.K_SERVICE || env.K_REVISION || env.K_CONFIGURATION);
    const hasNoDatabase = !env.DATABASE_URL || env.DATABASE_URL.trim() === "";
    const hasNoRedis = !env.REDIS_URL || env.REDIS_URL.trim() === "";
    const hasAiStudioIndicator = Boolean(
      env.GEMINI_API_KEY ||
      env.GOOGLE_AI_STUDIO_APPLET_ID ||
      env.AI_STUDIO_APPLET_ID ||
      env.AIS_APPLET_ID
    );

    if (isCloudRun && hasNoDatabase && hasNoRedis && hasAiStudioIndicator) {
      return "ai-studio";
    }

    return "production";
  }

  return "development";
}
