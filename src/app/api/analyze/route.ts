import Groq from "groq-sdk";
import { NextRequest, NextResponse } from "next/server";

// groq/compound-mini  →  API id: compound-beta-mini
const PRIMARY_MODEL   = "compound-beta-mini";
// fallback: meta-llama/llama-4-scout-17b-16e-instruct
const FALLBACK_MODEL  = "meta-llama/llama-4-scout-17b-16e-instruct";

const client = new Groq({ apiKey: process.env.GROQ_API_KEY });

function buildSystemPrompt(headers: string[], rowCount: number, sample: string, sampledRows: number): string {
  return `You are Junior Accountant, an expert AI financial analyst. You have been given a CSV dataset with the following structure:

Columns (${headers.length}): ${headers.join(", ")}
Total rows in dataset: ${rowCount}
Rows included in this sample: ${sampledRows}

CSV sample (cells truncated at 40 chars for brevity):
${sample}

Your job is to answer the user's questions about this data. You can:
- Summarise trends, totals, and patterns
- Identify anomalies or outliers
- Calculate aggregates (sum, average, min, max) when asked
- Provide accounting and financial insights
- Suggest what the data means in a business context

Be concise, accurate, and use markdown formatting for tables or lists when helpful.`;
}

function isFallbackError(err: unknown): boolean {
  if (!(err instanceof Error)) return true;
  const msg = err.message.toLowerCase();
  // Trigger fallback on model-level failures, not on auth/quota hard stops
  return (
    msg.includes("model") ||
    msg.includes("not found") ||
    msg.includes("unavailable") ||
    msg.includes("rate limit") ||
    msg.includes("overloaded") ||
    msg.includes("529") ||
    msg.includes("503")
  );
}

export async function POST(req: NextRequest) {
  try {
    const { question, headers, rows } = await req.json() as {
      question: string;
      headers: string[];
      rows: Record<string, string>[];
    };

    if (!question?.trim() || !headers?.length || !rows?.length) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    // Build a CSV sample that fits within a safe character budget.
    // Truncate individual cell values and stop adding rows once the budget is hit.
    const CELL_MAX = 40;          // max chars per cell
    const SAMPLE_CHAR_BUDGET = 3000; // max chars for the entire CSV block

    const truncateCell = (v: string) =>
      v.length > CELL_MAX ? v.slice(0, CELL_MAX) + "…" : v;

    const headerLine = headers.map(truncateCell).join(",");
    const csvLines: string[] = [headerLine];
    let budget = SAMPLE_CHAR_BUDGET - headerLine.length;

    for (const row of rows) {
      const line = headers
        .map((h) => {
          const val = truncateCell(row[h] ?? "");
          return val.includes(",") ? `"${val}"` : val;
        })
        .join(",");
      if (budget - line.length - 1 < 0) break;
      csvLines.push(line);
      budget -= line.length + 1;
    }

    const sampleCsv = csvLines.join("\n");

    const sampledRows = csvLines.length - 1; // exclude header line
    const systemPrompt = buildSystemPrompt(headers, rows.length, sampleCsv, sampledRows);
    const messages: Groq.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: question },
    ];

    let usedModel = PRIMARY_MODEL;
    let usedFallback = false;
    let completion: Groq.Chat.ChatCompletion;

    try {
      completion = await client.chat.completions.create({
        model: PRIMARY_MODEL,
        messages,
        temperature: 0.3,
        max_tokens: 800,
      });
    } catch (primaryErr) {
      if (!isFallbackError(primaryErr)) throw primaryErr;

      console.warn(
        `[analyze] ${PRIMARY_MODEL} failed (${(primaryErr as Error).message}). ` +
        `Falling back to ${FALLBACK_MODEL}.`
      );

      usedModel = FALLBACK_MODEL;
      usedFallback = true;
      completion = await client.chat.completions.create({
        model: FALLBACK_MODEL,
        messages,
        temperature: 0.3,
        max_tokens: 800,
      });
    }

    const answer = completion.choices[0]?.message?.content ?? "No response generated.";
    return NextResponse.json({ answer, model: usedModel, fallback: usedFallback });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
