/// <reference types="vite/client" />
import type {
  AgentDeskEvent,
  ApprovalAuditEntry,
  ApprovalRequestView,
  ApprovalRule,
  AuthProviderStatus,
  ConfigValidationIssue,
  DiagnosticInfo,
  DiffHunk,
  ExtensionRuntimeNote,
  ExtensionView,
  FileTreeEntry,
  KernelStatus,
  KernelUpgradeStatus,
  McpCallLogEntry,
  McpServerView,
  McpSnapshot,
  McpToolView,
  OnboardingStatus,
  PackageSecurityInspection,
  PackageView,
  ProfileView,
  ProviderPreset,
  ProviderView,
  ResourceSnapshot,
  SecretsStatusResponse,
  SessionState,
  SkillView,
  UpdateStatus,
} from '@agentdesk/ipc';
import type { ApprovalMode } from '@agentdesk/shared';
import type { SessionSummary, WorkspaceRecord } from './types';

declare global {
  interface Window {
    agentdesk: {
      ping(nonce?: string): Promise<{ pong: string }>;
      getVersion(): Promise<{ version: string }>;
      platform: string;
      window: {
        minimize(): Promise<void>;
        maximize(): Promise<void>;
        close(): Promise<void>;
      };
      session: {
        create(req: {
          workspacePath?: string;
          model?: string;
          thinkingLevel?: string;
        }): Promise<{ sessionId: string; workspacePath: string }>;
        attach(req: { sessionId: string; sinceSeq?: number }): Promise<{
          sessionId: string;
          workspacePath: string;
          history: AgentDeskEvent[];
          state: SessionState;
          seq: number;
        }>;
        send(req: {
          sessionId: string;
          text: string;
        }): Promise<{ accepted: boolean; mode: 'normal' | 'steer' | 'followUp' }>;
        abort(req: { sessionId: string }): Promise<void>;
        setModel(req: { sessionId: string; model: string }): Promise<void>;
        getModels(req: { sessionId: string }): Promise<{
          models: Array<{
            id: string;
            name: string | null;
            provider: string | null;
            api: string | null;
            reasoning: boolean;
            input: string[];
            contextWindow: number | null;
            maxTokens: number | null;
            cost: {
              input?: number;
              output?: number;
              cacheRead?: number;
              cacheWrite?: number;
            } | null;
          }>;
        }>;
        setThinkingLevel(req: { sessionId: string; level: string }): Promise<void>;
        setApprovalMode(req: { sessionId: string; mode: ApprovalMode }): Promise<void>;
        list(req?: {
          search?: string;
          archived?: boolean;
          limit?: number;
          offset?: number;
        }): Promise<{ sessions: SessionSummary[] }>;
        rename(req: { sessionId: string; title: string }): Promise<void>;
        archive(req: { sessionId: string }): Promise<void>;
        delete(req: { sessionId: string }): Promise<void>;
        export(req: {
          sessionId: string;
          format: 'md' | 'json';
        }): Promise<{ path: string; format: 'md' | 'json' }>;
      };
      provider: {
        list(): Promise<{ providers: ProviderView[] }>;
        save(req: { config: unknown; apiKey?: string }): Promise<{ name: string }>;
        delete(req: { name: string }): Promise<void>;
        presets(): Promise<{ presets: ProviderPreset[] }>;
        discoverModels(req: {
          baseUrl: string;
          api?: string;
          apiKey?: string;
          headers?: Record<string, string>;
        }): Promise<{ models: Array<{ id: string; name: string | null }> }>;
        test(req: { name: string; model?: string }): Promise<{
          ok: boolean;
          status: number | null;
          latencyMs: number | null;
          snippet: string | null;
          error: string | null;
        }>;
      };
      secrets: {
        status(): Promise<SecretsStatusResponse>;
      };
      auth: {
        status(): Promise<{ providers: AuthProviderStatus[] }>;
        launchLogin(req?: { provider?: string }): Promise<{ launched: boolean; terminal: string }>;
      };
      workspace: {
        add(req: { path: string }): Promise<{ workspace: WorkspaceRecord; needsTrust: boolean }>;
        remove(req: { workspaceId: string }): Promise<void>;
        list(): Promise<{ workspaces: WorkspaceRecord[] }>;
        open(req: { workspaceId: string }): Promise<{ workspace: WorkspaceRecord }>;
        trust(req: {
          workspaceId: string;
          decision: 'once' | 'always' | 'alwaysParent' | 'never';
        }): Promise<void>;
        pickDirectory(): Promise<{ path: string | null }>;
        pickFile(): Promise<{ path: string | null }>;
      };
      fileSystem: {
        listDir(req: { path: string; root?: string }): Promise<{ entries: FileTreeEntry[] }>;
        search(req: {
          root: string;
          query: string;
          maxResults?: number;
        }): Promise<{ matches: Array<{ path: string }> }>;
      };
      diff: {
        compute(req: { fileName: string; original: string; modified: string }): Promise<{
          fileName: string;
          original: string;
          modified: string;
          hunks: DiffHunk[];
          unified: string;
        }>;
        file(req: { root: string; file: string }): Promise<{
          fileName: string;
          original: string;
          modified: string;
          hunks: DiffHunk[];
          unified: string;
          tracked: boolean;
          gitAvailable: boolean;
        }>;
        applyHunk(req: {
          file: string;
          patch: string;
          direction: 'accept' | 'revert';
          workspacePath?: string;
        }): Promise<{ ok: boolean; message: string }>;
      };
      mcp: {
        list(req?: { workspacePath?: string }): Promise<{ servers: McpServerView[] }>;
        save(req: {
          name: string;
          scope: 'global' | 'workspace';
          config: unknown;
          workspacePath?: string;
        }): Promise<{ server: McpServerView }>;
        delete(req: {
          name: string;
          scope: 'global' | 'workspace';
          workspacePath?: string;
        }): Promise<{ deleted: boolean }>;
        importServers(req: {
          json: string;
          scope: 'global' | 'workspace';
          workspacePath?: string;
        }): Promise<{
          imported: McpServerView[];
          skipped: Array<{ name: string; reason: string }>;
        }>;
        snapshots(req?: { workspacePath?: string }): Promise<{ snapshots: McpSnapshot[] }>;
        test(req: { name: string; workspacePath?: string }): Promise<{
          ok: boolean;
          serverInfo: McpSnapshot['serverInfo'];
          toolCount: number;
          latencyMs: number;
          error: string | null;
        }>;
        tools(req: { name: string; workspacePath?: string }): Promise<{ tools: McpToolView[] }>;
        logs(req?: { limit?: number; workspacePath?: string }): Promise<{
          logs: McpCallLogEntry[];
        }>;
        export(req?: { workspacePath?: string }): Promise<{ json: string }>;
      };
      skills: {
        list(req?: { workspacePath?: string }): Promise<{ skills: SkillView[] }>;
        read(req: { id: string; workspacePath?: string }): Promise<{ content: string }>;
        setEnabled(req: {
          id: string;
          enabled: boolean;
          workspacePath?: string;
        }): Promise<{ skill: SkillView }>;
        create(req: {
          name: string;
          description: string;
          template?: 'script' | 'docs' | 'api';
          scope?: 'global' | 'project';
          workspacePath?: string;
        }): Promise<{ skill: SkillView }>;
        update(req: {
          id: string;
          content: string;
          workspacePath?: string;
        }): Promise<{ skill: SkillView }>;
        validate(req: { content: string; dirName?: string }): Promise<{
          errors: string[];
          warnings: string[];
          infos: string[];
        }>;
        install(req: {
          source:
            | { type: 'dir'; path: string }
            | { type: 'zip'; path: string }
            | { type: 'git'; url: string; ref?: string };
          scope?: 'global' | 'project';
          workspacePath?: string;
        }): Promise<{
          installed: SkillView[];
          skipped: Array<{ name: string; reason: string }>;
        }>;
        recommended(): Promise<{
          sources: Array<{ id: string; name: string; url: string; description: string }>;
        }>;
        harnessStatus(): Promise<{
          harnesses: Array<{
            id: 'claude' | 'codex';
            name: string;
            path: string;
            exists: boolean;
            imported: boolean;
          }>;
        }>;
        importHarness(req: { harness: 'claude' | 'codex' }): Promise<{
          added: string[];
          skipped: string[];
        }>;
      };
      packages: {
        list(req?: { workspacePath?: string }): Promise<{ packages: PackageView[] }>;
        install(req: {
          source:
            | { type: 'npm'; name: string; version?: string }
            | { type: 'git'; url: string; ref?: string }
            | { type: 'local'; path: string };
          scope: 'global' | 'project';
          workspacePath?: string;
        }): Promise<{
          ok: boolean;
          log: string;
          command: string;
          package?: PackageView;
        }>;
        uninstall(req: {
          source: string;
          scope: 'global' | 'project';
          workspacePath?: string;
        }): Promise<{ ok: boolean; log: string; command: string }>;
        update(req: {
          source?: string;
          extensions?: boolean;
          scope: 'global' | 'project';
          workspacePath?: string;
        }): Promise<{ ok: boolean; log: string; command: string; note?: string }>;
        setFilter(req: {
          source: string;
          scope: 'global' | 'project';
          filter: {
            extensions?: string[];
            skills?: string[];
            prompts?: string[];
            themes?: string[];
            autoload?: boolean;
          };
          workspacePath?: string;
        }): Promise<{ package: PackageView }>;
        inspect(req: {
          source:
            | { type: 'npm'; name: string; version?: string }
            | { type: 'git'; url: string; ref?: string }
            | { type: 'local'; path: string };
        }): Promise<{ inspection: PackageSecurityInspection }>;
      };
      settings: {
        read(req: {
          file: 'settings' | 'models';
          scope: 'global' | 'project';
          workspacePath?: string;
        }): Promise<{
          path: string;
          raw: string;
          parsed: Record<string, unknown>;
          validation: ConfigValidationIssue[];
        }>;
        save(req: {
          file: 'settings' | 'models';
          scope: 'global' | 'project';
          raw?: string;
          parsed?: Record<string, unknown>;
          workspacePath?: string;
        }): Promise<{
          path: string;
          raw: string;
          parsed: Record<string, unknown>;
          validation: ConfigValidationIssue[];
          saved: boolean;
        }>;
        kernelStatus(): Promise<KernelStatus>;
      };
      profile: {
        list(): Promise<{ profiles: ProfileView[]; activeId: string }>;
        create(req: { name: string }): Promise<{ profile: ProfileView }>;
        switch(req: {
          id: string;
        }): Promise<{ activeId: string; agentDir: string; requiresRestart: boolean }>;
        delete(req: { id: string }): Promise<{ deleted: string }>;
      };
      extensions: {
        list(req?: { workspacePath?: string }): Promise<{
          extensions: ExtensionView[];
          runtimeNotes: ExtensionRuntimeNote[];
        }>;
      };
      approval: {
        respond(req: {
          requestId: string;
          decision: 'allow-once' | 'always' | 'deny' | 'deny-with-reason';
          reason?: string;
        }): Promise<void>;
        auditList(req?: {
          sessionId?: string;
          limit?: number;
        }): Promise<{ entries: ApprovalAuditEntry[] }>;
        auditExport(req: { format: 'md' | 'json' }): Promise<{ content: string }>;
        auditClear(req?: { sessionId?: string }): Promise<{ cleared: number }>;
        rulesList(req?: { sessionId?: string }): Promise<{ rules: ApprovalRule[] }>;
        rulesSave(req: {
          rule: {
            scope: 'session' | 'workspace' | 'global';
            sessionId?: string;
            matcher: {
              tool?: string;
              bashPrefix?: string;
              pathPrefix?: string;
            };
            decision: 'allow' | 'deny';
          };
        }): Promise<{ id: string }>;
        rulesDelete(req: { id: string }): Promise<void>;
      };
      onSessionEvent(
        cb: (payload: { sessionId: string; seq: number; ev: AgentDeskEvent }) => void,
      ): () => void;
      onApprovalEvent(cb: (payload: ApprovalRequestView) => void): () => void;
      onResourcesEvent(
        cb: (payload: { sessionId?: string; resources: ResourceSnapshot }) => void,
      ): () => void;
      // M8: 终端面板
      pty: {
        create(req: {
          cwd: string;
          cols?: number;
          rows?: number;
        }): Promise<{ ptyId: string; available: boolean }>;
        write(req: { ptyId: string; data: string }): Promise<void>;
        resize(req: { ptyId: string; cols: number; rows: number }): Promise<void>;
        kill(req: { ptyId: string }): Promise<void>;
      };
      // M8: 会话树 / fork
      session_tree: {
        getTree(req: {
          sessionId: string;
        }): Promise<{ nodes: import('@agentdesk/ipc').SessionTreeNode[] }>;
        fork(req: { sessionId: string; fromMessageId: string }): Promise<{ newSessionId: string }>;
        navigateTree(req: { sessionId: string; nodeId: string }): Promise<void>;
      };
      // M8: 上下文用量
      contextUsage(req: { sessionId: string }): Promise<{
        used: number;
        limit: number;
        compactionThreshold: number;
        breakdown: { input: number; output: number; cacheRead: number; cacheWrite: number };
      }>;
      onPtyEvent(cb: (payload: { ptyId: string; data: string }) => void): () => void;
      // M9: 首次启动引导页
      onboarding: {
        status(): Promise<OnboardingStatus>;
        complete(req: { provider?: string; apiKey?: string; kernel?: string }): Promise<void>;
      };
      // M9: 自动更新
      update: {
        status(): Promise<UpdateStatus>;
        check(): Promise<UpdateStatus>;
        install(): Promise<void>;
        onUpdateEvent(cb: (payload: UpdateStatus) => void): () => void;
      };
      // M9: 日志 / 诊断报告
      diagnostic: {
        info(): Promise<DiagnosticInfo>;
        export(): Promise<{ path: string | null; cancelled: boolean }>;
        openLogs(): Promise<void>;
      };
      // M9: 内核独立升级
      kernel: {
        status(): Promise<KernelUpgradeStatus>;
        update(req: { version?: string }): Promise<KernelUpgradeStatus>;
        rollback(): Promise<KernelUpgradeStatus>;
        onKernelEvent(cb: (payload: KernelUpgradeStatus) => void): () => void;
      };
    };
  }
}

export type { SessionSummary, WorkspaceRecord };
