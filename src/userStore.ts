// src/userStore.ts
import { User } from "./models";

const users = new Map<string, User>(); // key by id
const usersByPhone = new Map<string, User>(); // key by phone

export function saveUser(user: User): void {
  users.set(user.id, user);
  usersByPhone.set(user.phone, user);
}

export function findUserByPhone(phone: string): User | undefined {
  return usersByPhone.get(phone);
}

export function updateUser(user: User): void {
  user.updatedAt = new Date();
  saveUser(user);
}

export function getActiveUsers(): User[] {
  return Array.from(users.values()).filter(
    (u) => u.status === "active" && u.verified
  );
}
