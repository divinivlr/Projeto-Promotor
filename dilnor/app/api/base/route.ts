// Base compartilhada (online para todos): armazenada no Vercel Blob, já processada e compactada (gzip) pelo navegador.
//  GET  /api/base            -> versão mais recente (bytes gzip)  · 404 quando não há base publicada/armazenamento
//  GET  /api/base?meta=1     -> status da configuração + histórico de versões
//  POST /api/base            -> publica nova versão (cabeçalho x-admin-key = ADMIN_PASSWORD; corpo = JSON gzip)
//  POST /api/base?restore=<pathname> -> republica uma versão anterior como a mais recente
import { createHash, timingSafeEqual } from 'node:crypto';
import { del, list, put } from '@vercel/blob';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PREFIX = 'dilnor/base/';
const KEEP = 10; // versões mantidas no histórico
const MAX_BYTES = 4 * 1024 * 1024; // limite de corpo das funções da Vercel é 4,5 MB

const hasBlob = () => !!process.env.BLOB_READ_WRITE_TOKEN;
const hasAdmin = () => !!process.env.ADMIN_PASSWORD;

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

function authorized(req: Request) {
  const expected = process.env.ADMIN_PASSWORD;
  const given = req.headers.get('x-admin-key') || '';
  if (!expected) return false;
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

async function versions() {
  const out: { url: string; pathname: string; size: number; uploadedAt: string }[] = [];
  let cursor: string | undefined;
  do {
    const r = await list({ prefix: PREFIX, cursor, limit: 1000 });
    r.blobs.forEach((b) => out.push({ url: b.url, pathname: b.pathname, size: b.size, uploadedAt: new Date(b.uploadedAt).toISOString() }));
    cursor = r.hasMore ? r.cursor : undefined;
  } while (cursor);
  return out.sort((x, y) => y.uploadedAt.localeCompare(x.uploadedAt));
}

async function store(bytes: Uint8Array) {
  const blob = await put(`${PREFIX}base-${Date.now()}.json.gz`, Buffer.from(bytes), {
    access: 'public',
    addRandomSuffix: true, // URL impossível de adivinhar; o acesso normal passa por esta rota
    contentType: 'application/gzip',
    cacheControlMaxAge: 60,
  });
  const all = await versions();
  const old = all.slice(KEEP).map((v) => v.url);
  if (old.length) await del(old);
  return blob;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get('meta')) {
    if (!hasBlob()) return json({ blob: false, admin: hasAdmin(), versions: [] });
    try {
      const v = await versions();
      return json({ blob: true, admin: hasAdmin(), versions: v.map(({ pathname, size, uploadedAt }) => ({ pathname, size, uploadedAt })) });
    } catch (e) {
      return json({ blob: true, admin: hasAdmin(), versions: [], error: String(e) });
    }
  }
  if (!hasBlob()) return json({ error: 'Armazenamento online não configurado' }, 404);
  try {
    const [latest] = await versions();
    if (!latest) return json({ error: 'Nenhuma base publicada' }, 404);
    const r = await fetch(latest.url, { cache: 'no-store' });
    if (!r.ok) return json({ error: `Falha ao ler a base (${r.status})` }, 502);
    return new Response(await r.arrayBuffer(), {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Cache-Control': 'no-store',
        'X-Base-Encoding': 'gzip',
        'X-Base-Uploaded-At': latest.uploadedAt,
      },
    });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
}

export async function POST(req: Request) {
  if (!hasBlob()) return json({ error: 'Armazenamento online (Vercel Blob) não configurado no projeto.' }, 501);
  if (!hasAdmin()) return json({ error: 'Defina a variável ADMIN_PASSWORD no projeto da Vercel.' }, 501);
  if (!authorized(req)) return json({ error: 'Senha de administrador inválida.' }, 401);

  const restore = new URL(req.url).searchParams.get('restore');
  try {
    if (restore) {
      const v = (await versions()).find((x) => x.pathname === restore);
      if (!v) return json({ error: 'Versão não encontrada.' }, 404);
      const r = await fetch(v.url, { cache: 'no-store' });
      if (!r.ok) return json({ error: `Falha ao ler a versão (${r.status})` }, 502);
      const blob = await store(new Uint8Array(await r.arrayBuffer()));
      return json({ ok: true, pathname: blob.pathname });
    }
    const bytes = new Uint8Array(await req.arrayBuffer());
    if (bytes.length > MAX_BYTES) return json({ error: 'Base compactada acima de 4 MB.' }, 413);
    if (bytes.length < 100 || bytes[0] !== 0x1f || bytes[1] !== 0x8b) return json({ error: 'Conteúdo inválido (esperado JSON compactado em gzip).' }, 400);
    const blob = await store(bytes);
    return json({ ok: true, pathname: blob.pathname });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
}
