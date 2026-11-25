-- Reject new references to missing warehouses, including writes racing a deletion. Existing history is not modified.
CREATE TRIGGER IF NOT EXISTS "warehouse_guard_goods_receipts_insert" BEFORE INSERT ON "goods_receipts" WHEN (NEW."warehouse_id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM warehouses WHERE id=NEW."warehouse_id")) BEGIN SELECT RAISE(ABORT, 'warehouse_not_found'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS "warehouse_guard_goods_receipts_update" BEFORE UPDATE OF "warehouse_id" ON "goods_receipts" WHEN (NEW."warehouse_id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM warehouses WHERE id=NEW."warehouse_id")) BEGIN SELECT RAISE(ABORT, 'warehouse_not_found'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS "warehouse_guard_inventory_insert" BEFORE INSERT ON "inventory" WHEN (NEW."warehouse_id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM warehouses WHERE id=NEW."warehouse_id")) BEGIN SELECT RAISE(ABORT, 'warehouse_not_found'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS "warehouse_guard_inventory_update" BEFORE UPDATE OF "warehouse_id" ON "inventory" WHEN (NEW."warehouse_id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM warehouses WHERE id=NEW."warehouse_id")) BEGIN SELECT RAISE(ABORT, 'warehouse_not_found'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS "warehouse_guard_inventory_ledger_insert" BEFORE INSERT ON "inventory_ledger" WHEN (NEW."warehouse_id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM warehouses WHERE id=NEW."warehouse_id")) BEGIN SELECT RAISE(ABORT, 'warehouse_not_found'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS "warehouse_guard_inventory_ledger_update" BEFORE UPDATE OF "warehouse_id" ON "inventory_ledger" WHEN (NEW."warehouse_id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM warehouses WHERE id=NEW."warehouse_id")) BEGIN SELECT RAISE(ABORT, 'warehouse_not_found'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS "warehouse_guard_inventory_reservations_insert" BEFORE INSERT ON "inventory_reservations" WHEN (NEW."warehouse_id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM warehouses WHERE id=NEW."warehouse_id")) BEGIN SELECT RAISE(ABORT, 'warehouse_not_found'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS "warehouse_guard_inventory_reservations_update" BEFORE UPDATE OF "warehouse_id" ON "inventory_reservations" WHEN (NEW."warehouse_id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM warehouses WHERE id=NEW."warehouse_id")) BEGIN SELECT RAISE(ABORT, 'warehouse_not_found'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS "warehouse_guard_order_returns_insert" BEFORE INSERT ON "order_returns" WHEN (NEW."warehouse_id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM warehouses WHERE id=NEW."warehouse_id")) BEGIN SELECT RAISE(ABORT, 'warehouse_not_found'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS "warehouse_guard_order_returns_update" BEFORE UPDATE OF "warehouse_id" ON "order_returns" WHEN (NEW."warehouse_id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM warehouses WHERE id=NEW."warehouse_id")) BEGIN SELECT RAISE(ABORT, 'warehouse_not_found'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS "warehouse_guard_pos_cash_transactions_insert" BEFORE INSERT ON "pos_cash_transactions" WHEN (NEW."warehouse_id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM warehouses WHERE id=NEW."warehouse_id")) BEGIN SELECT RAISE(ABORT, 'warehouse_not_found'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS "warehouse_guard_pos_cash_transactions_update" BEFORE UPDATE OF "warehouse_id" ON "pos_cash_transactions" WHEN (NEW."warehouse_id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM warehouses WHERE id=NEW."warehouse_id")) BEGIN SELECT RAISE(ABORT, 'warehouse_not_found'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS "warehouse_guard_pos_shifts_insert" BEFORE INSERT ON "pos_shifts" WHEN (NEW."warehouse_id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM warehouses WHERE id=NEW."warehouse_id")) BEGIN SELECT RAISE(ABORT, 'warehouse_not_found'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS "warehouse_guard_pos_shifts_update" BEFORE UPDATE OF "warehouse_id" ON "pos_shifts" WHEN (NEW."warehouse_id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM warehouses WHERE id=NEW."warehouse_id")) BEGIN SELECT RAISE(ABORT, 'warehouse_not_found'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS "warehouse_guard_purchase_orders_insert" BEFORE INSERT ON "purchase_orders" WHEN (NEW."warehouse_id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM warehouses WHERE id=NEW."warehouse_id")) BEGIN SELECT RAISE(ABORT, 'warehouse_not_found'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS "warehouse_guard_purchase_orders_update" BEFORE UPDATE OF "warehouse_id" ON "purchase_orders" WHEN (NEW."warehouse_id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM warehouses WHERE id=NEW."warehouse_id")) BEGIN SELECT RAISE(ABORT, 'warehouse_not_found'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS "warehouse_guard_purchase_requests_insert" BEFORE INSERT ON "purchase_requests" WHEN (NEW."warehouse_id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM warehouses WHERE id=NEW."warehouse_id")) BEGIN SELECT RAISE(ABORT, 'warehouse_not_found'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS "warehouse_guard_purchase_requests_update" BEFORE UPDATE OF "warehouse_id" ON "purchase_requests" WHEN (NEW."warehouse_id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM warehouses WHERE id=NEW."warehouse_id")) BEGIN SELECT RAISE(ABORT, 'warehouse_not_found'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS "warehouse_guard_stock_count_sessions_insert" BEFORE INSERT ON "stock_count_sessions" WHEN (NEW."warehouse_id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM warehouses WHERE id=NEW."warehouse_id")) BEGIN SELECT RAISE(ABORT, 'warehouse_not_found'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS "warehouse_guard_stock_count_sessions_update" BEFORE UPDATE OF "warehouse_id" ON "stock_count_sessions" WHEN (NEW."warehouse_id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM warehouses WHERE id=NEW."warehouse_id")) BEGIN SELECT RAISE(ABORT, 'warehouse_not_found'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS "warehouse_guard_stock_transfers_insert" BEFORE INSERT ON "stock_transfers" WHEN (NEW."from_warehouse_id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM warehouses WHERE id=NEW."from_warehouse_id")) OR (NEW."to_warehouse_id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM warehouses WHERE id=NEW."to_warehouse_id")) BEGIN SELECT RAISE(ABORT, 'warehouse_not_found'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS "warehouse_guard_stock_transfers_update" BEFORE UPDATE OF "from_warehouse_id", "to_warehouse_id" ON "stock_transfers" WHEN (NEW."from_warehouse_id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM warehouses WHERE id=NEW."from_warehouse_id")) OR (NEW."to_warehouse_id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM warehouses WHERE id=NEW."to_warehouse_id")) BEGIN SELECT RAISE(ABORT, 'warehouse_not_found'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS "warehouse_guard_warehouse_locations_insert" BEFORE INSERT ON "warehouse_locations" WHEN (NEW."warehouse_id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM warehouses WHERE id=NEW."warehouse_id")) BEGIN SELECT RAISE(ABORT, 'warehouse_not_found'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS "warehouse_guard_warehouse_locations_update" BEFORE UPDATE OF "warehouse_id" ON "warehouse_locations" WHEN (NEW."warehouse_id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM warehouses WHERE id=NEW."warehouse_id")) BEGIN SELECT RAISE(ABORT, 'warehouse_not_found'); END;
--> statement-breakpoint
