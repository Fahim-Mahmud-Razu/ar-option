/** ৳1,234.50. Display only; the server calculates every amount. */
export const taka = (n: number): string =>
  `৳${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const newClientRef = (prefix: string): string =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
