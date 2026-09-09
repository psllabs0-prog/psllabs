type Column = {
  key: string;
  header: string;
  className?: string;
};

type Row = Record<string, React.ReactNode>;

type ComparisonTableProps = {
  columns: Column[];
  rows: Row[];
  caption?: string;
  className?: string;
};

export function ComparisonTable({
  columns,
  rows,
  caption,
  className = "",
}: ComparisonTableProps) {
  return (
    <div
      className={`overflow-hidden rounded-xl border border-linen bg-surface ${className}`}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm border-collapse">
          {caption && (
            <caption className="sr-only">{caption}</caption>
          )}
          <thead className="border-b border-linen bg-paper/60 text-xs font-mono uppercase tracking-wider text-ash">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className={`px-4 py-3.5 font-semibold ${col.className ?? ""}`}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-linen/70 text-ink">
            {rows.map((row, rowIndex) => (
              <tr
                key={rowIndex}
                className="transition-colors hover:bg-paper/40"
              >
                {columns.map((col, colIndex) => (
                  <td
                    key={col.key}
                    className={`px-4 py-3.5 align-top leading-relaxed ${
                      colIndex === 0
                        ? "font-medium text-ink"
                        : "text-ash"
                    } ${col.className ?? ""}`}
                  >
                    {row[col.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
