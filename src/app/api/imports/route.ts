import { isSampleFile } from "@/domain/driving/samples";
import { apiError, newRequestId } from "@/server/http";
import { createImport, detectFormat, findDuplicate, logImport, maxImportBytes, publicPreview, sha256Bytes } from "@/server/imports/service";
import { personaForRequest } from "@/server/profiles";
import { ownerId } from "@/server/session";

// Room for the multipart boundaries and the other form fields around the file itself.
const MULTIPART_OVERHEAD = 16 * 1024;

// POST /api/imports (multipart: file, vehicleId, sample=1?) → 201 { requestId, preview }, or 200 for a duplicate.
export async function POST(req: Request) {
  const startedAt = Date.now();
  const owner = await ownerId();
  const requestId = newRequestId();
  const max = maxImportBytes();
  const tooLarge = () => {
    logImport(requestId, null, "file_too_large", startedAt);
    return apiError(413, "file_too_large", `Files up to ${(max / 1024 / 1024).toFixed(0)} MiB are accepted.`, false, requestId);
  };

  // Checked before the body is read.
  if (Number(req.headers.get("content-length") ?? 0) > max + MULTIPART_OVERHEAD) return tooLarge();

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return apiError(400, "invalid_form", "Send the file as multipart/form-data.", false, requestId);
  }
  const file = form.get("file");
  const vehicleId = form.get("vehicleId");
  if (!(file instanceof File)) {
    return apiError(400, "invalid_form", "Attach a file.", false, requestId, { file: "Required" });
  }
  if (typeof vehicleId !== "string" || !(await personaForRequest(vehicleId))) {
    return apiError(400, "invalid_vehicle", "Unknown vehicle.", false, requestId, { vehicleId: "Unknown vehicle" });
  }
  const sample = form.get("sample") === "1";
  if (sample && !isSampleFile(file.name)) {
    return apiError(400, "unknown_sample", "That isn't one of the sample drives.", false, requestId, { file: "Not a sample" });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength > max) return tooLarge(); // the header can lie

  const detected = detectFormat(file.name, bytes);
  if ("code" in detected) {
    logImport(requestId, null, detected.code, startedAt);
    return apiError(detected.status, detected.code, detected.message, false, requestId);
  }

  const contentHash = await sha256Bytes(bytes);
  const duplicate = findDuplicate(owner, vehicleId, contentHash);
  if (duplicate) {
    // Same bytes for the same vehicle: hand back the earlier job; no second job or trip.
    logImport(requestId, duplicate.importId, "duplicate", startedAt);
    return Response.json({ requestId, preview: { ...publicPreview(duplicate), duplicateOf: duplicate.importId } });
  }

  const { job, failure } = createImport({ owner, vehicleId, filename: file.name, bytes, contentHash, sample, ...detected });
  if (failure) {
    logImport(requestId, job.importId, failure.code, startedAt);
    return apiError(failure.status, failure.code, failure.message, false, requestId);
  }
  logImport(requestId, job.importId, "preview_ready", startedAt);
  return Response.json({ requestId, preview: publicPreview(job) }, { status: 201 });
}
