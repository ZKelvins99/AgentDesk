import { describe, expect, it } from 'vitest';
import { approvalModeSchema, sessionSchema, workspaceSchema } from './models';

describe('workspaceSchema', () => {
  it('accepts a valid workspace', () => {
    const ws = {
      id: '7f0b0f1e-2f1e-4f1e-9f1e-0f1e2f3f4f5f',
      path: 'C:\\projects\\demo',
      name: 'demo',
      trust: 'trusted',
      lastOpenedAt: '2026-08-06T00:00:00.000Z',
      createdAt: '2026-08-06T00:00:00.000Z',
    };
    expect(workspaceSchema.parse(ws)).toEqual(ws);
  });

  it('rejects an invalid trust value', () => {
    expect(() => workspaceSchema.parse({ trust: 'maybe' })).toThrow();
  });
});

describe('sessionSchema', () => {
  it('accepts a valid session', () => {
    const s = {
      id: '7f0b0f1e-2f1e-4f1e-9f1e-0f1e2f3f4f5f',
      workspaceId: '7f0b0f1e-2f1e-4f1e-9f1e-0f1e2f3f4f5f',
      title: 'demo session',
      status: 'idle',
      model: 'gpt-5',
      thinkingLevel: 'high',
      approvalMode: 'auto-edit',
      messageCount: 3,
      createdAt: '2026-08-06T00:00:00.000Z',
      updatedAt: '2026-08-06T00:00:00.000Z',
    };
    expect(sessionSchema.parse(s)).toEqual(s);
  });

  it('rejects an unknown approval mode', () => {
    expect(() => approvalModeSchema.parse('root')).toThrow();
  });
});
