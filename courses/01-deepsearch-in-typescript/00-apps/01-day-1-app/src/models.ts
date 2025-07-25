/* eslint-disable @typescript-eslint/no-unsafe-call */
import { openai } from "@ai-sdk/openai";

// export const model = google("gemini-2.0-flash-001")
// export const factualityModel = google("gemini-1.5-flash")

export const model = openai("gpt-3.5-turbo");
export const factualityModel = openai("o4-mini");
