// Upstream-sync tripwire: everything bkt-chat sends, answers or consumes must still exist in the
// machine-readable gateway contract (apps/shared/src/gateway-contract.openrpc.json, generated from
// tui_gateway/contracts) and in the event map apps/shared/src/gateway-events.ts exports.
import contract from "@hermes/shared/gateway-contract.openrpc.json";
import { BACKEND_EVENT_NAMES } from "@hermes/shared/gateway-events";
import { ANSWERED_SERVER_REQUESTS, APPROVAL_CHOICES, CHAT_METHOD_PARAMS, CHAT_METHODS, CONSUMED_EVENTS } from "./protocol";

interface Schema {
  $ref?: string;
  properties?: Record<string, unknown>;
  enum?: string[];
}
interface Entry {
  name: string;
  params: Array<{ schema: Schema }>;
  result?: { schema: Schema };
}

const doc = contract as unknown as {
  methods: Entry[];
  "x-server-requests": Entry[];
  "x-notifications": Entry[];
  components: { schemas: Record<string, Schema> };
};

function resolve(schema: Schema | undefined): Schema {
  const ref = schema?.$ref;
  if (!ref) return schema ?? {};
  const resolved = doc.components.schemas[ref.split("/").pop() as string];
  if (!resolved) throw new Error(`unresolved schema ${ref}`);
  return resolved;
}

const byName = (list: Entry[]) => new Map(list.map((entry) => [entry.name, entry]));
const methods = byName(doc.methods);
const serverRequests = byName(doc["x-server-requests"]);
const notifications = byName(doc["x-notifications"]);

describe("gateway contract used by bkt-chat", () => {
  it.each(CHAT_METHODS)("method %s exists and accepts every param bkt-chat sends", (method) => {
    const entry = methods.get(method);
    expect(entry, `${method} missing from openrpc methods`).toBeDefined();
    const properties = Object.keys(resolve(entry?.params[0]?.schema).properties ?? {});
    // Param schemas are closed (additionalProperties: false): an unknown key fails the call.
    for (const key of CHAT_METHOD_PARAMS[method]) expect(properties, `${method}.${key}`).toContain(key);
    // The socket is host-scoped: every call must be able to name its profile.
    expect(properties, `${method} takes no profile`).toContain("profile");
  });

  it.each(ANSWERED_SERVER_REQUESTS)("server request %s exists", (name) => {
    expect(serverRequests.has(name), `${name} missing from x-server-requests`).toBe(true);
  });

  it("approval answers use choices the contract defines", () => {
    const result = resolve(serverRequests.get("approval")?.result?.schema);
    const choice = resolve(result.properties?.choice as Schema);
    expect(choice.enum).toEqual(expect.arrayContaining([...APPROVAL_CHOICES]));
  });

  it("clarify answers carry answers and outcome", () => {
    const result = resolve(serverRequests.get("clarify")?.result?.schema);
    expect(Object.keys(result.properties ?? {})).toEqual(expect.arrayContaining(["answers", "outcome"]));
  });

  it.each(CONSUMED_EVENTS)("event %s is a backend notification in the event map", (name) => {
    expect(BACKEND_EVENT_NAMES as readonly string[]).toContain(name);
    expect(notifications.has(name), `${name} missing from x-notifications`).toBe(true);
  });
});
