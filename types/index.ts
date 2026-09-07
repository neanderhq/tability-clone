import type { DefaultSession } from "@auth/core/types";

export type {
  CheckIn,
  Cycle,
  KeyResult,
  Objective,
  Organization,
  Task,
  User,
  Workspace,
} from "@prisma/client";

export type ApiError = {
  error: string;
  details?: unknown;
};

export type ApiListResponse<TItem> = {
  data: TItem[];
};

export type ApiItemResponse<TItem> = {
  data: TItem;
};

export type ObjectiveProgress = {
  objectiveId: string;
  progress: number;
  status: "NOT_STARTED" | "ON_TRACK" | "AT_RISK" | "OFF_TRACK" | "COMPLETED";
};

declare module "@auth/core/types" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id?: string;
  }
}
