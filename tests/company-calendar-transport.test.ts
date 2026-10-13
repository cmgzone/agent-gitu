import { expect, it, vi } from 'vitest';
import { ComposioConnections } from '../src/connections/composio.js';
it('binds Calendar proxy calls to an active owner account, fixed Google endpoints and no mutating transport retries', async () => {
  const proxy = vi.fn(async () => ({ status: 200, data: { id: 'abcdef1234' } })),
    options = vi.fn(() => ({ tools: { proxy } })),
    sdk = {
      connectedAccounts: {
        list: vi.fn(async () => ({ items: [{ id: 'account-1', toolkit: { slug: 'googlecalendar' }, status: 'ACTIVE', isDisabled: false }], nextCursor: undefined })),
      },
      getClient: () => ({ withOptions: options }),
    };
  const connections = new ComposioConnections(
    () => 'owner-1',
    { configured: true, read: () => 'fixture-key' } as never,
    () => sdk as never,
  );
  const reply = await connections.googleCalendarRequest('account-1', 'primary', 'abcdef1234', 'PATCH', { summary: 'Review' }, 'etag-1');
  expect(reply.status).toBe(200);
  expect(options).toHaveBeenCalledWith({ maxRetries: 0 });
  expect(proxy.mock.calls[0]![0]).toMatchObject({
    connected_account_id: 'account-1',
    endpoint: 'https://www.googleapis.com/calendar/v3/calendars/primary/events/abcdef1234',
    method: 'PATCH',
    parameters: [{ name: 'If-Match', value: 'etag-1', type: 'header' }],
  });
  await expect(connections.googleCalendarRequest('foreign', 'primary', undefined, 'POST', {})).rejects.toThrow('active');
  expect(proxy).toHaveBeenCalledTimes(1);
});
