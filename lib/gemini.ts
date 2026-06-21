import { GoogleGenAI } from "@google/genai";
import { FaqRow, GeminiResult } from "@/types";
import { faqToPromptString } from "@/lib/sheet";

const MODEL = "gemini-3.5-flash";
const TEMPERATURE = 1.0; // default — อย่าปรับลด, Gemini 3.x จะเพี้ยน
const MAX_OUTPUT_TOKENS = 1024; // Gemini 3.x นับ thinking + output รวมกัน

export const DEFAULT_REPLY =
  "ขออภัยด้วยนะคะ คำถามนี้ดิฉันไม่มีข้อมูลที่แน่ชัดอยู่ในระบบค่ะ เพื่อความถูกต้องและไม่ให้ข้อมูลผิดพลาด รบกวนติดต่อไพลินโดยตรงที่เบอร์ 098-889-5155 นะคะ ทางทีมงานจะดูแลและให้ข้อมูลที่ถูกต้องกับคุณค่ะ";

const SYSTEM_PROMPT_TEMPLATE = `<role>
คุณคือไพลิน พนักงานของบริษัท MSL ผู้จำหน่ายอุปกรณ์และเครื่องมือทางการแพทย์
</role>

<constraints>
- ตอบโดยใช้ข้อมูลใน <faq> เท่านั้น ห้ามแต่งราคา เวลา หรือสถานที่ตั้งเพิ่มเอง
- ถ้าคำถามไม่มีคำตอบที่ตรงหรือใกล้เคียงพอใน <faq> ให้ตอบด้วยข้อความนี้เท่านั้น (ห้ามแต่งเอง):
  "${DEFAULT_REPLY}"
- โทนภาษา: สุภาพทางการ ลงท้ายด้วยค่ะ/นะคะทุกประโยค ห้ามใช้ emoji
- ความยาวคำตอบ: 2-3 ประโยค อธิบายละเอียดพอสมควร แต่ไม่เยิ่นเย้อ
</constraints>

<output_format>
ภาษาไทย ไม่ใช้ markdown ไม่ใช้ bullet point ตอบเป็นข้อความธรรมดาต่อเนื่อง
</output_format>

<faq>
{{FAQ_CSV_DATA}}
</faq>

<question>
{{USER_MESSAGE}}
</question>`;

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (!client) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not set");
    }
    client = new GoogleGenAI({ apiKey });
  }
  return client;
}

function buildPrompt(faq: FaqRow[], userMessage: string): string {
  return SYSTEM_PROMPT_TEMPLATE.replace(
    "{{FAQ_CSV_DATA}}",
    faqToPromptString(faq),
  ).replace("{{USER_MESSAGE}}", userMessage);
}

export async function askGemini(
  faq: FaqRow[],
  userMessage: string,
): Promise<GeminiResult> {
  const prompt = buildPrompt(faq, userMessage);

  const response = await getClient().models.generateContent({
    model: MODEL,
    contents: prompt,
    config: {
      temperature: TEMPERATURE,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
    },
  });

  const finishReason = response.candidates?.[0]?.finishReason;
  const thoughtsTokenCount = response.usageMetadata?.thoughtsTokenCount;
  const candidatesTokenCount = response.usageMetadata?.candidatesTokenCount;

  console.log("[gemini] usage", {
    finishReason,
    thoughtsTokenCount,
    candidatesTokenCount,
  });

  // ตัดประโยคกลางทาง ห้ามส่งให้ลูกค้า ใช้ default_reply แทน
  if (finishReason === "MAX_TOKENS") {
    return {
      text: DEFAULT_REPLY,
      shouldFallback: true,
      finishReason,
      thoughtsTokenCount,
      candidatesTokenCount,
    };
  }

  const text = response.text?.trim();
  if (!text) {
    return {
      text: DEFAULT_REPLY,
      shouldFallback: true,
      finishReason,
      thoughtsTokenCount,
      candidatesTokenCount,
    };
  }

  return {
    text,
    shouldFallback: false,
    finishReason,
    thoughtsTokenCount,
    candidatesTokenCount,
  };
}
