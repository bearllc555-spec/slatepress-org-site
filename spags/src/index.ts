import { handleRequest } from "./routes";
import type { Env } from "./types";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      return await handleRequest(request, env, ctx);
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : "Internal server error";
      return Response.json({ error: message }, { status: 500 });
    }
  },
} satisfies ExportedHandler<Env>;
