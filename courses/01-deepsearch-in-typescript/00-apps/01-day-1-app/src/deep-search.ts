import { type Message, streamText, type TelemetrySettings } from "ai";
import { z } from "zod";
import { model } from "~/models";
import { searchSerper } from "~/serper";
import { cacheWithRedis } from "~/server/redis/redis";
import { bulkCrawlWebsites } from "~/server/web-scraper";

// Cache the bulk crawl function
const cachedBulkCrawlWebsites = cacheWithRedis(
	"scrapePages",
	bulkCrawlWebsites,
);

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

IMPORTANT: You MUST use scrapePages after searchWeb to get complete information. Search snippets are often incomplete.

Current date and time: ${new Date().toISOString()}

When users ask for "up to date", "latest", "recent", or "current" information, make sure to include the current date in your search queries to find the most recent information available.

Workflow:
Before you answer the question, you should devise a plan to answer the question. Your plan should be a list of steps.

You should then execute the plan by calling the tools available to you.

If you receive new information which changes your plan, you should update your plan and execute the new plan.

Use scrapePages for: full articles, detailed explanations, code examples, complete documentation, or any time you need more than just snippets.

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
					const results = await searchSerper(
						{ q: query, num: 10 },
						abortSignal,
					);

					return results.organic.map((result) => ({
						title: result.title,
						link: result.link,
						snippet: result.snippet,
						date: result.date,
					}));
				},
			},
			scrapePages: {
				parameters: z.object({
					urls: z.array(z.string()).describe("URLs to scrape"),
				}),
				execute: async ({ urls }: { urls: string[] }) => {
					console.log("🕷️ scrapePages tool called with URLs:", urls);
					const result = await cachedBulkCrawlWebsites({ urls });
					console.log("🕷️ scrapePages result:", result);
					return result;
				},
			},
		},
		onFinish: opts.onFinish,
		experimental_telemetry: opts.telemetry,
	});

export async function askDeepSearch(messages: Message[]) {
	const result = streamFromDeepSearch({
		messages,
		onFinish: () => {
			// Intentionally empty - no persistence needed for evaluation
		},
		telemetry: {
			isEnabled: false,
		},
	});

	// Consume the stream - without this,
	// the stream will never finish
	await result.consumeStream();

	return await result.text;
}
