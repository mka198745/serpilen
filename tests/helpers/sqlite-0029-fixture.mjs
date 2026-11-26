// Test-only rollback of empty 0030 objects to rehearse historically pinned 0029 releases.
// Never use on production or a DB containing guard records.
export function useHistorical0029(db) {
  for (const table of ['deleted_refund_guard_items','deleted_refund_guards']) {
    if (db.prepare(`SELECT count(*) n FROM ${table}`).get().n !== 0) throw Error('Cannot discard non-empty guard history.');
  }
  for (const name of ['deleted_refund_guards_no_update','deleted_refund_guards_no_delete','deleted_refund_guard_items_no_update','deleted_refund_guard_items_no_delete','completed_refund_delete_requires_guard','completed_refund_item_delete_requires_guard','completed_refund_no_update','completed_refund_item_no_update','deleted_refund_guard_header_source','deleted_refund_guard_item_source','pos_sale_requests_no_update','pos_sale_requests_no_delete','completed_pos_intents_no_update','completed_pos_intents_no_delete','deleted_refund_guards_no_replace','deleted_refund_guard_items_no_replace','completed_refund_no_replace','completed_refund_item_no_insert','pos_sale_requests_no_replace','completed_pos_intents_no_replace']) db.exec(`DROP TRIGGER IF EXISTS "${name}"`);
  db.exec("DROP TABLE deleted_refund_guard_items; DROP TABLE deleted_refund_guards; DELETE FROM __migrations WHERE tag='0030_refund_replay_guards'");
}
