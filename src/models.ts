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
  id: string;
  phone: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Subscription {
  id: string;
  userId: string;
  address: AddressParams;
  status: UserStatus;
  verified: boolean;
  consent: ConsentLog;
  createdAt: Date;
  updatedAt: Date;
}

export interface Subscriber {
  userId: string;
  phone: string;
  subscriptionId: string;
  address: AddressParams;
  status: UserStatus;
  verified: boolean;
  consent: ConsentLog;
  createdAt: Date;
  updatedAt: Date;
}
