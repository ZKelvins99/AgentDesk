import { useVirtualizer, type VirtualItem } from '@tanstack/react-virtual';
import type { Ref } from 'react';
import { useCallback, useEffect, useImperativeHandle, useRef } from 'react';

export interface VirtualListHandle {
  scrollToEnd: (behavior?: ScrollBehavior) => void;
  scrollToIndex: (index: number) => void;
}

export interface VirtualListProps<T> {
  items: readonly T[];
  getKey: (item: T) => string;
  estimateSize: (index: number) => number;
  renderItem: (item: T, index: number) => React.ReactNode;
  overscan?: number;
  className?: string;
  /** 内容变化时自动跟随底部（仅在用户处于底部附近时生效）。 */
  followEnd?: boolean;
  /** 判定「在底部附近」的阈值（默认 80px，README 9.4.3）。 */
  endThresholdPx?: number;
  onNearEndChange?: (nearEnd: boolean) => void;
}

/**
 * 通用虚拟列表（README 9.4.3）：
 * - TanStack Virtual + ResizeObserver 实测行高（虚拟项高度缓存）
 * - 自动滚底：仅当用户处于底部 ±endThresholdPx 内；上滑后停止跟随
 */
export function VirtualList<T>({
  items,
  getKey,
  estimateSize,
  renderItem,
  overscan,
  className,
  followEnd = true,
  endThresholdPx = 80,
  onNearEndChange,
  ref,
}: VirtualListProps<T> & { ref?: Ref<VirtualListHandle> }): React.JSX.Element {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const stickRef = useRef(followEnd);
  const nearEndRef = useRef(true);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index: number) => estimateSize(index),
    getItemKey: (index: number) => getKey(items[index] as T),
    overscan: overscan ?? 12,
  });

  useEffect(() => {
    stickRef.current = followEnd;
  }, [followEnd]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      scrollToEnd: (behavior?: ScrollBehavior) => {
        stickRef.current = true;
        scrollToBottom(behavior ?? 'auto');
      },
      scrollToIndex: (index: number) => {
        stickRef.current = false;
        virtualizer.scrollToIndex(index, { align: 'auto' });
      },
    }),
    [scrollToBottom, virtualizer],
  );

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    const near = dist <= endThresholdPx;
    nearEndRef.current = near;
    onNearEndChange?.(near);
  }, [endThresholdPx, onNearEndChange]);

  const totalSize = virtualizer.getTotalSize();
  // 新条目或行高变化导致内容高度变化时，若用户仍在底部则保持贴底
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      if (!stickRef.current || !nearEndRef.current) return;
      scrollToBottom();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [scrollToBottom]);

  return (
    <div
      ref={scrollRef}
      className={className}
      onScroll={handleScroll}
      data-virtual-scroll=""
      role="log"
      aria-live="polite"
    >
      <div ref={contentRef} style={{ height: totalSize, position: 'relative' }}>
        {virtualizer.getVirtualItems().map((vi: VirtualItem) => {
          const item = items[vi.index] as T;
          return (
            <div
              key={vi.key}
              data-index={vi.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${vi.start}px)`,
              }}
            >
              {renderItem(item, vi.index)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
