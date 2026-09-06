import { isAuthenticatedRequest } from "@/lib/auth";
import { persistCoiUpload, fileFromUploadRequest } from "@/lib/coi/upload";
import { validateCoiFile } from "@/lib/coi/validate";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isAuthenticatedRequest(request)) {
    console.warn("COI upload rejected", "Please log in again.", {
      hasCookieHeader: Boolean(request.headers.get("cookie")),
    });
    return Response.json({ error: "Please log in again." }, { status: 401 });
  }

  const validation = validateCoiFile(await fileFromUploadRequest(request));
  if (!validation.ok) {
    console.warn("COI upload rejected", validation.error);
    return Response.json({ error: validation.error }, { status: 400 });
  }

  try {
    const id = await persistCoiUpload(validation.file);
    console.log("COI uploaded", id);
    return Response.json({ id });
  } catch (error) {
    console.error("COI upload failed", error);
    return Response.json(
      { error: "Uploads aren't configured yet." },
      { status: 503 },
    );
  }
}
