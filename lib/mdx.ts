import { compileMDX } from "next-mdx-remote/rsc";

import { useMDXComponents } from "@/mdx-components";

export async function compileMdxContent(source: string) {
  const components = useMDXComponents({});

  return compileMDX({
    source,
    components,
  });
}
