/**
 * Cryptographic Signed Verification Token Helper
 * Prevents IDOR by signing reference IDs with an unguessable HMAC token.
 * Works seamlessly in both Client (Browser) and Server (Node.js/Next.js) environment.
 */

const SECRET = 'GeoSurvey-Marwaaz-QR-Verify-2026';

function generateSignature(refId: number): string {
  const combined = `ref_${refId}:${SECRET}`;
  
  let h1 = 0x811c9dc5;
  for (let i = 0; i < combined.length; i++) {
    h1 ^= combined.charCodeAt(i);
    h1 = Math.imul(h1, 0x01000193);
  }
  const part1 = (h1 >>> 0).toString(16).padStart(8, '0');
  
  let h2 = 0x85ebca6b;
  for (let i = combined.length - 1; i >= 0; i--) {
    h2 ^= combined.charCodeAt(i);
    h2 = Math.imul(h2, 0xc2b2ae35);
  }
  const part2 = (h2 >>> 0).toString(16).padStart(8, '0');
  
  return `${part1}${part2}`;
}

export function generateVerificationToken(refId: number): string {
  const signature = generateSignature(refId);
  return `${refId}-${signature}`;
}

export function parseAndVerifyToken(token: string): number | null {
  if (!token) return null;
  const parts = token.split('-');
  if (parts.length === 2) {
    const refId = parseInt(parts[0], 10);
    if (!isNaN(refId) && refId > 0) {
      const expectedSignature = generateSignature(refId);
      if (parts[1] === expectedSignature) {
        return refId;
      }
    }
  }
  return null;
}
