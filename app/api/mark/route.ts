import { NextResponse } from "next/server";
import { z } from "zod";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { MarkResponse } from "@/lib/types";
import { applyBandCalibration, Strictness } from "@/lib/calibration";
import { countSubmissionsThisMonth, saveSubmission } from "@/lib/db";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { getAuthUserFromRequest } from "@/lib/auth";
import { getDefaultEntitlements, usageGuard } from "@/lib/billing";
import { logMarkEvent } from "@/lib/analytics";

// Validate required environment variables on startup (Ollama supported)
if (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
  console.warn("[SECURITY] WARNING: No API keys configured (OPENAI_API_KEY or ANTHROPIC_API_KEY). Marking will fail.");
}

const MAX_TEXT_CHARS = 12000;
const MAX_IMAGE_COUNT = 8;
const MAX_IMAGE_BYTES = 3 * 1024 * 1024; // per image decoded bytes

function isValidImageDataUrl(v?: string) {
  return Boolean(v && /^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(v));
}

function decodedBytesFromDataUrl(v: string) {
  const b64 = v.split(",")[1] || "";
  return Math.floor((b64.length * 3) / 4);
}

const MarkRequestSchema = z.object({
  sectionType: z.enum(["A", "B"]).default("A"),
  questionType: z.union([z.literal(9), z.literal(10), z.literal(15), z.literal(25)]),
  topic: z.string().min(1),
  commandWord: z.string().min(1),
  questionText: z.string().optional().default(""),
  contextText: z.string().optional(),
  studentAnswer: z.string().optional().default(""),
  questionImageDataUrl: z.string().optional(),
  extractImageDataUrl: z.string().optional(),
  answerImageDataUrls: z.array(z.string()).max(MAX_IMAGE_COUNT).optional().default([]),
  strictness: z.enum(["student-friendly", "examiner-strict"]).default("student-friendly")
}).superRefine((val, ctx) => {
  const hasQuestionText = (val.questionText || "").trim().length > 0;
  const hasQuestionImage = Boolean(val.questionImageDataUrl);
  const hasAnswerText = (val.studentAnswer || "").trim().length >= 20;
  const hasAnswerImage = (val.answerImageDataUrls || []).length > 0;
  const hasExtractImage = Boolean(val.extractImageDataUrl);

  if (!hasQuestionText && !hasQuestionImage) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Provide question text or a question photo." });
  }
  const hasContextText = (val.contextText || "").trim().length > 0;
  if (val.sectionType === "A" && !hasExtractImage && !hasContextText) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Section A requires an extract/data photo or context text." });
  }

  if (val.sectionType === "B") {
    const txt = `${val.studentAnswer || ""} ${val.contextText || ""}`.toLowerCase();
    const hasExampleSignal = /(for example|for instance|e\.g\.|uk|usa|china|eu|bank of england|inflation in|unemployment in|gdp in|202\d|201\d)/.test(txt);
    const hasAnswerImage = (val.answerImageDataUrls || []).length > 0;
    if (!hasExampleSignal && !hasAnswerImage) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Section B answers should include at least one real-world example signal." });
    }
  }
  if (!hasAnswerText && !hasAnswerImage) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Provide either written answer text (20+ chars) or answer page photos." });
  }

  if ((val.studentAnswer || "").length > MAX_TEXT_CHARS || (val.questionText || "").length > MAX_TEXT_CHARS || (val.contextText || "").length > MAX_TEXT_CHARS) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Text fields exceed max length (${MAX_TEXT_CHARS} chars).` });
  }

  const images = [val.questionImageDataUrl, val.extractImageDataUrl, ...(val.answerImageDataUrls || [])].filter(Boolean) as string[];
  for (const img of images) {
    if (!isValidImageDataUrl(img)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid image format. Use data:image/*;base64 payloads." });
      continue;
    }
    if (decodedBytesFromDataUrl(img) > MAX_IMAGE_BYTES) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Image too large. Max ${Math.floor(MAX_IMAGE_BYTES / (1024 * 1024))}MB decoded.` });
    }
  }
});

