export interface DecodedVinResult {
  year?: number;
  make?: string;
  model?: string;
  trim?: string;
  error?: string;
}

function toTitleCase(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .map((word) => {
      if (word.length <= 3 && /^[A-Z0-9-]+$/i.test(word)) {
        // Keep short uppercase acronyms like GMC, BMW, RAM, XLT, AWD, SS
        return word.toUpperCase();
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

export async function decodeVin(rawVin: string): Promise<DecodedVinResult> {
  const vin = rawVin.trim().toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, '');
  if (vin.length !== 17) {
    return { error: 'Enter a valid 17-character VIN (letters I, O, Q are not used).' };
  }

  try {
    const res = await fetch(
      `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(vin)}?format=json`
    );
    if (!res.ok) {
      return { error: `NHTSA lookup failed (HTTP ${res.status}).` };
    }
    const json = await res.json();
    const row = json?.Results?.[0];
    if (!row) {
      return { error: 'No vehicle data returned by NHTSA.' };
    }

    const parsedYear = Number(row.ModelYear);
    const year = Number.isFinite(parsedYear) && parsedYear >= 1980 ? parsedYear : undefined;
    const make = row.Make ? toTitleCase(String(row.Make)) : undefined;
    const model = row.Model ? String(row.Model).trim() : undefined;
    const trim = row.Trim ? String(row.Trim).trim() : undefined;

    if (!year && !make && !model) {
      return { error: 'VIN could not be decoded. Check the characters and try again.' };
    }

    return { year, make, model, trim };
  } catch {
    return { error: 'Network unavailable — fill fields manually while offline.' };
  }
}
