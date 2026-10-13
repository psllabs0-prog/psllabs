import type { ProductSpecification } from "@/lib/products";
import { cn } from "@/lib/utils";
import styles from "./product-details.module.css";

type ProductSpecificationsTableProps = {
  specifications: ProductSpecification[];
  className?: string;
};

export function ProductSpecificationsTable({
  specifications,
  className,
}: ProductSpecificationsTableProps) {
  return (
    <div className={cn(styles.specifications, className)}>
      <table>
        <caption className="sr-only">Technical specifications</caption>
        <tbody>
          {specifications.map((spec) => (
            <tr key={spec.label}>
              <th scope="row">{spec.label}</th>
              <td>{spec.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