const ResponseSchema = z.object({
  indicative_mark: z.object({ awarded: z.number(), max: z.number(), band: z.string() }),
  section_focus: z.object({
    section: z.enum(["A", "B"]),
    extract_data_usage: z.enum(["strong", "some", "limited", "n/a"]),
    real_world_examples: z.enum(["strong", "some", "limited", "n/a"]),
    note: z.string()
  }),
  ao_breakdown: z.object({
    ao1: z.object({ strength: z.string(), improvement: z.string(), score_hint: z.string() }),
    ao2: z.object({ strength: z.string(), improvement: z.string(), score_hint: z.string() }),
    ao3: z.object({ strength: z.string(), improvement: z.string(), score_hint: z.string() }),
    ao4: z.object({ strength: z.string(), improvement: z.string(), score_hint: z.string() })
  }),
  structure_checks: z.object({
    introduction: z.enum(["present", "partial", "missing"]),
    definitions: z.enum(["accurate", "partial", "missing"]),
    application: z.enum(["strong", "some", "weak"]),
    analysis_chains: z.enum(["developed", "some", "limited"]),
    evaluation_throughout: z.enum(["strong", "some", "limited"]),
    final_judgement: z.enum(["clear_supported", "asserted", "missing"])
  }),
  what_went_well: z.array(z.string()),
  priority_fixes: z.array(z.object({ issue: z.string(), why_it_costs_marks: z.string(), exact_fix: z.string() })),
  rewrite: z.object({ target: z.string(), improved_version: z.string() }),
  next_task: z.string(),
  disclaimer: z.string()
});

const OPENAI_MARK_RESPONSE_SCHEMA = {
  name: "eliteecon_mark_response",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "indicative_mark",
      "section_focus",
      "ao_breakdown",
      "structure_checks",
      "what_went_well",
      "priority_fixes",
      "rewrite",
      "next_task",
      "disclaimer"
    ],
    properties: {
      indicative_mark: {
        type: "object",
        additionalProperties: false,
        required: ["awarded", "max", "band"],
        properties: {
          awarded: { type: "number" },
          max: { type: "number" },
          band: { type: "string" }
        }
      },
      section_focus: {
        type: "object",
        additionalProperties: false,
        required: ["section", "extract_data_usage", "real_world_examples", "note"],
        properties: {
          section: { type: "string", enum: ["A", "B"] },
          extract_data_usage: { type: "string", enum: ["strong", "some", "limited", "n/a"] },
          real_world_examples: { type: "string", enum: ["strong", "some", "limited", "n/a"] },
          note: { type: "string" }
        }
      },
      ao_breakdown: {
        type: "object",
        additionalProperties: false,
        required: ["ao1", "ao2", "ao3", "ao4"],
        properties: {
          ao1: { $ref: "#/$defs/aoItem" },
          ao2: { $ref: "#/$defs/aoItem" },
          ao3: { $ref: "#/$defs/aoItem" },
          ao4: { $ref: "#/$defs/aoItem" }
        }
      },
      structure_checks: {
        type: "object",
        additionalProperties: false,
        required: ["introduction", "definitions", "application", "analysis_chains", "evaluation_throughout", "final_judgement"],
        properties: {
          introduction: { type: "string", enum: ["present", "partial", "missing"] },
          definitions: { type: "string", enum: ["accurate", "partial", "missing"] },
          application: { type: "string", enum: ["strong", "some", "weak"] },
          analysis_chains: { type: "string", enum: ["developed", "some", "limited"] },
          evaluation_throughout: { type: "string", enum: ["strong", "some", "limited"] },
          final_judgement: { type: "string", enum: ["clear_supported", "asserted", "missing"] }
        }
      },
      what_went_well: {
        type: "array",
        items: { type: "string" }
      },
      priority_fixes: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["issue", "why_it_costs_marks", "exact_fix"],
          properties: {
            issue: { type: "string" },
            why_it_costs_marks: { type: "string" },
            exact_fix: { type: "string" }
          }
        }
      },
      rewrite: {
        type: "object",
        additionalProperties: false,
        required: ["target", "improved_version"],
        properties: {
          target: { type: "string" },
          improved_version: { type: "string" }
        }
      },
      next_task: { type: "string" },
      disclaimer: { type: "string" }
    },
    $defs: {
      aoItem: {
        type: "object",
        additionalProperties: false,
        required: ["strength", "improvement", "score_hint"],
        properties: {
          strength: { type: "string" },
          improvement: { type: "string" },
          score_hint: { type: "string" }
        }
      }
    }
  }
} as const;

