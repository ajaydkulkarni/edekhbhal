export type Membership = {
  organizationId: string;
  organizationName: string;
  organizationLogoUrl: string | null;
  timezone: string;
  role: "USER";
};

export type Evidence = {
  id: string;
  type: "PHOTO" | "VIDEO";
  mimeType: string;
  sizeBytes: number | null;
  capturedAt: string;
  storagePath: string;
};

export type ExecutionNote = {
  id: string;
  note: string;
  createdAt: string;
  createdBy: string;
};

export type OccurrenceTask = {
  id: string;
  sourceTaskId: string;
  sequence: number;
  name: string;
  descriptionHtml: string;
  plannedDurationMinutes: number;
  plannedStartAt: string;
  plannedEndAt: string;
  evidenceRule: "NONE" | "PHOTO" | "VIDEO" | "RANDOM";
  evidenceRequired: boolean;
  evidenceTypeRequired: "PHOTO" | "VIDEO" | "EITHER" | null;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "SKIPPED" | "FAILED" | "MISSED";
  actualStartAt: string | null;
  actualEndAt: string | null;
  actualDurationSeconds: number | null;
  evidence: Evidence[];
  notes: ExecutionNote[];
};

export type Occurrence = {
  id: string;
  scheduleId: string;
  scheduleName: string;
  workAreaId: string;
  workAreaName: string;
  propertyId: string;
  propertyName: string;
  scheduledStartAt: string;
  scheduledEndAt: string;
  timezone: string;
  plannedDurationMinutes: number;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "PARTIALLY_COMPLETED" | "MISSED" | "CANCELED";
  assignedUserId: string | null;
  claimedAt: string | null;
  claimExpiresAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  actualDurationSeconds: number | null;
  taskCount: number;
  completedTaskCount: number;
  currentTaskId: string | null;
  tasks: OccurrenceTask[];
  notes: ExecutionNote[];
};
