import { pool } from "./db";
import { AddressParams } from "./cityClient";
import { Subscriber, Subscription, User, UserStatus } from "./models";

interface UserRow {
  id: string;
  phone: string;
  email: string | null;
  email_verified: boolean;
  email_verification_token: string | null;
  email_verification_token_expires_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface SubscriptionRow {
  id: string;
  user_id: string;
  laddr: string;
  sdir: string;
  sname: string;
  stype: string;
  faddr: string;
  status: UserStatus;
  verified: boolean;
  consent_checked: boolean;
  consent_source_url: string;
  consent_submitted_at: Date;
  consent_confirmed_at: Date | null;
  notify_hour: number;
  awaiting_time_pref: boolean;
  email_alerts: boolean;
  sms_alerts: boolean;
  created_at: Date;
  updated_at: Date;
}

interface SubscriberRow extends SubscriptionRow {
  phone: string;
  email: string | null;
  email_verified: boolean;
}

function mapAddress(row: SubscriptionRow): AddressParams {
  return {
    laddr: row.laddr,
    sdir: row.sdir,
    sname: row.sname,
    stype: row.stype,
    faddr: row.faddr,
  };
}

function normalizeAddress(address: AddressParams): AddressParams {
  return {
    ...address,
    sdir: address.sdir || "",
  };
}

function mapUser(row: UserRow): User {
  return {
    id: row.id,
    phone: row.phone,
    email: row.email ?? null,
    emailVerified: row.email_verified ?? false,
    emailVerificationToken: row.email_verification_token ?? null,
    emailVerificationTokenExpiresAt: row.email_verification_token_expires_at
      ? new Date(row.email_verification_token_expires_at)
      : null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function mapSubscription(row: SubscriptionRow): Subscription {
  return {
    id: row.id,
    userId: row.user_id,
    address: mapAddress(row),
    status: row.status,
    verified: row.verified,
    consent: {
      consentChecked: row.consent_checked,
      sourceUrl: row.consent_source_url,
      submittedAt: new Date(row.consent_submitted_at),
      confirmedAt: row.consent_confirmed_at
        ? new Date(row.consent_confirmed_at)
        : null,
    },
    notifyHour: row.notify_hour ?? 19,
    awaitingTimePref: row.awaiting_time_pref ?? false,
    emailAlerts: row.email_alerts ?? true,
    smsAlerts: row.sms_alerts ?? true,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function mapSubscriber(row: SubscriberRow): Subscriber {
  const subscription = mapSubscription(row);
  return {
    userId: row.user_id,
    phone: row.phone,
    email: row.email ?? null,
    emailVerified: row.email_verified ?? false,
    subscriptionId: subscription.id,
    address: subscription.address,
    status: subscription.status,
    verified: subscription.verified,
    consent: subscription.consent,
    notifyHour: subscription.notifyHour,
    awaitingTimePref: subscription.awaitingTimePref,
    emailAlerts: subscription.emailAlerts,
    smsAlerts: subscription.smsAlerts,
    createdAt: subscription.createdAt,
    updatedAt: subscription.updatedAt,
  };
}

export async function findUserByPhone(phone: string): Promise<User | null> {
  const result = await pool.query<UserRow>(
    `SELECT id, phone, email, email_verified, email_verification_token, email_verification_token_expires_at, created_at, updated_at
     FROM users
     WHERE phone = $1
     LIMIT 1`,
    [phone]
  );

  return result.rows[0] ? mapUser(result.rows[0]) : null;
}

export async function createUser(user: User): Promise<User> {
  const result = await pool.query<UserRow>(
    `INSERT INTO users (id, phone, email, email_verified, email_verification_token, email_verification_token_expires_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, phone, email, email_verified, email_verification_token, email_verification_token_expires_at, created_at, updated_at`,
    [
      user.id,
      user.phone,
      user.email ?? null,
      user.emailVerified ?? false,
      user.emailVerificationToken ?? null,
      user.emailVerificationTokenExpiresAt ?? null,
      user.createdAt,
      user.updatedAt,
    ]
  );

  return mapUser(result.rows[0]);
}

export async function findUserByVerificationToken(token: string): Promise<User | null> {
  const result = await pool.query<UserRow>(
    `SELECT id, phone, email, email_verified, email_verification_token, email_verification_token_expires_at, created_at, updated_at
     FROM users
     WHERE email_verification_token = $1
     LIMIT 1`,
    [token]
  );
  return result.rows[0] ? mapUser(result.rows[0]) : null;
}

export async function verifyUserEmail(userId: string): Promise<void> {
  await pool.query(
    `UPDATE users
     SET email_verified = TRUE,
         email_verification_token = NULL,
         email_verification_token_expires_at = NULL,
         updated_at = NOW()
     WHERE id = $1`,
    [userId]
  );
}

export async function setEmailVerificationToken(
  userId: string,
  token: string,
  expiresAt: Date
): Promise<void> {
  await pool.query(
    `UPDATE users
     SET email_verification_token = $1,
         email_verification_token_expires_at = $2,
         updated_at = NOW()
     WHERE id = $3`,
    [token, expiresAt, userId]
  );
}

export async function createSubscription(
  subscription: Subscription
): Promise<Subscription> {
  const normalizedAddress = normalizeAddress(subscription.address);
  const result = await pool.query<SubscriptionRow>(
    `INSERT INTO subscriptions (
      id, user_id, laddr, sdir, sname, stype, faddr,
      status, verified,
      consent_checked, consent_source_url, consent_submitted_at, consent_confirmed_at,
      notify_hour, awaiting_time_pref,
      email_alerts, sms_alerts,
      created_at, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7,
      $8, $9,
      $10, $11, $12, $13,
      $14, $15,
      $16, $17,
      $18, $19
    )
    RETURNING *`,
    [
      subscription.id,
      subscription.userId,
      normalizedAddress.laddr,
      normalizedAddress.sdir,
      normalizedAddress.sname,
      normalizedAddress.stype,
      normalizedAddress.faddr,
      subscription.status,
      subscription.verified,
      subscription.consent.consentChecked,
      subscription.consent.sourceUrl,
      subscription.consent.submittedAt,
      subscription.consent.confirmedAt ?? null,
      subscription.notifyHour ?? 19,
      subscription.awaitingTimePref ?? false,
      subscription.emailAlerts ?? true,
      subscription.smsAlerts ?? true,
      subscription.createdAt,
      subscription.updatedAt,
    ]
  );

  return mapSubscription(result.rows[0]);
}

export async function upsertSubscriptionForSignup(
  subscription: Subscription
): Promise<Subscription> {
  const normalizedAddress = normalizeAddress(subscription.address);
  const result = await pool.query<SubscriptionRow>(
    `INSERT INTO subscriptions (
      id, user_id, laddr, sdir, sname, stype, faddr,
      status, verified,
      consent_checked, consent_source_url, consent_submitted_at, consent_confirmed_at,
      notify_hour, awaiting_time_pref,
      email_alerts, sms_alerts,
      created_at, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7,
      $8, $9,
      $10, $11, $12, $13,
      $14, $15,
      $16, $17,
      $18, $19
    )
    ON CONFLICT (user_id, laddr, sdir, sname, stype, faddr)
    DO UPDATE SET
      status = EXCLUDED.status,
      verified = EXCLUDED.verified,
      consent_checked = EXCLUDED.consent_checked,
      consent_source_url = EXCLUDED.consent_source_url,
      consent_submitted_at = EXCLUDED.consent_submitted_at,
      consent_confirmed_at = EXCLUDED.consent_confirmed_at,
      email_alerts = EXCLUDED.email_alerts,
      sms_alerts = EXCLUDED.sms_alerts,
      updated_at = EXCLUDED.updated_at
    RETURNING *`,
    [
      subscription.id,
      subscription.userId,
      normalizedAddress.laddr,
      normalizedAddress.sdir,
      normalizedAddress.sname,
      normalizedAddress.stype,
      normalizedAddress.faddr,
      subscription.status,
      subscription.verified,
      subscription.consent.consentChecked,
      subscription.consent.sourceUrl,
      subscription.consent.submittedAt,
      subscription.consent.confirmedAt ?? null,
      subscription.notifyHour ?? 19,
      subscription.awaitingTimePref ?? false,
      subscription.emailAlerts ?? true,
      subscription.smsAlerts ?? true,
      subscription.createdAt,
      subscription.updatedAt,
    ]
  );

  return mapSubscription(result.rows[0]);
}

export async function findActiveSubscriptionByPhone(
  phone: string
): Promise<Subscriber | null> {
  const result = await pool.query<SubscriberRow>(
    `SELECT s.*, u.phone, u.email, u.email_verified
     FROM subscriptions s
     JOIN users u ON u.id = s.user_id
     WHERE u.phone = $1
       AND s.status = 'active'
       AND s.verified = true
     ORDER BY s.updated_at DESC
     LIMIT 1`,
    [phone]
  );

  return result.rows[0] ? mapSubscriber(result.rows[0]) : null;
}

export async function findLatestSubscriptionByPhone(
  phone: string
): Promise<Subscriber | null> {
  const result = await pool.query<SubscriberRow>(
    `SELECT s.*, u.phone, u.email, u.email_verified
     FROM subscriptions s
     JOIN users u ON u.id = s.user_id
     WHERE u.phone = $1
     ORDER BY s.updated_at DESC
     LIMIT 1`,
    [phone]
  );

  return result.rows[0] ? mapSubscriber(result.rows[0]) : null;
}

export async function findSubscriptionsByPhone(
  phone: string
): Promise<Subscriber[]> {
  const result = await pool.query<SubscriberRow>(
    `SELECT s.*, u.phone, u.email, u.email_verified
     FROM subscriptions s
     JOIN users u ON u.id = s.user_id
     WHERE u.phone = $1
     ORDER BY s.updated_at DESC`,
    [phone]
  );

  return result.rows.map(mapSubscriber);
}

export async function findSubscriptionByPhoneAndAddress(
  phone: string,
  address: AddressParams
): Promise<Subscriber | null> {
  const normalizedAddress = normalizeAddress(address);
  const result = await pool.query<SubscriberRow>(
    `SELECT s.*, u.phone, u.email, u.email_verified
     FROM subscriptions s
     JOIN users u ON u.id = s.user_id
     WHERE u.phone = $1
       AND s.laddr = $2
       AND s.sdir = $3
       AND s.sname = $4
       AND s.stype = $5
       AND s.faddr = $6
     ORDER BY s.updated_at DESC
     LIMIT 1`,
    [
      phone,
      normalizedAddress.laddr,
      normalizedAddress.sdir,
      normalizedAddress.sname,
      normalizedAddress.stype,
      normalizedAddress.faddr,
    ]
  );

  return result.rows[0] ? mapSubscriber(result.rows[0]) : null;
}

export async function updateSubscription(
  subscription: Subscription
): Promise<Subscription> {
  const result = await pool.query<SubscriptionRow>(
    `UPDATE subscriptions
     SET status = $2,
         verified = $3,
         consent_checked = $4,
         consent_source_url = $5,
         consent_submitted_at = $6,
         consent_confirmed_at = $7,
         notify_hour = $8,
         awaiting_time_pref = $9,
         email_alerts = $10,
         sms_alerts = $11,
         updated_at = $12
     WHERE id = $1
     RETURNING *`,
    [
      subscription.id,
      subscription.status,
      subscription.verified,
      subscription.consent.consentChecked,
      subscription.consent.sourceUrl,
      subscription.consent.submittedAt,
      subscription.consent.confirmedAt ?? null,
      subscription.notifyHour ?? 19,
      subscription.awaitingTimePref ?? false,
      subscription.emailAlerts ?? true,
      subscription.smsAlerts ?? true,
      subscription.updatedAt,
    ]
  );

  return mapSubscription(result.rows[0]);
}

export async function disableEmailAlertsForUser(userId: string): Promise<void> {
  await pool.query(
    `UPDATE subscriptions SET email_alerts = FALSE, updated_at = NOW() WHERE user_id = $1`,
    [userId]
  );
}

export async function getAllSubscribers(): Promise<Subscriber[]> {
  const result = await pool.query<SubscriberRow>(
    `SELECT s.*, u.phone, u.email, u.email_verified
     FROM subscriptions s
     JOIN users u ON u.id = s.user_id
     ORDER BY s.created_at DESC`
  );
  return result.rows.map(mapSubscriber);
}

export async function adminUpdateSubscription(
  subscriptionId: string,
  fields: {
    status?: string;
    verified?: boolean;
    notifyHour?: number;
    awaitingTimePref?: boolean;
    emailAlerts?: boolean;
    smsAlerts?: boolean;
  }
): Promise<void> {
  const sets: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (fields.status !== undefined) { sets.push(`status = $${idx++}`); values.push(fields.status); }
  if (fields.verified !== undefined) { sets.push(`verified = $${idx++}`); values.push(fields.verified); }
  if (fields.notifyHour !== undefined) { sets.push(`notify_hour = $${idx++}`); values.push(fields.notifyHour); }
  if (fields.awaitingTimePref !== undefined) { sets.push(`awaiting_time_pref = $${idx++}`); values.push(fields.awaitingTimePref); }
  if (fields.emailAlerts !== undefined) { sets.push(`email_alerts = $${idx++}`); values.push(fields.emailAlerts); }
  if (fields.smsAlerts !== undefined) { sets.push(`sms_alerts = $${idx++}`); values.push(fields.smsAlerts); }

  if (sets.length === 0) return;
  sets.push(`updated_at = NOW()`);
  values.push(subscriptionId);

  await pool.query(
    `UPDATE subscriptions SET ${sets.join(", ")} WHERE id = $${idx}`,
    values
  );
}

export async function adminUpdateUser(
  userId: string,
  fields: { phone?: string; email?: string; emailVerified?: boolean }
): Promise<void> {
  const sets: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (fields.phone !== undefined) { sets.push(`phone = $${idx++}`); values.push(fields.phone); }
  if (fields.email !== undefined) { sets.push(`email = $${idx++}`); values.push(fields.email); }
  if (fields.emailVerified !== undefined) { sets.push(`email_verified = $${idx++}`); values.push(fields.emailVerified); }

  if (sets.length === 0) return;
  sets.push(`updated_at = NOW()`);
  values.push(userId);

  await pool.query(
    `UPDATE users SET ${sets.join(", ")} WHERE id = $${idx}`,
    values
  );
}

export async function deleteSubscription(subscriptionId: string): Promise<void> {
  await pool.query(`DELETE FROM subscriptions WHERE id = $1`, [subscriptionId]);
}

export async function deleteUser(userId: string): Promise<void> {
  await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
}

export async function getActiveSubscribersForHour(hour: number): Promise<Subscriber[]> {
  const result = await pool.query<SubscriberRow>(
    `SELECT s.*, u.phone, u.email, u.email_verified
     FROM subscriptions s
     JOIN users u ON u.id = s.user_id
     WHERE s.status = 'active'
       AND s.verified = true
       AND s.notify_hour = $1`,
    [hour]
  );

  return result.rows.map(mapSubscriber);
}