function fallbackMock(max: 9 | 10 | 15 | 25, strictness: Strictness, sectionType: "A" | "B"): MarkResponse {
  return {
    indicative_mark: { awarded: Math.max(4, Math.floor(max * 0.6)), max, band: "Mid" },
    section_focus: {
      section: sectionType,
      extract_data_usage: sectionType === "A" ? "some" : "n/a",
      real_world_examples: sectionType === "B" ? "some" : "n/a",
      note: sectionType === "A"
        ? "Use more precise extract references and data points in each paragraph."
        : "Use specific real-world examples with country/time/data detail."
    },
    ao_breakdown: {
      ao1: { strength: "Some correct terminology used.", improvement: "Define key terms more precisely.", score_hint: "mid" },
      ao2: { strength: "Some context reference present.", improvement: "Apply each point directly to the case.", score_hint: "mid" },
      ao3: { strength: "At least one causal chain attempted.", improvement: "Develop full because->therefore->impact logic.", score_hint: "mid" },
      ao4: { strength: "Some evaluative language used.", improvement: "Sustain evaluation throughout and end with conditional judgement.", score_hint: "mid" }
    },
    structure_checks: {
      introduction: "partial",
      definitions: "partial",
      application: "some",
      analysis_chains: "some",
      evaluation_throughout: max === 25 ? "limited" : "some",
      final_judgement: "asserted"
    },
    what_went_well: [
      "Clear attempt to answer the question directly.",
      "Relevant economics terminology included.",
      "Some analytical logic is present."
    ],
    priority_fixes: [
      {
        issue: "Definitions are not precise enough.",
        why_it_costs_marks: "Weak AO1 precision lowers confidence in later analysis.",
        exact_fix: "Define each key term in one tight sentence before using it."
      },
      {
        issue: "Application is generic.",
        why_it_costs_marks: "AO2 marks depend on context-specific use.",
        exact_fix: "Anchor each paragraph to a detail from the question/extract."
      },
      {
        issue: "Evaluation is mostly at the end.",
        why_it_costs_marks: "For 25 markers this caps AO4 performance.",
        exact_fix: "Add a mini-evaluation sentence inside each main paragraph."
      }
    ],
    rewrite: {
      target: "First analytical paragraph",
      improved_version: "If the policy raises production costs, firms with inelastic demand may pass most costs onto consumers, increasing prices; however, in more competitive segments with elastic demand, firms may absorb costs through lower margins, so the final inflation effect depends on market structure and demand elasticity."
    },
    next_task: "Rewrite paragraph 2 using one explicit chain of reasoning and one conditional evaluation sentence.",
    disclaimer: `This is indicative AQA-aligned revision feedback (${strictness}), not official examiner marking.`
  };
}

function commandNeedsEvaluation(commandWord: string) {
  return /(evaluate|assess|discuss|to what extent)/i.test(commandWord);
}

async function loadPrompt(questionType: 9 | 10 | 15 | 25) {
  const promptPath = path.join(process.cwd(), "prompts", `mark_${questionType}.txt`);
  return readFile(promptPath, "utf8");
}

function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) throw new Error("No JSON object found");
  return JSON.parse(text.slice(start, end + 1));
}

async function callAnthropic(systemPrompt: string, userPrompt: string, imageDataUrls: string[] = [], model?: string): Promise<unknown> {
  const content: Array<unknown> = [{ type: "text", text: userPrompt }];

  for (const imageDataUrl of imageDataUrls) {
    if (!imageDataUrl?.startsWith("data:image/")) continue;
    const [meta, b64] = imageDataUrl.split(",");
    const mediaType = meta.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64$/)?.[1] || "image/jpeg";
    if (!b64) continue;
    content.push({
      type: "image",
      source: { type: "base64", media_type: mediaType, data: b64 }
    });
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY || "",
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: model || process.env.ELITEECON_MODEL || "claude-3-5-haiku-latest",
      max_tokens: 1600,
      temperature: 0.2,
      system: systemPrompt,
      messages: [{ role: "user", content }]
    })
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Anthropic error ${res.status}: ${errText.slice(0, 300)}`);
  }
  const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  const text = data.content?.find((c) => c.type === "text")?.text || "";
  return extractJson(text);
}

async function callOpenAI(systemPrompt: string, userPrompt: string, imageDataUrls: string[] = [], model?: string): Promise<unknown> {
  const content: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
    { type: "text", text: userPrompt }
  ];

  for (const imageDataUrl of imageDataUrls) {
    if (!imageDataUrl?.startsWith("data:image/")) continue;
    content.push({ type: "image_url", image_url: { url: imageDataUrl } });
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.OPENAI_API_KEY || ""}`
    },
    body: JSON.stringify({
      model: model || process.env.ELITEECON_MODEL || "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content }
      ],
      response_format: { type: "json_schema", json_schema: OPENAI_MARK_RESPONSE_SCHEMA }
    })
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`OpenAI error ${res.status}: ${errText.slice(0, 300)}`);
  }
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = data.choices?.[0]?.message?.content || "";
  return extractJson(text);
}

