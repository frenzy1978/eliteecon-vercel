import { NextResponse } from "next/server";

export async function GET() {
  const envVars = Object.keys(process.env)
    .filter(key => key.startsWith("ELITEECON_") || key.includes("KEY") || key.includes("URL"))
    .reduce((obj, key) => {
      obj[key] = process.env[key] ? `Present (${process.env[key]?.length} chars)` : "Missing";
      if (key === "ELITEECON_OLLAMA_BASE_URL") {
         obj[key] = process.env[key] || "(undefined)";
      }
      return obj;
    }, {} as Record<string, string>);

  return NextResponse.json(envVars);
}
