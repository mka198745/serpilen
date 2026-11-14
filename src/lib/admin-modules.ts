/**
 * Yönetim paneli modül (sol sidebar) kayıtları ve rol × modül görünürlük
 * matrisi. İstemci tarafında da içe aktarılabilen saf modüldür (DB bağımlılığı yok).
 *
 * Kurallar:
 * - Süper Admin (SUPER_ADMIN) matrisi kilitlidir; her modülü görür, değiştirilemez.
 * - "dashboard" (Genel Bakış) tüm roller için açık kalır (kilitli taban erişim).
 * - Kalan hücreler Süper Admin tarafından matristen açılıp kapatılabilir;
 *   değişiklikler app_settings tablosunda `admin.role_matrix` anahtarında
 *   JSON olarak saklanır.
 */

export interface AdminModule {
  key: string;
  label: string;
  group: string;
}

export const ADMIN_MODULE_GROUPS = [
  "Genel",
  "Operasyon",
  "Sistem (FAZ 1)",
  "İçerik Yönetimi",
  "Site Yönetimi",
] as const;

export const ADMIN_MODULES: AdminModule[] = [
  { key: "dashboard", label: "Genel Bakış (KPI)", group: "Genel" },

  { key: "catalog", label: "Ürün & Katalog", group: "Operasyon" },
  { key: "wms", label: "Çoklu Depo & WMS", group: "Operasyon" },
  { key: "barcode", label: "Barkod & Etiket", group: "Operasyon" },
  { key: "pos", label: "POS & Kasalar", group: "Operasyon" },
  { key: "orders", label: "Siparişler", group: "Operasyon" },
  { key: "crm", label: "Müşteri CRM", group: "Operasyon" },
  { key: "purchasing", label: "Satın Alma & Mal Kabul", group: "Operasyon" },
  { key: "reports", label: "Raporlar & Analitik", group: "Operasyon" },
  { key: "coupons", label: "Pazarlama & Kampanya", group: "Operasyon" },
  { key: "ai", label: "AI Yönetim Asistanı", group: "Operasyon" },
  { key: "intelligence", label: "Intelligence Center", group: "Operasyon" },

  { key: "users", label: "Kullanıcılar & Roller", group: "Sistem (FAZ 1)" },
  { key: "registeredCustomers", label: "Kayıtlı Müşteriler", group: "Sistem (FAZ 1)" },
  { key: "roleMatrix", label: "Rol Yetki Matrisi", group: "Sistem (FAZ 1)" },
  { key: "audit", label: "Denetim Kaydı (Audit)", group: "Sistem (FAZ 1)" },

  { key: "content", label: "İçerik Yönetimi", group: "İçerik Yönetimi" },

  { key: "siteHeader", label: "Header Ayarı", group: "Site Yönetimi" },
  { key: "siteFooter", label: "Footer Ayarı", group: "Site Yönetimi" },
  { key: "siteCart", label: "Sepetim Ayarı", group: "Site Yönetimi" },
  { key: "paymentApi", label: "Ödeme API Ayarları", group: "Site Yönetimi" },
  { key: "database", label: "Veritabanı Ayarı", group: "Site Yönetimi" },
];

export const MATRIX_ROLES = ["SUPER_ADMIN", "STORE_MANAGER", "WAREHOUSE_KEEPER", "CASHIER"] as const;
export type MatrixRole = (typeof MATRIX_ROLES)[number];

export type RoleMatrix = Record<MatrixRole, Record<string, boolean>>;

const allTrue = () => Object.fromEntries(ADMIN_MODULES.map((m) => [m.key, true]));
const fromList = (open: string[]) =>
  Object.fromEntries(ADMIN_MODULES.map((m) => [m.key, m.key === "dashboard" || open.includes(m.key)]));

/** Varsayılan görünürlük matrisi — ekranlar/etiketler güncellenirken buraya dokunulur. */
export const DEFAULT_ROLE_MATRIX: RoleMatrix = {
  SUPER_ADMIN: allTrue(),
  STORE_MANAGER: fromList([
    "catalog",
    "wms",
    "barcode",
    "pos",
    "orders",
    "crm",
    "purchasing",
    "reports",
    "coupons",
    "ai",
    "intelligence",
    "registeredCustomers",
    "content",
    "siteHeader",
    "siteFooter",
    "siteCart",
  ]),
  WAREHOUSE_KEEPER: fromList([
    "catalog",
    "wms",
    "barcode",
    "orders",
    "purchasing",
  ]),
  CASHIER: fromList([
    "pos",
    "orders",
  ]),
};

/**
 * Eksik/bozuk hücreleri varsayılanlarla tamamlar; SUPER_ADMIN ve dashboard
 * her zaman açık kalır. Hem istemcide hem API'de kullanılır.
 */
export function normalizeRoleMatrix(input: unknown): RoleMatrix {
  const src = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
  const out = {} as RoleMatrix;
  for (const role of MATRIX_ROLES) {
    const raw = (typeof src[role] === "object" && src[role] !== null ? src[role] : {}) as Record<string, unknown>;
    const row = {} as Record<string, boolean>;
    for (const mod of ADMIN_MODULES) {
      const v = raw[mod.key];
      row[mod.key] = typeof v === "boolean" ? v : DEFAULT_ROLE_MATRIX[role][mod.key];
    }
    // Kilitli hücreler
    row.dashboard = true;
    if (role === "SUPER_ADMIN") {
      for (const mod of ADMIN_MODULES) row[mod.key] = true;
    }
    out[role] = row;
  }
  return out;
}
