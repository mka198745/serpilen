-- Append-only refund allocation fences. They intentionally do not reference live
-- orders/items: an approved future deletion must not erase the anti-replay evidence.
CREATE TABLE `deleted_refund_guards` (
 `return_id` integer PRIMARY KEY NOT NULL,
 `order_id` integer NOT NULL,
 `refund_cents` integer NOT NULL CHECK (`refund_cents` >= 0),
 `created_at` integer NOT NULL DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE INDEX `deleted_refund_guards_order_idx` ON `deleted_refund_guards` (`order_id`);
--> statement-breakpoint
CREATE TABLE `deleted_refund_guard_items` (
 `return_id` integer NOT NULL REFERENCES `deleted_refund_guards`(`return_id`) ON DELETE RESTRICT,
 `order_item_id` integer NOT NULL,
 `quantity` integer NOT NULL CHECK (`quantity` > 0),
 `refund_cents` integer NOT NULL CHECK (`refund_cents` >= 0),
 PRIMARY KEY (`return_id`,`order_item_id`)
);
--> statement-breakpoint
CREATE INDEX `deleted_refund_guard_items_order_item_idx` ON `deleted_refund_guard_items` (`order_item_id`,`return_id`);
--> statement-breakpoint
CREATE TRIGGER `deleted_refund_guards_no_update` BEFORE UPDATE ON `deleted_refund_guards` BEGIN SELECT RAISE(ABORT,'refund_guard_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `deleted_refund_guards_no_delete` BEFORE DELETE ON `deleted_refund_guards` BEGIN SELECT RAISE(ABORT,'refund_guard_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `deleted_refund_guard_items_no_update` BEFORE UPDATE ON `deleted_refund_guard_items` BEGIN SELECT RAISE(ABORT,'refund_guard_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `deleted_refund_guard_items_no_delete` BEFORE DELETE ON `deleted_refund_guard_items` BEGIN SELECT RAISE(ABORT,'refund_guard_immutable'); END;
--> statement-breakpoint
-- Physical deletion of a completed refund is forbidden unless its exact
-- allocation is already fenced in the same transaction.
CREATE TRIGGER `completed_refund_delete_requires_guard` BEFORE DELETE ON `order_returns`
WHEN OLD.status='REFUNDED' AND (
 NOT EXISTS (SELECT 1 FROM deleted_refund_guards g WHERE g.return_id=OLD.id AND g.order_id=OLD.order_id AND g.refund_cents=CAST(ROUND(CAST(OLD.refund_amount AS REAL)*100) AS INTEGER))
 OR NOT EXISTS (SELECT 1 FROM deleted_refund_guard_items WHERE return_id=OLD.id)
 OR (SELECT COALESCE(SUM(refund_cents),0) FROM deleted_refund_guard_items WHERE return_id=OLD.id) <> CAST(ROUND(CAST(OLD.refund_amount AS REAL)*100) AS INTEGER)
 OR EXISTS (SELECT 1 FROM order_return_items i WHERE i.return_id=OLD.id AND NOT EXISTS (SELECT 1 FROM deleted_refund_guard_items g WHERE g.return_id=OLD.id AND g.order_item_id=i.order_item_id AND g.quantity=i.quantity AND g.refund_cents=CAST(ROUND(CAST(i.refund_amount AS REAL)*100) AS INTEGER)))
 OR (SELECT COUNT(*) FROM order_return_items WHERE return_id=OLD.id) <> (SELECT COUNT(*) FROM deleted_refund_guard_items WHERE return_id=OLD.id)
)
BEGIN SELECT RAISE(ABORT,'completed_refund_guard_required'); END;
--> statement-breakpoint
CREATE TRIGGER `completed_refund_item_delete_requires_guard` BEFORE DELETE ON `order_return_items`
WHEN EXISTS (SELECT 1 FROM order_returns r WHERE r.id=OLD.return_id AND r.status='REFUNDED')
BEGIN SELECT RAISE(ABORT,'completed_refund_delete_header_first'); END;
--> statement-breakpoint
CREATE TRIGGER `completed_refund_no_update` BEFORE UPDATE ON `order_returns` WHEN OLD.status='REFUNDED' BEGIN SELECT RAISE(ABORT,'completed_refund_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `completed_refund_item_no_update` BEFORE UPDATE ON `order_return_items` WHEN EXISTS (SELECT 1 FROM order_returns WHERE id=OLD.return_id AND status='REFUNDED') BEGIN SELECT RAISE(ABORT,'completed_refund_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `deleted_refund_guard_header_source` BEFORE INSERT ON `deleted_refund_guards`
WHEN NOT EXISTS (SELECT 1 FROM order_returns r WHERE r.id=NEW.return_id AND r.order_id=NEW.order_id AND r.status='REFUNDED' AND CAST(ROUND(CAST(r.refund_amount AS REAL)*100) AS INTEGER)=NEW.refund_cents)
BEGIN SELECT RAISE(ABORT,'refund_guard_source_invalid'); END;
--> statement-breakpoint
CREATE TRIGGER `deleted_refund_guard_item_source` BEFORE INSERT ON `deleted_refund_guard_items`
WHEN NOT EXISTS (SELECT 1 FROM order_return_items i JOIN order_returns r ON r.id=i.return_id JOIN deleted_refund_guards g ON g.return_id=r.id WHERE r.status='REFUNDED' AND i.return_id=NEW.return_id AND i.order_item_id=NEW.order_item_id AND i.quantity=NEW.quantity AND CAST(ROUND(CAST(i.refund_amount AS REAL)*100) AS INTEGER)=NEW.refund_cents)
BEGIN SELECT RAISE(ABORT,'refund_guard_source_invalid'); END;
--> statement-breakpoint
-- Completed POS request keys are permanent anti-replay fences. Do not delete or
-- rewrite them even if a future authorized workflow deletes the order record.
CREATE TRIGGER `pos_sale_requests_no_update` BEFORE UPDATE ON `pos_sale_requests` BEGIN SELECT RAISE(ABORT,'pos_request_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `pos_sale_requests_no_delete` BEFORE DELETE ON `pos_sale_requests` BEGIN SELECT RAISE(ABORT,'pos_request_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `completed_pos_intents_no_update` BEFORE UPDATE ON `pos_sale_intents` WHEN OLD.status='COMPLETED' BEGIN SELECT RAISE(ABORT,'completed_pos_intent_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `completed_pos_intents_no_delete` BEFORE DELETE ON `pos_sale_intents` WHEN OLD.status='COMPLETED' BEGIN SELECT RAISE(ABORT,'completed_pos_intent_immutable'); END;
--> statement-breakpoint
-- SQLite REPLACE may delete conflicting rows without firing delete triggers
-- when recursive_triggers is off. Guard the insert side as well.
CREATE TRIGGER `deleted_refund_guards_no_replace` BEFORE INSERT ON `deleted_refund_guards`
WHEN EXISTS (SELECT 1 FROM deleted_refund_guards WHERE return_id=NEW.return_id)
BEGIN SELECT RAISE(ABORT,'refund_guard_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `deleted_refund_guard_items_no_replace` BEFORE INSERT ON `deleted_refund_guard_items`
WHEN EXISTS (SELECT 1 FROM deleted_refund_guard_items WHERE return_id=NEW.return_id AND order_item_id=NEW.order_item_id)
BEGIN SELECT RAISE(ABORT,'refund_guard_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `completed_refund_no_replace` BEFORE INSERT ON `order_returns`
WHEN EXISTS (SELECT 1 FROM order_returns WHERE status='REFUNDED' AND (id=NEW.id OR return_number=NEW.return_number))
 OR EXISTS (SELECT 1 FROM deleted_refund_guards WHERE return_id=NEW.id)
BEGIN SELECT RAISE(ABORT,'completed_refund_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `completed_refund_item_no_insert` BEFORE INSERT ON `order_return_items`
WHEN EXISTS (SELECT 1 FROM order_returns WHERE id=NEW.return_id AND status='REFUNDED')
 OR EXISTS (SELECT 1 FROM deleted_refund_guards WHERE return_id=NEW.return_id)
 OR EXISTS (SELECT 1 FROM order_return_items i JOIN order_returns r ON r.id=i.return_id WHERE i.id=NEW.id AND r.status='REFUNDED')
BEGIN SELECT RAISE(ABORT,'completed_refund_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `pos_sale_requests_no_replace` BEFORE INSERT ON `pos_sale_requests`
WHEN EXISTS (SELECT 1 FROM pos_sale_requests WHERE request_key=NEW.request_key OR order_id=NEW.order_id)
BEGIN SELECT RAISE(ABORT,'pos_request_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `completed_pos_intents_no_replace` BEFORE INSERT ON `pos_sale_intents`
WHEN EXISTS (SELECT 1 FROM pos_sale_intents WHERE request_key=NEW.request_key AND status='COMPLETED')
BEGIN SELECT RAISE(ABORT,'completed_pos_intent_immutable'); END;
