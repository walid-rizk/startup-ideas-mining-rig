import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import type { Skill, SkillName, SkillMeta } from "./types";

const SKILLS_ROOT = path.join(process.cwd(), "skills");

const cache = new Map<SkillName, Skill>();

export async function loadSkill(name: SkillName): Promise<Skill> {
  const hit = cache.get(name);
  if (hit) return hit;

  const filePath = path.join(SKILLS_ROOT, name, "SKILL.md");
  const raw = await fs.readFile(filePath, "utf8");
  const { data, content } = matter(raw);

  const frontmatter: SkillMeta = {
    name: data.name,
    display_name: data.display_name,
    icon: data.icon,
    color: data.color,
    version: data.version,
    phase: data.phase,
    capabilities: Array.isArray(data.capabilities) ? data.capabilities : [],
    output_format: data.output_format ?? "markdown",
  };

  if (frontmatter.name !== name) {
    throw new Error(
      `Skill file ${filePath} has name="${frontmatter.name}" but was loaded as "${name}"`,
    );
  }

  const skill: Skill = {
    name,
    frontmatter,
    systemPrompt: content.trim(),
  };

  cache.set(name, skill);
  return skill;
}

export async function loadAllSkills(): Promise<Skill[]> {
  const names: SkillName[] = [
    "interviewer",
    "thesis-builder",
    "futurist",
    "vc-partner",
    "data-miner",
    "stress-tester",
    "product-manager",
    "cto",
    "synthesizer",
  ];
  return Promise.all(names.map(loadSkill));
}
