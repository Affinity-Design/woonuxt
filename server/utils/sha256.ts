// Workers-safe SHA-256 (hex). node:crypto's createHash is an unimplemented unenv stub on the
// deployed Cloudflare Workers runtime — "[unenv] crypto.createHash is not implemented yet!"
// took Helcim checkout down at initialize on 2026-08-05. Web Crypto's subtle.digest works on
// Workers and Node (>=15) alike and produces identical digests, so derived values (attempt
// invoice numbers, charge fingerprints) stay stable across the migration.
export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
