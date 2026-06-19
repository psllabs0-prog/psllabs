import fs from "fs";
import path from "path";

import matter from "gray-matter";

import type { ScienceArticleMeta } from "./types";

const SCIENCE_DIR = path.join(process.cwd(), "content/science");

export function getScienceSlugs(): string[] {
  if (!fs.existsSync(SCIENCE_DIR)) return [];

  return fs
    .readdirSync(SCIENCE_DIR)
    .filter((file) => file.endsWith(".mdx"))
    .map((file) => file.replace(/\.mdx$/, ""));
}

export function getScienceArticles(): ScienceArticleMeta[] {
  return getScienceSlugs()
    .map((slug) => getScienceArticleMeta(slug))
    .filter((article): article is ScienceArticleMeta => article !== null)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function getScienceArticleMeta(
  slug: string
): ScienceArticleMeta | null {
  const filePath = path.join(SCIENCE_DIR, `${slug}.mdx`);
  if (!fs.existsSync(filePath)) return null;

  const { data } = matter(fs.readFileSync(filePath, "utf8"));

  return {
    slug,
    title: (data.title as string) ?? slug,
    description: (data.description as string) ?? "",
    date: (data.date as string) ?? "",
    category: (data.category as string) ?? "Research",
    readTime: (data.readTime as string) ?? "5 min read",
  };
}

export function getScienceArticleSource(slug: string): string | null {
  const filePath = path.join(SCIENCE_DIR, `${slug}.mdx`);
  if (!fs.existsSync(filePath)) return null;

  const { content } = matter(fs.readFileSync(filePath, "utf8"));
  return content;
}
