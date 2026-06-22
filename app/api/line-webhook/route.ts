import { NextRequest, NextResponse } from "next/server";
import { webhook } from "@line/bot-sdk";
import { verifySignature, replyText } from "@/lib/line";
import { getFaq } from "@/lib/sheet";
import { askGemini, DEFAULT_REPLY } from "@/lib/gemini";

export const runtime = "nodejs";

const GEMINI_TIMEOUT_MS = 8_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("gemini timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

async function handleEvent(event: webhook.Event): Promise<void> {
  if (
    event.type !== "message" ||
    event.message.type !== "text" ||
    !event.replyToken
  ) {
    return;
  }

  const replyToken = event.replyToken;
  const userMessage = event.message.text;

  let reply = DEFAULT_REPLY;

  try {
    const faq = await getFaq();
    console.log("[line-webhook] faq loaded", {
      count: faq.length,
      sample: faq[0],
    });
    const result = await withTimeout(
      askGemini(faq, userMessage),
      GEMINI_TIMEOUT_MS,
    );
    reply = result.text;
  } catch (err) {
    console.error("[line-webhook] failed to generate reply", err);
  }

  try {
    await replyText(replyToken, reply);
  } catch (err) {
    console.error("[line-webhook] failed to reply to LINE", err);
  }
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-line-signature");

  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  const body = JSON.parse(rawBody) as { events: webhook.Event[] };
  const events = body.events ?? [];

  await Promise.all(events.map(handleEvent));

  return NextResponse.json({ status: "ok" });
}
