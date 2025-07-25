import {
    generateObject,
    type Message,
    streamText,
    type TelemetrySettings,
} from "ai";
import { z } from "zod";
import { actionSchema } from "~/action-types";
import { env } from "~/env";
import { model } from "~/models";
import { searchSerper } from "~/serper";
import { cacheWithRedis } from "~/server/redis/redis";
import { bulkCrawlWebsites } from "~/server/web-scraper";
import type { SystemContext } from "~/system-context";

// Cache the bulk crawl function
const cachedBulkCrawlWebsites = cacheWithRedis(
	"scrapePages",
	bulkCrawlWebsites,
);

export const getNextAction = async (context: SystemContext) => {
	const result = await generateObject({
		model,
		schema: actionSchema,
		prompt: `
You are a helpful assistant that determines the next action to take in a web search and analysis workflow.

Current date and time: ${new Date().toISOString()}

Your goal is to determine the next action to take based on the context provided. You have three options:

1. 'search': Search the web for more information when you need to find relevant web pages and get snippets
2. 'scrape': Scrape specific URLs when you need to get the full content from web pages you've already found
3. 'answer': Answer the user's question when you have sufficient information to provide a comprehensive response

Decision Guidelines:
- Start with 'search' if you haven't found relevant sources yet or need more current information
- Use 'scrape' when you have promising URLs from search results but need their full content for detailed analysis
- Choose 'answer' when you have gathered sufficient information to provide a complete, well-informed response
- When users ask for "up to date", "latest", "recent", or "current" information, include the current date in search queries
- Consider the step count - if you're approaching the limit (10 steps), lean towards answering with available information

Workflow Strategy:
1. Search first to find relevant sources and get overview snippets
2. Scrape the most promising URLs to get detailed content
3. Search again if you need additional sources or different angles
4. Answer when you have comprehensive information

${context.getFullContext()}
		`,
	});

	return result.object;
};

