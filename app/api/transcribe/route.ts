import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { getAuthUserFromRequest } from "@/lib/auth";

const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const BodySchema = z.object({
  images: z.array(z.string()).min(1).max(8)
});

function isValidImageDataUrl(v: string) {
  return /^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(v);
}

function decodedBytesFromDataUrl(v: string) {
  const b64 = v.split(",")[1] || "";
  return Math.floor((b64.length * 3) / 4);
}

function unreadableHint(text: string) {
  const lowSignal = text.length < 80;
  const hasMostlyNoise = /[^a-zA-Z0-9\s.,;:()%-]/.test(text) && text.split(/\s+/).length < 20;
  return lowSignal || hasMostlyNoise;
}

async function callAnthropic(images: string[]) {
  const content: Array<unknown> = [
    {
      type: "text",
      text: "Transcribe the handwritten economics response as clean plain text. If unclear words, use [illegible]. Return plain text only."
    }
  ];

  for (const imageDataUrl of images) {
    if (!imageDataUrl?.startsWith("data:image/")) continue;
    const [meta, b64] = imageDataUrl.split(",");
    const mediaType = meta.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64$/)?.[1] || "image/jpeg";
    if (!b64) continue;
    content.push({ type: "image", source: { type: "base64", media_type: mediaType, data: b64 } });
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY || "",
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: process.env.ELITEECON_MODEL || "claude-haiku-4-5",
      max_tokens: 1400,
      temperature: 0,
      messages: [{ role: "user", content }]
    })
  });

  if (!res.ok) throw new Error(`Anthropic error ${res.status}`);
  const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  return data.content?.find((c) => c.type === "text")?.text || "";
}

export async function POST(req: Request) {
  try {
    const user = await getAuthUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized. Missing x-eliteecon-user." }, { status: 401 });
    }

    const ip = getClientIp(req);
    const rl = checkRateLimit(`transcribe:${ip}`, 15, 60_000);
    if (!rl.ok) {
      return NextResponse.json({ error: "Rate limit exceeded. Try again in a minute." }, { status: 429 });
    }

    const body = await req.json();
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
    }

    const validImages = parsed.data.images.filter((img) => isValidImageDataUrl(img) && decodedBytesFromDataUrl(img) <= MAX_IMAGE_BYTES);
    if (validImages.length === 0) {
      return NextResponse.json({ error: "No valid images supplied." }, { status: 400 });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: "Transcription unavailable (no API key configured)." }, { status: 503 });
    }

    const transcript = (await callAnthropic(validImages)).trim();
    const unreadable = unreadableHint(transcript) || transcript.includes("[illegible]");

    return NextResponse.json({
      transcript,
      unreadable,
      message: unreadable
        ? "Image quality may be too low. Retake in bright light and keep full page in frame."
        : "Transcription looks usable."
    });
  } catch {
    return NextResponse.json({
      error: "Could not transcribe image. Try retaking with better lighting and focus."
    }, { status: 502 });
  }
}
