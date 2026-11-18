import { createHash } from "node:crypto";

export type EditableCustomer = {
  name: string;
  phone: string;
  email: string | null;
  city: string | null;
  address: string | null;
  companyName: string | null;
};

/** Optimistic concurrency: her düzenlenebilir alan, NULL ile boş metin ayrımı dahil. */
export function customerEditVersion(customer: EditableCustomer): string {
  return createHash("sha256").update(JSON.stringify([
    customer.name, customer.phone, customer.email, customer.city, customer.address, customer.companyName,
  ])).digest("hex");
}
