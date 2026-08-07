import rehypeShiki from '@shikijs/rehype';
import { Component, type ErrorInfo, memo, type ReactNode } from 'react';
import type { Components } from 'react-markdown';
import { MarkdownHooks } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import './markdown.css';

/**
 * Markdown 渲染（README 6.1：react-markdown + remark-gfm + rehype-shiki）。
 * 主题色通过 Shiki 的 CSS 变量随 data-theme 切换（defaultColor: false）。
 * @shikijs/rehype 是异步插件，react-markdown 的同步组件会抛 runSync finished async，
 * 因此改用官方异步版 MarkdownHooks（客户端 useEffect + useState，处理期间渲染 fallback）。
 * 流式场景由调用方做「已完成块记忆化 + 只重解析尾部」的拆分（见 StreamingMarkdown）。
 *
 * Shiki 依赖 Oniguruma WASM；Electron CSP 需允许 script-src 'wasm-unsafe-eval'。
 * 若 WASM / 高亮失败，ErrorBoundary 降级为纯文本，避免整页白屏/黑屏。
 */

const SHIKI_OPTIONS = {
  themes: { light: 'github-light', dark: 'github-dark' },
  defaultColor: false,
  addLanguageClass: true,
  langs: [
    'ts',
    'tsx',
    'js',
    'jsx',
    'json',
    'bash',
    'sh',
    'markdown',
    'md',
    'css',
    'html',
    'python',
    'rust',
    'go',
    'sql',
    'yaml',
    'toml',
    'diff',
  ],
} as const;

const components: Components = {
  a({ href, children }) {
    return (
      <a href={href} target="_blank" rel="noreferrer">
        {children}
      </a>
    );
  },
  pre({ children }) {
    return <pre className="md-pre">{children}</pre>;
  },
};

export interface MarkdownProps {
  text: string;
  className?: string;
}

class MarkdownErrorBoundary extends Component<
  { text: string; children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.warn(
      '[Markdown] render failed, falling back to plain text',
      error,
      info.componentStack,
    );
  }

  override render(): ReactNode {
    if (this.state.failed) {
      return <pre className="md-pre md-fallback">{this.props.text}</pre>;
    }
    return this.props.children;
  }
}

/** 已完成块的 Markdown（memo 化，同文本不重渲染）。 */
export const Markdown = memo(function Markdown({ text, className }: MarkdownProps) {
  return (
    <div className={className ? `${className} md-root` : 'md-root'} data-md="">
      <MarkdownErrorBoundary text={text}>
        <MarkdownHooks
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[[rehypeShiki, SHIKI_OPTIONS]]}
          components={components}
          fallback={null}
        >
          {text}
        </MarkdownHooks>
      </MarkdownErrorBoundary>
    </div>
  );
});
