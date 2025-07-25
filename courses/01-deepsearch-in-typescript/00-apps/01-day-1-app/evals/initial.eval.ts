import type { Message } from "ai";
import { evalite } from "evalite";
import { Langfuse } from "langfuse";

import { askDeepSearch } from "~/deep-search";
import { env } from "~/env";

import { ciData } from "./ci";
import { devData } from "./dev";
import { regressionData } from "./regression";
import { Factuality } from "./scorers/factuality";

// Rate limiting configuration
const EVAL_DELAY_MS = parseInt(process.env.EVAL_DELAY_MS ?? "1000", 10);

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));


const langfuse = new Langfuse({
	secretKey: env.LANGFUSE_SECRET_KEY,
	publicKey: env.LANGFUSE_PUBLIC_KEY,
	baseUrl: env.LANGFUSE_BASEURL,
});

evalite("Deep Search Eval", {
	data: (): { input: Message[]; expected: string }[] => {
		console.log("Loading dataset:", env.EVAL_DATASET);

		const data = [...devData];

		// If CI, add the CI data
		if (env.EVAL_DATASET === "ci") {
			data.push(...ciData);
			// If Regression, add the regression data AND the CI data
		} else if (env.EVAL_DATASET === "regression") {
			data.push(...ciData, ...regressionData);
		}

		return data;
	},
	task: async (input) => {
		console.log("Starting task with input:", input);

		const trace = langfuse.trace({
			name: "deep-search-eval",
			"environment": "test",
			metadata: {
				dataset: env.EVAL_DATASET,
				inputLength: input.length,
				question: input[0]?.content ?? "unknown"
			},
		});

		try {
			// Simple rate limiting with configurable delay
			console.log(`⏳ Rate limiting: waiting ${EVAL_DELAY_MS}ms before request...`);
			await sleep(EVAL_DELAY_MS);

			console.log("Calling askDeepSearch...");

			const span = trace.span({
				name: "askDeepSearch",
				input: input
			});

			const result = await askDeepSearch(input);

			console.log("askDeepSearch completed with result:", result);

			span.end({ output: result });
			trace.update({
				output: result
			});

			return result;
		} catch (error) {
			console.error("Error in askDeepSearch:", error);

			const errorMessage = error instanceof Error ? error.message : "Unknown error";
			trace.update({
				"output": errorMessage,
			});

			throw error;
		} finally {
			// Ensure langfuse traces are flushed
			await langfuse.flushAsync();
		}
	},
	scorers: [
		{
			name: "Contains Links",
			description: "Checks if the output contains any markdown links.",
			scorer: ({ output }) => {
				// Check for markdown link syntax: [text](url)
				const markdownLinkRegex = /\[.*?\]\(.*?\)/;
				const containsLinks = markdownLinkRegex.test(output);

				return containsLinks ? 1 : 0;
			},
		},
		Factuality,
	],
});
