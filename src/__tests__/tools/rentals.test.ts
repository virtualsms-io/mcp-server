/**
 * Per-handler unit tests for the rental tools (money-moving):
 * create_rental, extend_rental, cancel_rental, release_rental.
 */
import { describe, expect, it } from 'vitest';
import type { IVirtualSMSClient } from '../../client.js';
import { MockVirtualSMSClient } from '../../sandbox/mock-http.js';
import {
  CancelRentalInput,
  CreateRentalInput,
  ExtendRentalInput,
  ReleaseRentalInput,
  handleCancelRental,
  handleCreateRental,
  handleExtendRental,
  handleReleaseRental,
} from '../../tools.js';

function freshClient(): MockVirtualSMSClient {
  return new MockVirtualSMSClient('https://virtualsms.io');
}

describe('virtualsms_create_rental (handleCreateRental)', () => {
  it('rejects bad input: missing required fields', () => {
    expect(CreateRentalInput.safeParse({}).success).toBe(false);
    expect(CreateRentalInput.safeParse({ tier: 'full_access' }).success).toBe(false); // missing country/duration
  });

  it('rejects bad input: invalid tier enum value', () => {
    expect(
      CreateRentalInput.safeParse({ tier: 'not-a-tier', country: 'US', duration_hours: 24 }).success,
    ).toBe(false);
  });

  it('happy path: full_access rental against the mock backend', async () => {
    const client = freshClient();
    const args = CreateRentalInput.parse({ tier: 'full_access', country: 'US', duration_hours: 24 });
    const result = await handleCreateRental(client, args);
    const payload = result.structuredContent as Record<string, unknown>;
    expect(payload.rental_id).toBeTruthy();
    expect(payload.tier).toBe('full_access');
  });

  it('happy path: platform rental against the mock backend', async () => {
    const client = freshClient();
    const args = CreateRentalInput.parse({
      tier: 'platform',
      country: 'US',
      duration_hours: 24,
      service: 'telegram',
    });
    const result = await handleCreateRental(client, args);
    const payload = result.structuredContent as Record<string, unknown>;
    expect(payload.rental_id).toBeTruthy();
    expect(payload.tier).toBe('platform');
  });

  it('validation guard: platform tier without a service is rejected with a clear error (not a mock/backend call)', async () => {
    const client = freshClient();
    // Passes zod schema (service is optional there) but handleCreateRental
    // itself enforces platform-requires-service before touching the client.
    const args = CreateRentalInput.parse({ tier: 'platform', country: 'US', duration_hours: 24 });
    await expect(handleCreateRental(client, args)).rejects.toThrow(/service is required/i);
  });

  it('error path: a client failure propagates as a clean Error, not a crash', async () => {
    const failingClient: Partial<IVirtualSMSClient> = {
      createFullAccessRental: async () => {
        throw new Error('Insufficient balance. Top up at https://virtualsms.io');
      },
    };
    const args = CreateRentalInput.parse({ tier: 'full_access', country: 'US', duration_hours: 24 });
    await expect(handleCreateRental(failingClient as IVirtualSMSClient, args)).rejects.toThrow(
      'Insufficient balance',
    );
  });
});

describe('virtualsms_extend_rental (handleExtendRental)', () => {
  it('rejects bad input: missing fields', () => {
    expect(ExtendRentalInput.safeParse({}).success).toBe(false);
    expect(ExtendRentalInput.safeParse({ rental_id: 'r1' }).success).toBe(false);
  });

  it('happy path: extends an existing rental against the mock backend', async () => {
    const client = freshClient();
    const created = await client.createFullAccessRental({ country: 'US', rentalType: 'full', durationHours: 24 });
    const result = await handleExtendRental(
      client,
      ExtendRentalInput.parse({ rental_id: created.rental_id, duration_hours: 24 }),
    );
    const payload = result.structuredContent as Record<string, unknown>;
    expect(payload.success).toBe(true);
    expect(payload.new_expires_at).toBeTruthy();
  });

  it('error path: unknown rental_id maps to a clean Error, not a crash', async () => {
    const client = freshClient();
    await expect(
      handleExtendRental(client, ExtendRentalInput.parse({ rental_id: 'does-not-exist', duration_hours: 24 })),
    ).rejects.toThrow(/not found|does-not-exist/i);
  });
});

describe('virtualsms_cancel_rental (handleCancelRental)', () => {
  it('rejects bad input: missing rental_id', () => {
    expect(CancelRentalInput.safeParse({}).success).toBe(false);
  });

  it('happy path: cancels an existing rental against the mock backend, refund reflected', async () => {
    const client = freshClient();
    const created = await client.createFullAccessRental({ country: 'US', rentalType: 'full', durationHours: 24 });
    const result = await handleCancelRental(client, CancelRentalInput.parse({ rental_id: created.rental_id }));
    const payload = result.structuredContent as Record<string, unknown>;
    expect(payload.success).toBe(true);
    expect(payload.status).toBe('cancelled');
    expect(typeof payload.refund).toBe('number');
  });

  it('error path: a client failure propagates as a clean Error, not a crash', async () => {
    const failingClient: Partial<IVirtualSMSClient> = {
      cancelRental: async () => {
        throw new Error('Not found: sandbox rental r1 does not exist');
      },
    };
    await expect(
      handleCancelRental(failingClient as IVirtualSMSClient, CancelRentalInput.parse({ rental_id: 'r1' })),
    ).rejects.toThrow(/not found/i);
  });
});

describe('virtualsms_release_rental (handleReleaseRental)', () => {
  it('rejects bad input: missing rental_id', () => {
    expect(ReleaseRentalInput.safeParse({}).success).toBe(false);
  });

  it('happy path: releases an existing rental against the mock backend, pro-rated refund reflected', async () => {
    const client = freshClient();
    const created = await client.createFullAccessRental({ country: 'US', rentalType: 'full', durationHours: 24 });
    const result = await handleReleaseRental(client, ReleaseRentalInput.parse({ rental_id: created.rental_id }));
    const payload = result.structuredContent as Record<string, unknown>;
    expect(payload.success).toBe(true);
    expect(payload.status).toBe('completed');
    expect(typeof payload.refund).toBe('number');
  });

  it('error path: unknown rental_id maps to a clean Error, not a crash', async () => {
    const client = freshClient();
    await expect(
      handleReleaseRental(client, ReleaseRentalInput.parse({ rental_id: 'does-not-exist' })),
    ).rejects.toThrow(/not found|does-not-exist/i);
  });
});
