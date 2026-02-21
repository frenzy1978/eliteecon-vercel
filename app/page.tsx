"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

function getOrCreateClientUserId() {
  const key = "eliteecon_user_id";
  const existing = typeof window !== "undefined" ? localStorage.getItem(key) : null;
  if (existing) return existing;
  const id = `u_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
  if (typeof window !== "undefined") localStorage.setItem(key, id);
  return id;
}

type SubmissionRow = {
  id: string;
  createdAt: string;
  sectionType?: "A" | "B";
  questionType: 9 | 10 | 15 | 25;
  topic: string;
  commandWord: string;
  strictness: "student-friendly" | "examiner-strict";
  mode: string;
};

type ProgressData = {
  recentMarks: Array<{ createdAt: string; score: number; max: number }>;
  aoAverages: { ao1: number; ao2: number; ao3: number; ao4: number };
  weakTopics: Array<{ topic: string; attempts: number }>;
  totalAttempts: number;
};

type FeedbackResult = {
  mode?: string;
  indicative_mark?: { awarded: number; max: number; band: string };
  section_focus?: {
    section: "A" | "B";
    extract_data_usage: "strong" | "some" | "limited" | "n/a";
    real_world_examples: "strong" | "some" | "limited" | "n/a";
    note: string;
  };
  ao_breakdown?: {
    ao1?: { strength: string; improvement: string };
    ao2?: { strength: string; improvement: string };
    ao3?: { strength: string; improvement: string };
    ao4?: { strength: string; improvement: string };
  };
  what_went_well?: string[];
  priority_fixes?: Array<{ issue: string; why_it_costs_marks: string; exact_fix: string }>;
  rewrite?: { target: string; improved_version: string };
  next_task?: string;
  disclaimer?: string;
};

async function compressToDataUrl(file: File, maxWidth = 1600, quality = 0.78): Promise<string> {
  const imageBitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxWidth / imageBitmap.width);
  const width = Math.round(imageBitmap.width * scale);
  const height = Math.round(imageBitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.drawImage(imageBitmap, 0, 0, width, height);
  imageBitmap.close();

  return canvas.toDataURL("image/jpeg", quality);
}

export default function HomePage() {
  const [result, setResult] = useState<string>("");
  const [feedback, setFeedback] = useState<FeedbackResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<SubmissionRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [statusText, setStatusText] = useState<string>("");
  const [errorBanner, setErrorBanner] = useState<string>("");
  const [transcriptPreview, setTranscriptPreview] = useState<string>("");
  const [transcribeMsg, setTranscribeMsg] = useState<string>("");
  const [transcribeLoading, setTranscribeLoading] = useState(false);
  const [progress, setProgress] = useState<ProgressData | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [sectionType, setSectionType] = useState<"A" | "B">("A");
  const [questionTypeSel, setQuestionTypeSel] = useState<"9" | "10" | "15" | "25">("9");
  const [strictnessSel, setStrictnessSel] = useState<"student-friendly" | "examiner-strict">("student-friendly");
  const [questionImageDataUrl, setQuestionImageDataUrl] = useState<string>("");
  const [extractImageDataUrl, setExtractImageDataUrl] = useState<string>("");
  const [answerImageDataUrls, setAnswerImageDataUrls] = useState<string[]>([]);
  const [clientUserId, setClientUserId] = useState<string>("");
  const [authToken, setAuthToken] = useState<string>("");
  const [authTokenInput, setAuthTokenInput] = useState<string>("");
  const [authEmail, setAuthEmail] = useState<string>("");
  const [authPassword, setAuthPassword] = useState<string>("");
  const [authMsg, setAuthMsg] = useState<string>("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authSourceLabel, setAuthSourceLabel] = useState<string>("header-scaffold");

  const instructions = useMemo(() => {
    if (sectionType === "A") {
      return "Section A: upload/take photo of the question and the extract, then upload your written answer pages.";
    }
    return "Section B: upload/take photo of the question, then upload your written answer pages (use real-world examples).";
  }, [sectionType]);

  const sectionChecklist = useMemo(() => {
    if (sectionType === "A") {
      return [
        "Question photo attached",
        "Extract/data photo attached",
        "Answer pages attached or typed response provided"
      ];
    }
    return [
      "Question photo attached",
      "At least one real-world example included in answer",
      "Answer pages attached or typed response provided"
    ];
  }, [sectionType]);

  function getAuthHeaders(userId = clientUserId) {
    const headers: Record<string, string> = {};
    if (authToken) headers.authorization = `Bearer ${authToken}`;
    if (userId) headers["x-eliteecon-user"] = userId;
    return headers;
  }

  async function loadHistory(userId = clientUserId) {
    if (!userId && !authToken) return;
    setHistoryLoading(true);
    const res = await fetch("/api/submissions?limit=12", {
      headers: getAuthHeaders(userId)
    });
    const data = await res.json();
    setHistory(data.submissions || []);
    setHistoryLoading(false);
  }

  async function loadProgress(userId = clientUserId) {
    if (!userId && !authToken) return;
    const res = await fetch("/api/progress?limit=50", { headers: getAuthHeaders(userId) });
    const data = await res.json();
    if (res.ok) setProgress(data);
  }

  useEffect(() => {
    const id = getOrCreateClientUserId();
    const savedToken = typeof window !== "undefined" ? (localStorage.getItem("eliteecon_auth_token") || "") : "";

    // Persisted UI prefs (MVP QoL)
    const savedQ = typeof window !== "undefined" ? (localStorage.getItem("eliteecon_question_type") as any) : null;
    const savedS = typeof window !== "undefined" ? (localStorage.getItem("eliteecon_strictness") as any) : null;
    const savedSection = typeof window !== "undefined" ? (localStorage.getItem("eliteecon_section") as any) : null;
    if (savedQ && ["9", "10", "15", "25"].includes(savedQ)) setQuestionTypeSel(savedQ);
    if (savedS && ["student-friendly", "examiner-strict"].includes(savedS)) setStrictnessSel(savedS);
    if (savedSection && ["A", "B"].includes(savedSection)) setSectionType(savedSection);

    setClientUserId(id);
    setAuthToken(savedToken);
    setAuthTokenInput(savedToken);
    setAuthSourceLabel(savedToken ? "supabase-token" : "header-scaffold");
    loadHistory(id);
    loadProgress(id);
  }, []);

  function saveAuthToken() {
    const v = authTokenInput.trim();
    setAuthToken(v);
    if (typeof window !== "undefined") {
      if (v) localStorage.setItem("eliteecon_auth_token", v);
      else localStorage.removeItem("eliteecon_auth_token");
    }
    setAuthMsg(v ? "Token saved." : "Token cleared.");
    setAuthSourceLabel(v ? "supabase-token" : "header-scaffold");
    loadHistory();
  }

  async function signInWithSupabasePassword() {
    const client = getSupabaseBrowserClient();
    if (!client) {
      setAuthMsg("Supabase is not configured in env.");
      return;
    }
    if (!authEmail || !authPassword) {
      setAuthMsg("Enter email and password.");
      return;
    }

    setAuthBusy(true);
    setAuthMsg("");
    const { data, error } = await client.auth.signInWithPassword({ email: authEmail, password: authPassword });
    if (error || !data.session?.access_token) {
      setAuthMsg(error?.message || "Sign in failed.");
      setAuthBusy(false);
      return;
    }

    const token = data.session.access_token;
    setAuthToken(token);
    setAuthTokenInput(token);
    if (typeof window !== "undefined") localStorage.setItem("eliteecon_auth_token", token);
    setAuthMsg("Signed in. Bearer token set.");
    setAuthSourceLabel("supabase-token");
    setAuthBusy(false);
    loadHistory();
  }

  async function clearAuthToken() {
    const client = getSupabaseBrowserClient();
    if (client) {
      try { await client.auth.signOut(); } catch {}
    }

    setAuthToken("");
    setAuthTokenInput("");
    setAuthMsg("Signed out.");
    setAuthSourceLabel("header-scaffold");
    if (typeof window !== "undefined") localStorage.removeItem("eliteecon_auth_token");
    loadHistory();
  }

  async function onSingleImageChange(e: ChangeEvent<HTMLInputElement>, setter: (v: string) => void) {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await compressToDataUrl(file);
    setter(dataUrl);
  }

  async function onAnswerImagesChange(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const compressed = await Promise.all(files.slice(0, 6).map((f) => compressToDataUrl(f)));
    setAnswerImageDataUrls(compressed);
    setTranscriptPreview("");
    setTranscribeMsg("");
  }

  function clearImage(setter: (v: string) => void) {
    setter("");
  }

  async function generateTranscriptPreview() {
    if (answerImageDataUrls.length === 0) return;
    if (!clientUserId) {
      setErrorBanner("Session not ready. Please refresh and try again.");
      return;
    }
    setTranscribeLoading(true);
    setTranscribeMsg("");
    setErrorBanner("");
    const res = await fetch("/api/transcribe", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({ images: answerImageDataUrls })
    });
    const data = await res.json();

    if (!res.ok) {
      setTranscriptPreview("");
      const msg = data.error || "Transcription failed. Please retake clearer photos.";
      setTranscribeMsg(msg);
      setErrorBanner(msg);
      setTranscribeLoading(false);
      return;
    }

    setTranscriptPreview(data.transcript || "");
    setTranscribeMsg(data.message || "");
    setTranscribeLoading(false);
  }

  async function onSubmit(formData: FormData) {
    if (!clientUserId) {
      setErrorBanner("Session not ready. Please refresh and try again.");
      return;
    }

    setLoading(true);
    setResult("");
    setFeedback(null);
    setErrorBanner("");
    setStatusText("Processing images and marking response…");

    const payload = {
      sectionType,
      questionType: Number(formData.get("questionType")),
      topic: String(formData.get("topic") || ""),
      commandWord: String(formData.get("commandWord") || ""),
      questionText: String(formData.get("questionText") || ""),
      contextText: String(formData.get("contextText") || ""),
      studentAnswer: String(formData.get("studentAnswer") || ""),
      strictness: String(formData.get("strictness") || "student-friendly"),
      questionImageDataUrl,
      extractImageDataUrl,
      answerImageDataUrls
    };

    const res = await fetch("/api/mark", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (!res.ok) {
      setErrorBanner(data.error || "Could not mark this response right now. Please try again.");
      setLoading(false);
      setStatusText("");
      return;
    }

    setResult(JSON.stringify(data, null, 2));
    setFeedback(data);
    await loadHistory();
    await loadProgress();
    setLoading(false);
    setStatusText("");
  }

  return (
    <main className="eliteecon" style={{ maxWidth: 950, margin: "2rem auto", fontFamily: "Inter, system-ui, sans-serif" }}>
      <nav className="top-nav">
        <a href="#submission" className="active">📝 Submit</a>
        <a href="#progress">📊 Progress</a>
        <a href="#history">🕘 History</a>
        <a href="https://github.com/frenzy1978/eliteecon-vercel" target="_blank" rel="noreferrer">GitHub</a>
      </nav>

      <h1>EliteEcon</h1>
      <p style={{ marginTop: 0, color: "#334155" }}>
        AQA-aligned economics feedback that helps students improve every answer, fast.
      </p>

      <div style={{ border: "1px solid #e2e8f0", background: "#f8fafc", padding: 12, borderRadius: 10, marginBottom: 12 }}>
        <div style={{ fontWeight: 700 }}>MVP pilot</div>
        <div style={{ fontSize: 13, color: "#475569" }}>
          No sign-up yet. Your submissions are tracked by your local user id. For production rollouts we can add Supabase auth.
        </div>
        <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button type="button" onClick={() => setShowAdvanced((v) => !v)}>
            {showAdvanced ? "Hide" : "Show"} advanced settings
          </button>
          <a href="/api/billing/status" target="_blank" rel="noreferrer" style={{ fontSize: 13 }}>API: billing status</a>
          <a href="/api/analytics" target="_blank" rel="noreferrer" style={{ fontSize: 13 }}>API: analytics</a>
        </div>
        <div style={{ marginTop: 8, fontSize: 12, color: "#64748b" }}>
          Pilot note: history/analytics may reset occasionally on serverless while we validate demand.
        </div>
      </div>

      {errorBanner && (
        <div style={{ border: "1px solid #fca5a5", background: "#fef2f2", color: "#991b1b", padding: 10, borderRadius: 8, marginBottom: 12 }}>
          <strong>Heads up:</strong> {errorBanner}
        </div>
      )}

      <div className="dashboard-grid">
        <div className="left-col" id="submission">
      {showAdvanced && (
        <section style={{ border: "1px solid #ddd", borderRadius: 8, padding: 10, marginBottom: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>🔐 Auth (Supabase)</div>
          <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>
            Optional. For the MVP pilot, header-based tracking is enough. Enable Supabase later for real sign-in.
          </div>
          <div style={{ fontSize: 12, marginBottom: 6 }}>
            Current auth mode: <strong>{authSourceLabel}</strong>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
            <input
              value={authEmail}
              onChange={(e) => setAuthEmail(e.target.value)}
              placeholder="Email"
            />
            <input
              value={authPassword}
              onChange={(e) => setAuthPassword(e.target.value)}
              placeholder="Password"
              type="password"
            />
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <button type="button" onClick={signInWithSupabasePassword} disabled={authBusy}>
              {authBusy ? "Signing in..." : "Sign in (Supabase)"}
            </button>
          </div>

          <input
            value={authTokenInput}
            onChange={(e) => setAuthTokenInput(e.target.value)}
            placeholder="Paste access token (optional)"
            style={{ width: "100%", marginBottom: 6 }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={saveAuthToken}>Save token</button>
            <button type="button" onClick={clearAuthToken}>Clear token</button>
          </div>
          {authMsg && <div style={{ fontSize: 12, marginTop: 6, color: "#444" }}>{authMsg}</div>}
        </section>
      )}

      <form action={onSubmit} style={{ display: "grid", gap: 12 }}>
        <label>
          Exam section workflow
          <select
            value={sectionType}
            onChange={(e) => {
              const v = e.target.value as "A" | "B";
              setSectionType(v);
              if (typeof window !== "undefined") localStorage.setItem("eliteecon_section", v);
            }}
          >
            <option value="A">Section A (question + extract + answer)</option>
            <option value="B">Section B (question + answer)</option>
          </select>
        </label>

        <p style={{ fontSize: 13, color: "#444", margin: 0 }}>{instructions}</p>
        <div style={{ border: "1px dashed #bbb", borderRadius: 8, padding: 8, background: "#fcfcfc" }}>
          <div style={{ fontWeight: 700, fontSize: 13 }}>Before you submit</div>
          <ul style={{ margin: "6px 0 0 18px", fontSize: 13 }}>
            {sectionChecklist.map((item, i) => <li key={i}>{item}</li>)}
          </ul>
          <div style={{ marginTop: 6, fontSize: 12, color: "#666" }}>
            Photo quality tip: bright light, full page in frame, no blur, and avoid shadows.
          </div>
        </div>

        <label>
          Question Type
          <select
            name="questionType"
            value={questionTypeSel}
            onChange={(e) => {
              const v = e.target.value as any;
              setQuestionTypeSel(v);
              if (typeof window !== "undefined") localStorage.setItem("eliteecon_question_type", v);
            }}
          >
            <option value="9">9 marker</option>
            <option value="10">10 marker</option>
            <option value="15">15 marker</option>
            <option value="25">25 marker</option>
          </select>
        </label>

        <label>Topic <input name="topic" defaultValue="Market failure" /></label>
        <label>Command word <input name="commandWord" defaultValue="Evaluate" /></label>
        <label>
          Strictness
          <select
            name="strictness"
            value={strictnessSel}
            onChange={(e) => {
              const v = e.target.value as any;
              setStrictnessSel(v);
              if (typeof window !== "undefined") localStorage.setItem("eliteecon_strictness", v);
            }}
          >
            <option value="student-friendly">Student-friendly</option>
            <option value="examiner-strict">Examiner-strict</option>
          </select>
        </label>

        <label>Question text (optional if clear photo provided) <textarea name="questionText" rows={3} defaultValue="Question text if available" /></label>
        <label>Context/extract text (optional) <textarea name="contextText" rows={3} /></label>
        <label>Student answer text (optional if photo pages provided) <textarea name="studentAnswer" rows={8} /></label>

        <label>
          Photo of question
          <input type="file" accept="image/*" capture="environment" onChange={(e) => onSingleImageChange(e, setQuestionImageDataUrl)} />
        </label>

        {sectionType === "A" && (
          <label>
            Photo of extract/data
            <input type="file" accept="image/*" capture="environment" onChange={(e) => onSingleImageChange(e, setExtractImageDataUrl)} />
          </label>
        )}

        <label>
          Photos of student answer pages (multi)
          <input type="file" multiple accept="image/*" onChange={onAnswerImagesChange} />
        </label>

        {(questionImageDataUrl || extractImageDataUrl || answerImageDataUrls.length > 0) && (
          <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 8 }}>
            <p style={{ margin: 0, fontSize: 13 }}>Image preview</p>

            {questionImageDataUrl && (
              <div>
                <p style={{ fontSize: 12 }}>Question photo ✅</p>
                <img src={questionImageDataUrl} alt="Question" style={{ width: "100%", maxHeight: 180, objectFit: "contain" }} />
                <button type="button" onClick={() => clearImage(setQuestionImageDataUrl)}>Remove question photo</button>
              </div>
            )}

            {extractImageDataUrl && (
              <div>
                <p style={{ fontSize: 12 }}>Extract photo ✅</p>
                <img src={extractImageDataUrl} alt="Extract" style={{ width: "100%", maxHeight: 180, objectFit: "contain" }} />
                <button type="button" onClick={() => clearImage(setExtractImageDataUrl)}>Remove extract photo</button>
              </div>
            )}

            {answerImageDataUrls.length > 0 && (
              <div>
                <p style={{ fontSize: 12 }}>Answer pages attached: {answerImageDataUrls.length}</p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
                  {answerImageDataUrls.map((src, i) => (
                    <img key={i} src={src} alt={`Answer page ${i + 1}`} style={{ width: "100%", maxHeight: 120, objectFit: "cover" }} />
                  ))}
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button type="button" onClick={() => setAnswerImageDataUrls([])}>Clear answer pages</button>
                  <button type="button" onClick={generateTranscriptPreview} disabled={transcribeLoading}>
                    {transcribeLoading ? "Reading handwriting..." : "Preview transcription"}
                  </button>
                </div>
                {transcribeMsg && (
                  <p style={{ fontSize: 12, color: transcribeMsg.toLowerCase().includes("low") || transcribeMsg.toLowerCase().includes("retake") ? "#b45309" : "#166534" }}>
                    {transcribeMsg}
                  </p>
                )}
                {transcriptPreview && (
                  <details>
                    <summary>Transcription preview</summary>
                    <pre style={{ whiteSpace: "pre-wrap", background: "#f7f7f7", padding: 8 }}>{transcriptPreview}</pre>
                  </details>
                )}
              </div>
            )}
          </div>
        )}

        <button type="submit" disabled={loading}>{loading ? "Marking..." : "Get feedback"}</button>
        {loading && <p style={{ fontSize: 13, color: "#333" }}>{statusText}</p>}
      </form>
      </div>

      <div className="right-col">
      {progress && (
        <section id="progress" className="cardish" style={{ padding: 12 }}>
          <h2 style={{ marginTop: 0 }}>📊 Progress</h2>
          <div style={{ fontSize: 13, color: "#475569", marginBottom: 8 }}>Total attempts: <strong>{progress.totalAttempts}</strong></div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 8 }}>
            {(["ao1", "ao2", "ao3", "ao4"] as const).map((ao) => (
              <div key={ao} className="ao-stat">
                <div style={{ fontSize: 11, textTransform: "uppercase", color: "#64748b" }}>{ao}</div>
                <div style={{ fontWeight: 700, fontSize: 18 }}>{progress.aoAverages?.[ao] ?? 0}</div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Recent score trend</div>
            <div style={{ display: "flex", gap: 4, alignItems: "end", height: 46 }}>
              {(progress.recentMarks || []).slice(0, 12).reverse().map((m, i) => {
                const pct = Math.max(6, Math.round((m.score / Math.max(1, m.max)) * 100));
                return <div key={i} title={`${m.score}/${m.max}`} style={{ width: 12, height: `${pct}%`, background: "#3b82f6", borderRadius: 4 }} />;
              })}
            </div>
          </div>

          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Most practised topics (focus areas)</div>
            <div style={{ display: "grid", gap: 4 }}>
              {(progress.weakTopics || []).slice(0, 5).map((t, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                  <span style={{ textTransform: "capitalize" }}>{t.topic}</span>
                  <strong>{t.attempts}</strong>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {feedback && (
        <section style={{ marginTop: 20, display: "grid", gap: 12 }}>
          <h2>✨ Feedback report</h2>

          <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12, background: "#fafafa" }}>
            <div style={{ fontSize: 13, color: "#666" }}>Mode: {feedback.mode || "n/a"}</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>
              {feedback.indicative_mark?.awarded ?? "-"}/{feedback.indicative_mark?.max ?? "-"}
            </div>
            <div>Band: <strong>{feedback.indicative_mark?.band || "-"}</strong></div>
            <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
              <div style={{ fontSize: 13 }}>
                Section focus: <strong>{feedback.section_focus?.section || sectionType}</strong>
              </div>
              <div style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
                <span>Extract/data usage:</span>
                <span className={`score-chip score-${(feedback.section_focus?.extract_data_usage || "na").replace("/", "")}`}>{feedback.section_focus?.extract_data_usage || "n/a"}</span>
              </div>
              <div style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
                <span>Real-world examples:</span>
                <span className={`score-chip score-${(feedback.section_focus?.real_world_examples || "na").replace("/", "")}`}>{feedback.section_focus?.real_world_examples || "n/a"}</span>
              </div>
              <div style={{ fontSize: 13, color: "#555" }}>
                {feedback.section_focus?.note || (sectionType === "A" ? "Section A focus: extract/data usage quality" : "Section B focus: real-world example quality")}
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 8 }}>
            {(["ao1", "ao2", "ao3", "ao4"] as const).map((ao) => (
              <div key={ao} className="ao-card" style={{ border: "1px solid #ddd", borderRadius: 8, padding: 10 }}>
                <div className="ao-title" style={{ fontWeight: 700, textTransform: "uppercase" }}>{ao}</div>
                <div style={{ fontSize: 13 }}><strong>Strength:</strong> {feedback.ao_breakdown?.[ao]?.strength || "-"}</div>
                <div style={{ fontSize: 13 }}><strong>Improve:</strong> {feedback.ao_breakdown?.[ao]?.improvement || "-"}</div>
              </div>
            ))}
          </div>

          <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 10 }}>
            <h3 style={{ marginTop: 0 }}>What went well</h3>
            <ul>
              {(feedback.what_went_well || []).map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          </div>

          <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 10 }}>
            <h3 style={{ marginTop: 0 }}>Top fixes</h3>
            <ol>
              {(feedback.priority_fixes || []).map((f, i) => (
                <li key={i}>
                  <strong>{f.issue}</strong><br />
                  <span style={{ fontSize: 13 }}>Why marks are lost: {f.why_it_costs_marks}</span><br />
                  <span style={{ fontSize: 13 }}>Do this next: {f.exact_fix}</span>
                </li>
              ))}
            </ol>
          </div>

          <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 10 }}>
            <h3 style={{ marginTop: 0 }}>Improved paragraph</h3>
            <div style={{ fontSize: 13, color: "#555" }}>Target: {feedback.rewrite?.target || "-"}</div>
            <p style={{ marginBottom: 0 }}>{feedback.rewrite?.improved_version || "-"}</p>
          </div>

          <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 10 }}>
            <h3 style={{ marginTop: 0 }}>Next task</h3>
            <p style={{ marginBottom: 0 }}>{feedback.next_task || "-"}</p>
          </div>

          <p style={{ fontSize: 12, color: "#666" }}>{feedback.disclaimer || ""}</p>

          <details>
            <summary>Raw JSON</summary>
            <pre style={{ whiteSpace: "pre-wrap", background: "#f5f5f5", padding: 12 }}>{result}</pre>
          </details>
        </section>
      )}

      <section id="history" style={{ marginTop: 24 }}>
        <h2>Recent history</h2>
        {historyLoading ? (
          <p>Loading history…</p>
        ) : history.length === 0 ? (
          <p>No submissions yet.</p>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {history.map((row) => (
              <div key={row.id} className="history-card" style={{ border: "1px solid #ddd", padding: 10, borderRadius: 8 }}>
                <div style={{ fontSize: 13, color: "#555" }}>{new Date(row.createdAt).toLocaleString()}</div>
                <div><strong>Section {row.sectionType || "?"}</strong> · <strong>{row.questionType} marker</strong> · {row.topic} · {row.commandWord}</div>
                <div style={{ fontSize: 13 }}>
                  strictness: <strong>{row.strictness}</strong> · mode: <strong>{row.mode}</strong>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      </div>
      </div>
    </main>
  );
}
