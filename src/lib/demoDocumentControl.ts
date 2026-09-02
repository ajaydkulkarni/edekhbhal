const DEMO_DOCUMENT_CONTROL: Record<string, { documentReference: string; documentRevision: string }> = {
  "hotel-room-turn": { documentReference: "HSP-HK-CHK-014", documentRevision: "Rev 05" },
  "hotel-lobby-open": { documentReference: "HSP-FO-CHK-003", documentRevision: "Rev 02" },
  "hotel-kitchen-close": { documentReference: "HSP-FB-SOP-011", documentRevision: "Rev 04" },
  "lot-butter-chicken": { documentReference: "FS-QMS-PRD-021", documentRevision: "Rev 04" },
  "lot-delight-cookies": { documentReference: "FS-QMS-BAK-017", documentRevision: "Rev 03" },
  "boiler-pm-weekly": { documentReference: "ENG-PM-BLR-007", documentRevision: "Rev 06" },
  "compressor-pm-monthly": { documentReference: "ENG-PM-AIR-004", documentRevision: "Rev 03" },
  "packaging-breakdown": { documentReference: "ENG-BD-RSP-002", documentRevision: "Rev 02" },
  "hq-meeting-readiness": { documentReference: "FAC-OPS-CHK-009", documentRevision: "Rev 04" },
  "hq-pantry": { documentReference: "FAC-HYG-CHK-006", documentRevision: "Rev 03" },
};
export function getDemoDocumentControl(scheduleId: string) {
  return DEMO_DOCUMENT_CONTROL[scheduleId] ?? { documentReference: "DEMO-QMS-CHK-001", documentRevision: "Rev 01" };
}
