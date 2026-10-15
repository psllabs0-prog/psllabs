import { getResearchAuth, type createResearchAuth } from "./auth";
import { getSessionCookie } from "better-auth/cookies";
import { RESEARCH_COOKIE_PREFIX } from "./auth";
import { hasResearchQualification, isResearchStatus, type ResearchStatus } from "./qualification";

export type ResearchAccount = { id: string; email: string; researchStatus: ResearchStatus };

/** No cookie cache: revoked/expired sessions cannot unlock HTML, RSC, metadata or checkout. */
export function createResearchAccountReader(loadAuth: () => ReturnType<typeof createResearchAuth> = getResearchAuth) {
  return async function readAccount(request: Request | Headers): Promise<ResearchAccount | null> {
  if (!getSessionCookie(request, { cookiePrefix: RESEARCH_COOKIE_PREFIX })) return null;
  try {
    const session = await loadAuth().api.getSession({
      headers: request instanceof Headers ? request : request.headers,
      query: { disableCookieCache: true, disableRefresh: true },
    });
    const user = session?.user;
    if (!user || !hasResearchQualification(user) || !isResearchStatus(user.researchStatus) ||
        !user.id || !user.email) return null;
    return { id: user.id, email: user.email, researchStatus: user.researchStatus };
  } catch {
    // Authentication or storage failures never fall back to the former browser-only gate.
    return null;
  }
  };
}

export const getResearchAccount = createResearchAccountReader();
