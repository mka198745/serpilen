/** Existing notes start at revision 1; only the latest edit metadata is retained. */
export const crmNoteColumns = `n.id,n.body,n.created_by_name AS createdByName,n.created_at AS createdAt,
  coalesce(e.revision,1) AS revision,e.updated_by_name AS updatedByName,e.updated_at AS updatedAt`;
export const crmNoteFrom = `crm_customer_notes n LEFT JOIN crm_note_edit_state e ON e.note_id=n.id`;
