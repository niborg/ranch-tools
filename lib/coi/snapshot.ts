export async function snapshotCoiFile(file: File): Promise<File> {
  const bytes = await file.arrayBuffer();
  if (bytes.byteLength === 0) {
    throw new Error("empty file");
  }

  return new File([bytes], file.name, {
    type: file.type || "application/pdf",
    lastModified: file.lastModified,
  });
}
