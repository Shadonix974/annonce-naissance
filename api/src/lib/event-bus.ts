import { EventEmitter } from "node:events";

export type GiftEvent =
  | { type: "gift.reserved";    id: string; taken_by: string; taken_note: string | null; taken_at: string }
  | { type: "gift.unreserved";  id: string }
  | { type: "gift.created";     gift: unknown }
  | { type: "gift.updated";     gift: unknown }
  | { type: "gift.deleted";     id: string };

class Bus extends EventEmitter {
  emitGift(e: GiftEvent): void { this.emit("gift", e); }
  onGift(cb: (e: GiftEvent) => void): () => void {
    this.on("gift", cb);
    return () => this.off("gift", cb);
  }
}

export const bus = new Bus().setMaxListeners(200);
