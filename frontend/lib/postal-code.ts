// Postal codes are stored as T2P1J9 and shown as T2P 1J9 (design spec section 6)
export function formatPostalCode(code: string): string {
    return `${code.slice(0, 3)} ${code.slice(3)}`;
}
