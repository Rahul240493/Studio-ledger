// Remote MCP endpoint (Streamable HTTP, stateless JSON responses) for Claude's custom connectors.
// The personal key in the URL identifies the team member. Work tools only: see lib/mcp.js.
import "@/lib/settings";
import { userForKey, TOOLS, callTool, INSTRUCTIONS } from "@/lib/mcp";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const ok = (id, result) => ({ jsonrpc: "2.0", id, result });
const fail = (id, code, message) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

async function handleOne(msg, user) {
  const { id, method, params = {} } = msg || {};
  const isNote = id === undefined || id === null;
  switch (method) {
    case "initialize":
      return ok(id, {
        protocolVersion: VERSIONS.includes(params.protocolVersion) ? params.protocolVersion : VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "studio-ledger-work", title: "Studio Ledger (work)", version: "1.0.0" },
        instructions: `${INSTRUCTIONS}\nYou are working as ${user.name} (${user.email}).`,
      });
    case "ping": return ok(id, {});
    case "tools/list": return ok(id, { tools: TOOLS });
    case "tools/call": {
      try {
        const out = await callTool(user, params.name, params.arguments || {});
        return ok(id, { content: [{ type: "text", text: JSON.stringify(out, null, 1) }], structuredContent: Array.isArray(out) ? { items: out } : out });
      } catch (e) {
        if (!e.status) console.error("MCP tool error", params.name, e);
        return ok(id, { content: [{ type: "text", text: e.status ? e.message : "Something went wrong talking to the studio sheet. Try again in a moment." }], isError: true });
      }
    }
    case "resources/list": return ok(id, { resources: [] });
    case "prompts/list": return ok(id, { prompts: [] });
    default:
      if (isNote || String(method || "").startsWith("notifications/")) return null;
      return fail(id, -32601, `Method not found: ${method}`);
  }
}

export async function POST(req, { params }) {
  const user = await userForKey(params.key).catch(() => null);
  if (!user) return Response.json(fail(null, -32001, "This Claude link isn't valid any more. Make a new one in Studio Ledger → Connect Claude."), { status: 401 });
  let body;
  try { body = await req.json(); } catch { return Response.json(fail(null, -32700, "Parse error"), { status: 400 }); }
  const batch = Array.isArray(body);
  const replies = (await Promise.all((batch ? body : [body]).map((m) => handleOne(m, user)))).filter(Boolean);
  if (!replies.length) return new Response(null, { status: 202 });
  return Response.json(batch ? replies : replies[0]);
}
export async function GET() { return new Response("Method not allowed", { status: 405, headers: { Allow: "POST" } }); }
export async function DELETE() { return new Response(null, { status: 405 }); }
