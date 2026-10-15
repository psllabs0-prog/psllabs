-- Additive, dedicated customer identities. Never applied by an ordinary page request.
-- Column names match Better Auth 1.7.8 getAuthTables() with PSL's model configuration.
CREATE TABLE IF NOT EXISTS research_auth_user (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
  "emailVerified" BOOLEAN NOT NULL DEFAULT FALSE, image TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "researchStatus" TEXT NOT NULL CHECK ("researchStatus" IN ('academic_institutional','commercial_laboratory','independent_researcher')),
  "ageConfirmed" BOOLEAN NOT NULL CHECK ("ageConfirmed" = TRUE),
  "researchUseConfirmed" BOOLEAN NOT NULL CHECK ("researchUseConfirmed" = TRUE),
  "qualificationVersion" TEXT NOT NULL, "qualifiedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS research_auth_session (
  id TEXT PRIMARY KEY, "expiresAt" TIMESTAMPTZ NOT NULL, token TEXT NOT NULL UNIQUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "ipAddress" TEXT, "userAgent" TEXT, "userId" TEXT NOT NULL REFERENCES research_auth_user(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS research_auth_session_user_idx ON research_auth_session("userId");
CREATE INDEX IF NOT EXISTS research_auth_session_expiry_idx ON research_auth_session("expiresAt");
CREATE TABLE IF NOT EXISTS research_auth_account (
  id TEXT PRIMARY KEY, "accountId" TEXT NOT NULL, "providerId" TEXT NOT NULL,
  "userId" TEXT NOT NULL REFERENCES research_auth_user(id) ON DELETE CASCADE,
  "accessToken" TEXT, "refreshToken" TEXT, "idToken" TEXT,
  "accessTokenExpiresAt" TIMESTAMPTZ, "refreshTokenExpiresAt" TIMESTAMPTZ,
  scope TEXT, password TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS research_auth_account_user_idx ON research_auth_account("userId");
CREATE TABLE IF NOT EXISTS research_auth_verification (
  id TEXT PRIMARY KEY, identifier TEXT NOT NULL, value TEXT NOT NULL, "expiresAt" TIMESTAMPTZ NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS research_auth_verification_identifier_idx ON research_auth_verification(identifier);
CREATE TABLE IF NOT EXISTS research_auth_rate_limit (
  id TEXT PRIMARY KEY, key TEXT NOT NULL UNIQUE, count INTEGER NOT NULL, "lastRequest" BIGINT NOT NULL
);
