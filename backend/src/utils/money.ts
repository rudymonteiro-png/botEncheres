/**
 * Helpers de conversion monetaire.
 *
 * Sorare expose :
 *  - PrivateFiatWalletAccount.availableBalance : Int en CENTIMES
 *  - MangopayWalletTransfer.amount : Int en CENTIMES
 *  - TokenAuction.currentPrice / minNextBid : String dans la devise de l'auction
 *  - amounts { eur } : Int en CENTIMES
 *
 * On normalise tout en CENTIMES (entier) cote bot pour comparer sans flottant.
 */

/** Parse un montant string Sorare (peut etre en centimes deja, ou un nombre). */
export function parsePriceToCents(raw: string | number | null | undefined): number {
  if (raw === null || raw === undefined) return 0;
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (Number.isNaN(n)) return 0;
  // Les prix d'auction fiat sont retournes en centimes (entiers) par l'API.
  return Math.round(n);
}

/** Formatte des centimes en chaine lisible (ex: 1234 -> "12.34"). */
export function centsToString(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return '-';
  return (cents / 100).toFixed(2);
}

/** Convertit des euros (string ou number) en centimes. */
export function eurosToCents(euros: string | number): number {
  const n = typeof euros === 'number' ? euros : Number(euros);
  if (Number.isNaN(n)) return 0;
  return Math.round(n * 100);
}
