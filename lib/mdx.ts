import { compileMDX } from "next-mdx-remote/rsc";
import type { MDXComponents } from "mdx/types";

import { useMDXComponents as getMdxComponents } from "@/mdx-components";

type MarkdownNode = { type: string; depth?: number; children?: MarkdownNode[] };

/** Group parsed blocks, so heading-like text inside code blocks stays untouched. */
function sectionGroups(componentName: string) {
  return function remarkSectionGroups() {
    return function transform(tree: { children: MarkdownNode[] }) {
      const groups: MarkdownNode[][] = [];
      for (const node of tree.children) {
        if (groups.length === 0 || (node.type === "heading" && node.depth === 2)) {
          groups.push([]);
        }
        groups[groups.length - 1].push(node);
      }
      tree.children = groups.map((children) => ({
        type: "mdxJsxFlowElement",
        name: componentName,
        attributes: [],
        children,
      }));
    };
  };
}

export async function compileMdxContent(
  source: string,
  overrides: MDXComponents = {},
  sectionComponent?: string,
) {
  // This is a pure component-map factory; it does not use React hooks.
  const components = getMdxComponents(overrides);

  return compileMDX({
    source,
    components,
    options: sectionComponent ? {
      mdxOptions: { remarkPlugins: [sectionGroups(sectionComponent)] },
    } : undefined,
  });
}
