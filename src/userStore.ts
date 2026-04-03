import { pool } from "./db";
import { AddressParams } from "./cityClient";
import { Subscriber, Subscription, User, UserStatus } from "./models";

interface UserRow {
  id: string;
  phone: string;
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
  created_at: Date;
  updated_at: Date;
}

interface SubscriberRow extends SubscriptionRow {
  phone: string;
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
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function mapSubscriber(row: SubscriberRow): Subscriber {
  const subscription = mapSubscription(row);
  return {
    userId: row.user_id,
    phone: row.phone,
    subscriptionId: subscription.id,
    address: subscription.address,
    status: subscription.status,
    verified: subscription.verified,
    consent: subscription.consent,
    createdAt: subscription.createdAt,
    updatedAt: subscription.updatedAt,
  };
}

export async function findUserByPhone(phone: string): Promise<User | null> {
  const result = await pool.query<UserRow>(
    `SELECT id, phone, created_at, updated_at
     FROM users
     WHERE phone = $1
     LIMIT 1`,
    [phone]
  );

  return result.rows[0] ? mapUser(result.rows[0]) : null;
}

export async function createUser(user: User): Promise<User> {
  const result = await pool.query<UserRow>(
    `INSERT INTO users (id, phone, created_at, updated_at)
     VALUES ($1, $2, $3, $4)
     RETURNING id, phone, created_at, updated_at`,
    [user.id, user.phone, user.createdAt, user.updatedAt]
  );

  return mapUser(result.rows[0]);
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
      created_at, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7,
      $8, $9,
      $10, $11, $12, $13,
      $14, $15
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
      created_at, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7,
      $8, $9,
      $10, $11, $12, $13,
      $14, $15
    )
    ON CONFLICT (user_id, laddr, sdir, sname, stype, faddr)
    DO UPDATE SET
      status = EXCLUDED.status,
      verified = EXCLUDED.verified,
      consent_checked = EXCLUDED.consent_checked,
      consent_source_url = EXCLUDED.consent_source_url,
      consent_submitted_at = EXCLUDED.consent_submitted_at,
      consent_confirmed_at = EXCLUDED.consent_confirmed_at,
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
    `SELECT s.*, u.phone
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
    `SELECT s.*, u.phone
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
    `SELECT s.*, u.phone
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
    `SELECT s.*, u.phone
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
         updated_at = $8
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
      subscription.updatedAt,
    ]
  );

  return mapSubscription(result.rows[0]);
}

export async function getActiveSubscribers(): Promise<Subscriber[]> {
  const result = await pool.query<SubscriberRow>(
    `SELECT s.*, u.phone
     FROM subscriptions s
     JOIN users u ON u.id = s.user_id
     WHERE s.status = 'active'
       AND s.verified = true`
  );

  return result.rows.map(mapSubscriber);
}
