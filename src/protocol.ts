export type Version = "proto/v1";

export type Command =
  | { id: string; v: Version; type: "add_marker"; args: { at?: string; name?: string; color?: string; comment?: string } }
  | { id: string; v: Version; type: "insert_clip"; args: { path: string; at?: string; track?: number; ripple?: boolean } };

export type CommandAck =
  | { id: string; ok: true; result?: unknown }
  | { id: string; ok: false; error: string };

export type EventEnvelope =
  | { v: Version; type: "checkpoint"; payload: any }
  | { v: Version; type: "sequence_changed"; payload: { seqName: string | null; ts: number } };

