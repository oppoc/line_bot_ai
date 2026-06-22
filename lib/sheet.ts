import { FaqRow } from "@/types";

const CACHE_TTL_MS = 60_000;

let cache: { data: FaqRow[]; expiresAt: number } | null = null;

function parseCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < csv.length; i++) {
    const char = csv[i];
    const next = csv[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && next === "\n") continue;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

function rowsToFaq(rows: string[][]): FaqRow[] {
  if (rows.length === 0) return [];

  const [header, ...body] = rows;
  const normalized = header.map((h) => h.trim().toLowerCase());
  const questionIdx = normalized.indexOf("question");
  const answerIdx = normalized.indexOf("answer");
  const categoryIdx = normalized.indexOf("category");

  return body
    .map((r) => ({
      question: (r[questionIdx] ?? "").trim(),
      answer: (r[answerIdx] ?? "").trim(),
      category: categoryIdx >= 0 ? (r[categoryIdx] ?? "").trim() : "",
    }))
    .filter((r) => r.question && r.answer);
}

export async function getFaq(): Promise<FaqRow[]> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) {
    return cache.data;
  }

  const sheetUrl = process.env.SHEET_CSV_URL;
  if (!sheetUrl) {
    throw new Error("SHEET_CSV_URL is not set");
  }

  try {
    const res = await fetch(sheetUrl, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`Sheet fetch failed with status ${res.status}`);
    }

    const csv = await res.text();
    const rows = parseCsv(csv);
    const data = rowsToFaq(rows);
    console.log("[sheet] fetched", {
      status: res.status,
      url: sheetUrl,
      csvLength: csv.length,
      csvHead: csv.slice(0, 80),
      rowCount: rows.length,
      header: rows[0],
      faqCount: data.length,
    });
    cache = { data, expiresAt: now + CACHE_TTL_MS };
    return data;
  } catch (err) {
    console.error("[sheet] failed to fetch FAQ from Google Sheet", err);
    // Keep serving the last known-good FAQ data (even if expired) on failure.
    if (cache) {
      return cache.data;
    }
    throw err;
  }
}

export function faqToPromptString(faq: FaqRow[]): string {
  return faq
    .map(
      (row, i) =>
        `${i + 1}. คำถาม: ${row.question}\nคำตอบ: ${row.answer}\nหมวดหมู่: ${row.category}`,
    )
    .join("\n\n");
}