async function callModel(systemPrompt: string, userPrompt: string, imageDataUrls: string[] = []): Promise<unknown> {
  const configuredModel = (process.env.ELITEECON_MODEL || "").trim();
  const wantsAnthropic = /^claude/i.test(configuredModel);
  const wantsOpenAI = configuredModel.length > 0 && !wantsAnthropic;
  const hasOpenAI = Boolean(process.env.OPENAI_API_KEY);
  const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY);

  if (wantsAnthropic && hasAnthropic) {
    return callAnthropic(systemPrompt, userPrompt, imageDataUrls, configuredModel);
  }
  if (wantsOpenAI && hasOpenAI) {
    return callOpenAI(systemPrompt, userPrompt, imageDataUrls, configuredModel);
  }

  if (hasOpenAI) {
    return callOpenAI(systemPrompt, userPrompt, imageDataUrls, wantsAnthropic ? "gpt-4o-mini" : configuredModel || undefined);
  }
  if (hasAnthropic) {
    return callAnthropic(systemPrompt, userPrompt, imageDataUrls, wantsOpenAI ? "claude-3-5-haiku-latest" : configuredModel || undefined);
  }

  throw new Error("No supported model provider key configured");
}

export async function POST(req: Request) {
  const startTime = Date.now();
  const user = await getAuthUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized. Missing x-eliteecon-user." }, { status: 401 });
  }

  const ip = getClientIp(req);
  const rl = checkRateLimit(`mark:${ip}`, 20, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: "Rate limit exceeded. Try again in a minute." }, { status: 429 });
  }

  const usedThisMonth = await countSubmissionsThisMonth(user.id);
  const entitlements = getDefaultEntitlements();
  const usage = usageGuard(usedThisMonth, entitlements);
  // Allow calibration users to bypass billing limits
  const isCalibrationUser = user.id.startsWith("calibration-") || user.id === "calibration-bot";
  if (!usage.allowed && !isCalibrationUser) {
    return NextResponse.json({
      error: "Monthly submission limit reached for current plan.",
      usage: { usedThisMonth, remaining: usage.remaining, plan: entitlements.tier }
    }, { status: 402 });
  }

  const body = await req.json();
  const parsed = MarkRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;

  // Text-only mode (low cost). Reject image uploads.
  const textOnly = process.env.ELITEECON_TEXT_ONLY === "true";
  if (textOnly && (data.questionImageDataUrl || data.extractImageDataUrl || (data.answerImageDataUrls?.length || 0) > 0)) {
    return NextResponse.json({
      error: "Text-only mode is enabled. Please paste the answer text and remove image uploads.",
      detail: "Image uploads are disabled to reduce costs."
    }, { status: 400 });
  }

  try {
    const allowMockFallback = process.env.ELITEECON_ALLOW_MOCK_FALLBACK === "true";
    if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY) {
      if (!allowMockFallback) {
        return NextResponse.json({ error: "Marking service unavailable: no model key configured." }, { status: 503 });
      }
      const mock = fallbackMock(data.questionType, data.strictness, data.sectionType);
      const cal = applyBandCalibration(mock.indicative_mark.awarded, data.questionType, data.strictness);
      mock.indicative_mark.awarded = cal.adjusted;
      mock.indicative_mark.band = cal.band;
      await saveSubmission({
        id: crypto.randomUUID(),
        ownerId: user.id,
        createdAt: new Date().toISOString(),
        sectionType: data.sectionType,
        questionType: data.questionType,
        topic: data.topic,
        commandWord: data.commandWord,
        questionText: data.questionText,
        contextText: data.contextText,
        studentAnswer: data.studentAnswer,
        strictness: data.strictness,
        mode: "mock_no_api_key",
        report: mock
      });
      return NextResponse.json({ ...mock, mode: "mock_no_api_key" });
    }

    const systemPrompt = await loadPrompt(data.questionType);
    const needsEval = commandNeedsEvaluation(data.commandWord);
    const userPrompt = `Strictness: ${data.strictness}\nSection: ${data.sectionType}\nQuestion type: ${data.questionType}\nTopic: ${data.topic}\nCommand word: ${data.commandWord}\nEvaluation required: ${needsEval ? "yes" : "no"}\nQuestion text: ${data.questionText || "[question in image]"}\nContext text: ${data.contextText || "N/A"}\n\nStudent answer text (may be partial/empty if image supplied):\n${data.studentAnswer || "[none provided]"}\n\nIf images are attached, read them in this order: question, extract (section A), then answer pages.\nFor Section A, assess extract-data usage quality.\nFor Section B, assess real-world example quality.\nIf evaluation is not required, keep AO4 conservative and explain it as limited/not central for this command.\nReturn ONLY valid JSON matching the schema.`;

    const allImages = [
      data.questionImageDataUrl,
      data.extractImageDataUrl,
      ...(data.answerImageDataUrls || [])
    ].filter(Boolean) as string[];

    const raw = await callModel(systemPrompt, userPrompt, allImages);
    const validated = ResponseSchema.parse(raw);

    // Ensure max mark aligns with selected question type + calibration
    validated.indicative_mark.max = data.questionType;
    const cal = applyBandCalibration(validated.indicative_mark.awarded, data.questionType, data.strictness);
    validated.indicative_mark.awarded = cal.adjusted;
    validated.indicative_mark.band = cal.band;
    validated.section_focus = {
      section: data.sectionType,
      extract_data_usage: data.sectionType === "A" ? "some" : "n/a",
      real_world_examples: data.sectionType === "B" ? "some" : "n/a",
      note: data.sectionType === "A"
        ? "Strengthen extract/data integration in each paragraph for higher AO2/AO3 quality."
        : "Strengthen specificity of real-world examples (country, period, data point)."
    };
    validated.disclaimer = `This is indicative AQA-aligned revision feedback (${data.strictness}), not official examiner marking.`;

    await saveSubmission({
      id: crypto.randomUUID(),
      ownerId: user.id,
      createdAt: new Date().toISOString(),
      sectionType: data.sectionType,
      questionType: data.questionType,
      topic: data.topic,
      commandWord: data.commandWord,
      questionText: data.questionText,
      contextText: data.contextText,
      studentAnswer: data.studentAnswer,
      strictness: data.strictness,
      mode: "live",
      report: validated
    });

    // Log analytics
    const durationMs = Date.now() - startTime;
    await logMarkEvent({
      timestamp: new Date().toISOString(),
      userId: user.id,
      sectionType: data.sectionType as "A" | "B",
      questionType: data.questionType as 9 | 10 | 15 | 25,
      awarded: validated.indicative_mark.awarded,
      max: validated.indicative_mark.max,
      band: validated.indicative_mark.band,
      durationMs
    }).catch(() => {}); // Silent fail on analytics errors

    return NextResponse.json({ ...validated, mode: "live" });
  } catch (err) {
    const allowMockFallback = process.env.ELITEECON_ALLOW_MOCK_FALLBACK === "true";
    const detail = err instanceof Error ? err.message : "Unknown model error";
    console.error("[/api/mark] Marking failed:", detail);
    if (!allowMockFallback) {
      return NextResponse.json({ error: "Marking service temporarily unavailable.", detail }, { status: 502 });
    }

    const mock = fallbackMock(data.questionType, data.strictness, data.sectionType);
    const cal = applyBandCalibration(mock.indicative_mark.awarded, data.questionType, data.strictness);
    mock.indicative_mark.awarded = cal.adjusted;
    mock.indicative_mark.band = cal.band;
    await saveSubmission({
      id: crypto.randomUUID(),
      ownerId: user.id,
      createdAt: new Date().toISOString(),
      sectionType: data.sectionType,
      questionType: data.questionType,
      topic: data.topic,
      commandWord: data.commandWord,
      questionText: data.questionText,
      contextText: data.contextText,
      studentAnswer: data.studentAnswer,
      strictness: data.strictness,
      mode: "fallback_on_error",
      report: mock
    });
    return NextResponse.json({ ...mock, mode: "fallback_on_error" });
  }
}
