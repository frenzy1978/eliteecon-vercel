export type QuestionType = 9 | 10 | 15 | 25;
export type SectionType = "A" | "B";

export interface MarkRequest {
  sectionType: SectionType;
  questionType: QuestionType;
  topic: string;
  commandWord: string;
  questionText: string;
  contextText?: string;
  studentAnswer?: string;
  questionImageDataUrl?: string;
  extractImageDataUrl?: string;
  answerImageDataUrls?: string[];
  strictness?: "student-friendly" | "examiner-strict";
}

export interface MarkResponse {
  indicative_mark: { awarded: number; max: number; band: string };
  section_focus: {
    section: "A" | "B";
    extract_data_usage: "strong" | "some" | "limited" | "n/a";
    real_world_examples: "strong" | "some" | "limited" | "n/a";
    note: string;
  };
  ao_breakdown: {
    ao1: { strength: string; improvement: string; score_hint: string };
    ao2: { strength: string; improvement: string; score_hint: string };
    ao3: { strength: string; improvement: string; score_hint: string };
    ao4: { strength: string; improvement: string; score_hint: string };
  };
  structure_checks: {
    introduction: "present" | "partial" | "missing";
    definitions: "accurate" | "partial" | "missing";
    application: "strong" | "some" | "weak";
    analysis_chains: "developed" | "some" | "limited";
    evaluation_throughout: "strong" | "some" | "limited";
    final_judgement: "clear_supported" | "asserted" | "missing";
  };
  what_went_well: string[];
  priority_fixes: Array<{
    issue: string;
    why_it_costs_marks: string;
    exact_fix: string;
  }>;
  rewrite: { target: string; improved_version: string };
  next_task: string;
  disclaimer: string;
}
