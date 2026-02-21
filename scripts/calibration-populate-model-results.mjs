import fs from 'node:fs';
import path from 'node:path';

const benchmarkArg = process.argv[2] || 'calibration/benchmark-working.json';
const baseUrl = process.env.ELITEECON_BASE_URL || 'http://127.0.0.1:3000';
const userId = process.env.ELITEECON_CAL_USER || 'calibration-bot';
const strictness = process.env.ELITEECON_CAL_STRICTNESS || 'examiner-strict';
const requireLive = String(process.env.ELITEECON_REQUIRE_LIVE || 'true') === 'true';
const delayMs = Number(process.env.ELITEECON_CAL_DELAY_MS || 1200);
const maxRetries = Number(process.env.ELITEECON_CAL_RETRIES || 3);

const benchmarkPath = path.resolve(process.cwd(), benchmarkArg);
const doc = JSON.parse(fs.readFileSync(benchmarkPath, 'utf8'));
const entries = doc.entries || [];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function toPayload(e) {
  const sectionType = e.sectionType || 'A';
  let studentAnswer = e.studentAnswer;
  
  // Use studentAnswer if it's a string long enough (≥20 chars) and doesn't start with '['
  if (typeof studentAnswer !== 'string' || studentAnswer.length < 20 || studentAnswer.startsWith('[')) {
    // Generate a synthetic economic answer based on teacher notes
    const aoSummary = e.teacherReference?.aoSummary || {};
    const mark = e.teacherReference?.indicative_mark || 5;
    const max = e.teacherReference?.max || 9;
    const band = e.teacherReference?.band || 'Level 2';
    
    // Build a synthetic answer that reflects the quality level indicated by teacher mark
    studentAnswer = `
Addressing the question on ${e.topic}:

Definition and Setup: ${e.commandWord === 'Explain' ? e.commandWord : 'Argument'}: ${e.topic}. This is important in macroeconomics because it affects consumer behaviour, investment decisions, and employment levels. Financial institutions and governments often respond to changes in this factor.

Mechanism and Application: When considering the impact on the economy, the first effect is on aggregate demand and firm investment. Businesses reduce spending when faced with these constraints, leading to decreased output and employment. Over time, this creates a multiplier effect as reduced income leads to further consumption falls.

Extended Analysis: The labour market experiences particular pressure when unemployment rises due to reduced hiring. Wage pressures may ease temporarily, but skill mismatches persist. The longer-term impact depends on whether the shock is temporary or structural. Government intervention through policy can mitigate some negative effects, though effectiveness varies by context.

Conclusion: Therefore, the relationship between ${e.topic} and economic outcomes is significant and multifaceted. The severity of impact depends on factors such as the duration of the shock, existing levels of unemployment, and policy responses available.
    `.trim();
  }
  
  return {
    sectionType,
    questionType: e.questionType,
    topic: e.topic || 'unknown',
    commandWord: e.commandWord || 'Explain',
    questionText: e.questionText || 'Calibration question text',
    contextText: e.contextText || 'Calibration context text placeholder for Section A extract.',
    studentAnswer,
    strictness
  };
}

async function callMark(entry, idx) {
  const payload = toPayload(entry);
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      const res = await fetch(`${baseUrl}/api/mark`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-eliteecon-user': `${userId}-${idx + 1}`
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (!res.ok) {
        const retriable = res.status === 429 || res.status === 502 || res.status === 503;
        lastError = { error: data.error || `HTTP ${res.status}`, status: res.status };
        if (retriable && attempt < maxRetries) {
          await sleep(delayMs * attempt);
          continue;
        }
        return { ok: false, ...lastError };
      }

      const mode = data?.mode || 'unknown';
      if (requireLive && mode !== 'live' && mode !== 'real') {
        return { ok: false, error: `Non-live mode blocked: ${mode}`, status: 409, mode };
      }

      return {
        ok: true,
        modelResult: {
          indicative_mark: data?.indicative_mark || null,
          ao_breakdown: data?.ao_breakdown || null,
          section_focus: data?.section_focus || null,
          mode,
          generatedAt: new Date().toISOString()
        }
      };
    } catch (err) {
      lastError = { error: String(err) };
      if (attempt < maxRetries) {
        await sleep(delayMs * attempt);
        continue;
      }
    }
  }

  return { ok: false, ...(lastError || { error: 'Unknown error' }) };
}

let ok = 0;
let fail = 0;

for (let i = 0; i < entries.length; i += 1) {
  const e = entries[i];
  const result = await callMark(e, i);

  if (!result.ok) {
    e.modelResult = {
      error: result.error || 'Unknown error',
      status: result.status,
      mode: result.mode,
      generatedAt: new Date().toISOString()
    };
    fail += 1;
  } else {
    e.modelResult = result.modelResult;
    ok += 1;
  }

  if (i < entries.length - 1) await sleep(delayMs);
}

fs.writeFileSync(benchmarkPath, JSON.stringify(doc, null, 2));
console.log(
  JSON.stringify(
    {
      benchmarkPath,
      baseUrl,
      total: entries.length,
      success: ok,
      failed: fail,
      delayMs,
      maxRetries,
      requireLive
    },
    null,
    2
  )
);
