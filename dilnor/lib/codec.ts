// Compactação gzip nativa do navegador (CompressionStream) para publicar/ler a base online.
export async function gzipJSON(obj: unknown): Promise<Uint8Array> {
  const stream = new Blob([JSON.stringify(obj)]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function gunzipJSON<T>(buf: ArrayBuffer): Promise<T> {
  const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
  return JSON.parse(await new Response(stream).text()) as T;
}
