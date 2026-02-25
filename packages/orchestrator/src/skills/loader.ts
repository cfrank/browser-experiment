import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";
import { type Skill, domainSegments } from "@browser-experiment/shared";

export class SkillLoader {
  constructor(private skillsDir: string) {}

  resolve(hostname: string): Skill[] {
    if (!hostname || !existsSync(this.skillsDir)) return [];

    const segments = domainSegments(hostname);
    const skillMap = new Map<string, Skill>();

    for (let i = segments.length - 1; i >= 0; i--) {
      const domain = segments[i];
      const domainDir = join(this.skillsDir, domain);

      if (!existsSync(domainDir)) continue;

      try {
        const entries = readdirSync(domainDir, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          const skillFile = join(domainDir, entry.name, "SKILL.md");
          if (!existsSync(skillFile)) continue;

          const content = readFileSync(skillFile, "utf-8");
          skillMap.set(entry.name, {
            name: entry.name,
            domain,
            content,
            path: skillFile,
          });
        }
      } catch {
        // skip unreadable directories
      }
    }

    return Array.from(skillMap.values());
  }
}
