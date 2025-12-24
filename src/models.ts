// src/models.ts
import { AddressParams } from "./cityClient";

export type UserStatus = "pending_confirm" | "active" | "unsubscribed";

export interface ConsentLog {
  consentChecked: boolean;
  sourceUrl: string;
  submittedAt: Date;
  confirmedAt?: Date | null;
}

export interface User {
  id: string; // uuid, string id, whatever
  phone: string; // E.164, e.g. "+14145551234"
  address: AddressParams; // the params we already use
  status: UserStatus; // "pending_confirm" until verified
  verified: boolean; // true after code is confirmed
  consent: ConsentLog;
  createdAt: Date;
  updatedAt: Date;
}
