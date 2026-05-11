type Primitive = string | number | boolean | null | undefined;

type Json =
  | Primitive
  | {
      [key: string]: Json;
    }
  | Json[];

type DeepReadonly<T> = T extends (...args: unknown[]) => unknown
  ? T
  : T extends readonly unknown[]
    ? Readonly<{ [K in keyof T]: DeepReadonly<T[K]> }>
    : T extends object
      ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
      : T;

type RouteParams<Path extends string> = Path extends `${infer _Start}:${infer Param}/${infer Rest}`
  ? { [K in Param | keyof RouteParams<Rest>]: string }
  : Path extends `${infer _Start}:${infer Param}`
    ? { [K in Param]: string }
    : {};

interface AgentToolConfig {
  id: string;
  name: string;
  enabled: boolean;
  args: Json;
}

export type AgentTemplate<TPath extends string> = DeepReadonly<{
  id: string;
  route: TPath;
  params: RouteParams<TPath>;
  tools: AgentToolConfig[];
  policies:
    | { kind: "allow"; scopes: string[] }
    | { kind: "deny"; reason: string; expiresAt?: Date }
    | { kind: "review"; approvers: Array<{ id: string; required: boolean }> };
}>;

export const template: AgentTemplate<"/agents/:agentId/tools/:toolId"> = {
  id: "security-review",
  route: "/agents/:agentId/tools/:toolId",
  params: {
    agentId: "agent_123",
    toolId: "tool_456"
  },
  tools: [
    {
      id: "scanner",
      name: "Website Scanner",
      enabled: true,
      args: {
        strict: true,
        headers: ["content-security-policy", "x-frame-options"]
      }
    }
  ],
  policies: {
    kind: "review",
    approvers: [{ id: "owner", required: true }]
  }
};
