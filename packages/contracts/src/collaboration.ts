import { z } from "zod";
import { agentRequestSchema } from "./agents.js";

export const collaborationRoomSchema = z
  .object({
    title: z.string().trim().min(1).max(100),
    world: z.string().uuid().optional(),
  })
  .strict();
export const collaborationTurnSchema = z
  .object({
    requestId: z.string().uuid(),
    resident: agentRequestSchema.pick({ speakerId: true }),
    instruction: z.string().trim().min(1).max(2000),
    runnerId: z.string().uuid().nullable(),
  })
  .strict();
export const runnerDeviceSchema = z
  .object({ name: z.string().trim().min(1).max(60) })
  .strict();
const lease = { taskId: z.string().uuid(), leaseId: z.string().uuid() };
export const runnerMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("claim") }).strict(),
  z.object({ type: z.literal("heartbeat"), ...lease }).strict(),
  z
    .object({
      type: z.literal("complete"),
      ...lease,
      output: z.string().trim().min(1).max(12000),
    })
    .strict(),
  z.object({ type: z.literal("failed"), ...lease }).strict(),
]);
export type RunnerMessage = z.infer<typeof runnerMessageSchema>;
export type CollaborationTask = {
  id: string;
  roomId: string;
  speakerKey: string;
  residentName: string;
  instruction: string;
  output: string;
  runnerId: string | null;
  status:
    | "queued"
    | "running"
    | "review"
    | "accepted"
    | "rejected"
    | "cancelled"
    | "unknown"
    | "failed";
  createdAt: string;
};
export type CollaborationRoom = {
  id: string;
  title: string;
  world: string | null;
};
export type RunnerDevice = {
  id: string;
  name: string;
  lastSeenAt: string | null;
  expiresAt: string;
  revoked: boolean;
};
export type RunnerAssignment = {
  taskId: string;
  leaseId: string;
  prompt: string;
  expiresAt: string;
};
