// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { MessageList } from './MessageList';
import type { UiMessage } from './message-model';

describe('MessageList 虚拟化（README G2：2000 消息）', () => {
  beforeAll(() => {
    // jsdom 无布局引擎且没有 ResizeObserver：固定视口/行高度量 + RO 桩
    class ResizeObserverStub {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    Object.defineProperty(globalThis, 'ResizeObserver', {
      configurable: true,
      value: ResizeObserverStub,
    });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      get() {
        return 600;
      },
    });
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get() {
        return 800;
      },
    });
    // TanStack Virtual reads offsetWidth/offsetHeight (getRect / measureElement),
    // so jsdom needs these stubbed too, or scrollRect stays 0x0 and no rows render.
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      get() {
        return 600;
      },
    });
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
      configurable: true,
      get() {
        return 800;
      },
    });
    HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
      return {
        top: 0,
        left: 0,
        bottom: 0,
        right: 0,
        width: 800,
        height: 80,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect;
    };
  });

  afterEach(cleanup);

  it('2000 条消息只挂载可视 + overscan 行（< 120），全部消息不落 DOM', () => {
    const messages: UiMessage[] = Array.from({ length: 2000 }, (_, i) => ({
      kind: 'assistant',
      id: `m${i}`,
      text: `消息 ${i}`,
      thinking: '',
      status: 'done',
    }));

    const { container } = render(<MessageList messages={messages} />);
    const rows = container.querySelectorAll('[data-index]');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThan(120);
  });
});
