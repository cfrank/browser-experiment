export interface Skill {
  name: string;
  domain: string;
  content: string;
  path: string;
}

export interface ResolvedSkills {
  domain: string;
  skills: Skill[];
}

/**
 * Decompose a hostname into domain segments from most specific to least.
 * e.g. "beta.finance.google.com" -> ["beta.finance.google.com", "finance.google.com", "google.com"]
 */
export function domainSegments(hostname: string): string[] {
  const parts = hostname.split(".");
  const segments: string[] = [];

  for (let i = 0; i < parts.length - 1; i++) {
    segments.push(parts.slice(i).join("."));
  }

  return segments;
}
