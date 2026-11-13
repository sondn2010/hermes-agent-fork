/** The api_server's advertised model name: a named profile's own name, else "hermes-agent". */
export function advertisedModel(profile: string): string {
  return profile && profile !== "default" && profile !== "custom" ? profile : "hermes-agent";
}

/**
 * Client snippets for an OpenAI-compatible API server. They reference ``$API_SERVER_KEY`` from
 * the caller's environment and never embed a real key value.
 */
export function apiKeySamples(baseUrl: string, model: string): { curl: string; python: string } {
  const curl = [
    `curl ${baseUrl}/chat/completions \\`,
    `  -H "Authorization: Bearer $API_SERVER_KEY" \\`,
    `  -H "Content-Type: application/json" \\`,
    `  -d '{"model": ${JSON.stringify(model)}, "messages": [{"role": "user", "content": "Hello"}]}'`,
  ].join("\n");
  const python = [
    "import os",
    "from openai import OpenAI",
    "",
    `client = OpenAI(base_url="${baseUrl}", api_key=os.environ["API_SERVER_KEY"])`,
    "reply = client.chat.completions.create(",
    `    model=${JSON.stringify(model)},`,
    '    messages=[{"role": "user", "content": "Hello"}],',
    ")",
    "print(reply.choices[0].message.content)",
  ].join("\n");
  return { curl, python };
}
