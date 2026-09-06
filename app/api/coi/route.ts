import { uploadCoi } from "@/app/actions/coi";

export const runtime = "nodejs";

function statusFor(error: string): number {
  if (error === "Please log in again.") {
    return 401;
  }
  if (error === "Uploads aren't configured yet.") {
    return 503;
  }
  return 400;
}

export async function POST(request: Request) {
  const result = await uploadCoi(undefined, await request.formData());
  if (result.error) {
    return Response.json({ error: result.error }, { status: statusFor(result.error) });
  }

  return Response.json({ id: result.id });
}
