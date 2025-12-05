// src/models.ts
import { AddressParams } from "./cityClient";

export type UserStatus = "pending" | "active" | "cancelled";

export interface User {
  id: string; // uuid, string id, whatever
  phone: string; // E.164, e.g. "+14145551234"
  address: AddressParams; // the params we already use
  status: UserStatus; // "pending" until verified
  verified: boolean; // true after code is confirmed
  createdAt: Date;
  updatedAt: Date;
}
