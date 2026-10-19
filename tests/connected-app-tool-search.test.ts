import { describe, expect, it } from 'vitest';
import { searchAppTools } from '../src/connections/tool-search.js';
describe('connected app capability search', () => {
  it('prioritizes actual inbox reads over profile and label tools', () => {
    const tools = [
      { slug: 'MAILBOX_GET_PROFILE', name: 'Get profile', description: 'Read the email address of the user' },
      { slug: 'MAILBOX_LIST_LABELS', name: 'List labels', description: 'Labels for email messages' },
      { slug: 'MAILBOX_FETCH_EMAILS', name: 'Fetch emails', inputParameters: { type: 'object' } },
    ];
    expect(searchAppTools(tools, 'read my emails')[0]).toBe(tools[2]);
    const edits = Array.from({ length: 10 }, (_, i) => ({ slug: `MAILBOX_DELETE_MESSAGE_${i}`, name: 'Delete message', description: 'In the inbox' }));
    expect(searchAppTools([...edits, ...tools], 'inbox')[0]).toBe(tools[2]);
    expect(searchAppTools([...edits, ...tools], 'delete message')[0]?.slug).toMatch(/^MAILBOX_DELETE_MESSAGE_/);
  });
  it('ranks the complete catalog rather than its first five alphabetical matches', () => {
    const tools = Array.from({ length: 120 }, (_, i) => ({ slug: `FILES_DELETE_PERMISSION_${i}`, name: 'Delete permission', description: 'Permissions on files in a list' }));
    const list = { slug: 'FILES_LIST_FILES', name: 'List files', description: 'List files in a folder' };
    const labels = { slug: 'FILES_LIST_FILE_LABELS', name: 'List file labels' };
    expect(searchAppTools([...tools, labels, list], 'list files')[0]).toBe(list);
    expect(searchAppTools([...tools, list], 'FILES_LIST_FILES')[0]).toBe(list);
    expect(searchAppTools([...tools, list], 'unknown-capability')).toEqual([]);
  });
});
