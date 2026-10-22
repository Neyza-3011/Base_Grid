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
 *    - If NODE_ENV === "production" => "production"
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
    return "production";
  }

  return "development";
}
