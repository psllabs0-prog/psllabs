/**
 * JSON-LD script tag for structured data.
 * Validate markup at https://search.google.com/test/rich-results
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