export const streamFromDeepSearch = (opts: {
	messages: Message[];
	onFinish: Parameters<typeof streamText>[0]["onFinish"];
	telemetry: TelemetrySettings;
}) =>
	streamText({
		model,
		messages: opts.messages,
		maxSteps: 10,
		system: `You are a helpful assistant with access to two powerful tools:

1. 'searchWeb' - Use this first to find relevant web pages and get snippets
2. 'scrapePages' - Use this to get the full content from web pages

Current date and time: ${new Date().toISOString()}

When users ask for "up to date", "latest", "recent", or "current" information, make sure to include the current date in your search queries to find the most recent information available.

Workflow:
Before you answer the question, you should devise a plan to answer the question. Your plan should be a list of steps.

You should then execute the plan by calling the tools available to you.

If you receive new information which changes your plan, you should update your plan and execute the new plan.

Use scrapePages for: full articles, detailed explanations, code examples, complete documentation, or any time you need more than just snippets.

The scrapePages tool accepts an optional 'maxCharacters' parameter to limit content length:
- Use maxCharacters when you need to control token usage or stay within context limits
- For summaries: 1000-2000 characters usually provide good context
- For detailed analysis: 3000-5000 characters capture comprehensive information
- For quick facts: 500-800 characters are often sufficient
- When processing multiple URLs, consider using smaller limits (800-1500 chars) to avoid overwhelming the context

# Markdown Link Formatting Instructions

You must format all links as inline markdown links using the exact syntax: '[link text](URL)'.

**Requirements:**

- Always use inline link format, never reference-style links
- Link text should be descriptive and meaningful
- URLs must be complete and functional
- No spaces between the closing bracket ']' and opening parenthesis '('
- Ensure proper escaping of special characters in URLs if needed

## Examples

<example1>
**Correct:** For more information about machine learning, visit the [Stanford AI course](https://cs229.stanford.edu/) which covers fundamental concepts.

**Incorrect:** For more information about machine learning, visit the Stanford AI course[1] which covers fundamental concepts.

[1]: https://cs229.stanford.edu/

</example1>

<example2>
**Correct:** The [OpenAI API documentation](https://platform.openai.com/docs) provides comprehensive guides for developers working with GPT models.

**Incorrect:** The OpenAI API documentation (https://platform.openai.com/docs) provides comprehensive guides for developers working with GPT models.
</example2>

<example3>
**Correct:** According to the [latest research paper](https://arxiv.org/abs/2103.00020), transformer architectures continue to show promising results in natural language processing tasks.

**Incorrect:** According to the latest research paper at https://arxiv.org/abs/2103.00020, transformer architectures continue to show promising results in natural language processing tasks.
</example3>

Follow this format consistently throughout your response.`,
		tools: {
			searchWeb: {
				parameters: z.object({
					query: z.string().describe("The query to search the web for"),
				}),
				execute: async ({ query }: { query: string }, { abortSignal }) => {
					console.log("🔍 searchWeb tool called with query:", query);

					try {
						const results = await searchSerper(
							{ q: query, num: env.SEARCH_RESULTS_COUNT },
							abortSignal,
						);

						console.log(
							"✅ searchWeb completed successfully, found:",
							results.organic.length,
							"results",
						);

						return results.organic.map((result) => ({
							title: result.title,
							link: result.link,
							snippet: result.snippet,
							date: result.date,
						}));
					} catch (error) {
						console.error("❌ Error in searchWeb tool:", error);
						console.error("Query that caused error:", query);

						if (error instanceof Error) {
							console.error("Error details:", {
								name: error.name,
								message: error.message,
								stack: error.stack,
							});
						}

						throw error;
					}
				},
			},
			scrapePages: {
				parameters: z.object({
					urls: z.array(z.string()).describe("URLs to scrape"),
					maxCharacters: z
						.number()
						.optional()
						.describe(
							"Maximum number of characters to return from each scraped page",
						),
				}),
				execute: async ({
					urls,
					maxCharacters,
				}: {
					urls: string[];
					maxCharacters?: number;
				}) => {
					console.log("🕷️ scrapePages tool called with URLs:", urls);

					try {
						const result = await cachedBulkCrawlWebsites({
							urls,
							maxCharacters,
						});
						console.log(
							"✅ scrapePages completed successfully for",
							urls.length,
							"URLs",
						);
						console.log("🕷️ scrapePages result:", result);
						return result;
					} catch (error) {
						console.error("❌ Error in scrapePages tool:", error);
						console.error("URLs that caused error:", urls);

						if (error instanceof Error) {
							console.error("Error details:", {
								name: error.name,
								message: error.message,
								stack: error.stack,
							});
						}

						throw error;
					}
				},
			},
		},
		onFinish: opts.onFinish,
		experimental_telemetry: opts.telemetry,
	});

export async function askDeepSearch(messages: Message[]) {
	console.log("🔍 askDeepSearch called with messages:", messages.length);

	try {
		const result = streamFromDeepSearch({
			messages,
			onFinish: () => {
				// Intentionally empty - no persistence needed for evaluation
			},
			telemetry: {
				isEnabled: false,
			},
		});

		console.log("📊 Stream created, consuming...");

		// Collect text during stream consumption
		let collectedText = "";

		for await (const textPart of result.textStream) {
			collectedText += textPart;
		}

		console.log("✅ Stream consumed successfully");
		console.log("📝 Final text result length:", collectedText.length);

		return collectedText;
	} catch (error) {
		console.error("❌ Error in askDeepSearch:", error);

		if (error instanceof Error) {
			console.error("Error name:", error.name);
			console.error("Error message:", error.message);
			console.error("Error stack:", error.stack);
		}

		// Log additional context
		console.error(
			"Messages that caused error:",
			JSON.stringify(messages, null, 2),
		);

		throw error;
	}
}
