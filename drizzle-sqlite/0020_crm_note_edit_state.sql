-- Not metninin eski sürümleri saklanmaz. Var olan notlar ilk değişikliğe kadar sürüm 1'dir.
CREATE TABLE IF NOT EXISTS `crm_note_edit_state` (
  `note_id` integer PRIMARY KEY NOT NULL REFERENCES `crm_customer_notes`(`id`) ON DELETE RESTRICT,
  `revision` integer NOT NULL CHECK (`revision` >= 2),
  `updated_by_id` integer NOT NULL,
  `updated_by_name` text NOT NULL,
  `updated_at` integer NOT NULL DEFAULT (unixepoch())
);
