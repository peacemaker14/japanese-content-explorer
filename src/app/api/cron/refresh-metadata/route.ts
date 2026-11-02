import { authorizedCron } from "@/lib/cron-auth";
import { refreshMetadata } from "@/lib/metadata-maintenance";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(request: Request) {
  const started = Date.now();
  if (!authorizedCron(request.headers.get("authorization")))
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await refreshMetadata({ deadline: started + 40000 });
    return Response.json(result, {
      status: !result.skipped && result.status === "partial" ? 502 : 200,
    });
  } catch {
    return Response.json(
      { error: "Database maintenance failed" },
      { status: 500 },
    );
  }
}
