export type ApiSuccess<T> = { ok: true; data: T };
export type ApiError = { ok: false; error: string; details?: unknown };
export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export type Id = string;

export type AuditSeverity = "low" | "medium" | "high";
export type SyncStatus = "pending" | "success" | "failed";

export type HealthPayload = {
  ok: true;
  service: string;
  version: string;
};
