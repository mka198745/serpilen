export class MultipartTooLarge extends Error {}

/** Bounds actual multipart bytes even if Content-Length is absent or false. */
export async function readBoundedMultipart(request: Request, maxBytes: number): Promise<FormData> {
  const length = request.headers.get("content-length");
  if (length && /^\d+$/.test(length) && Number(length) > maxBytes) throw new MultipartTooLarge();
  if (!request.body) throw new Error("Missing multipart body");
  const reader = request.body.getReader();
  let bytes = 0, exceeded = false;
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const chunk = await reader.read();
        if (chunk.done) { controller.close(); reader.releaseLock(); return; }
        bytes += chunk.value.byteLength;
        if (bytes > maxBytes) {
          exceeded = true;
          await reader.cancel();
          reader.releaseLock();
          controller.error(new MultipartTooLarge());
          return;
        }
        controller.enqueue(chunk.value);
      } catch (error) { controller.error(error); }
    },
    async cancel() { await reader.cancel(); reader.releaseLock(); },
  });
  try {
    const bounded = new Request(request.url, { method: "POST", headers: request.headers, body: stream, duplex: "half" } as RequestInit & { duplex: "half" });
    return await bounded.formData();
  } catch (error) {
    if (exceeded) throw new MultipartTooLarge();
    throw error;
  }
}
