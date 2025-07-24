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
1. Start with searchWeb to find relevant sources
2. ALWAYS follow up with scrapePages on the most relevant URLs from search results
3. Only provide your final answer after you have scraped the actual content

Use scrapePages for: full articles, detailed explanations, code examples, complete documentation, or any time you need more than just snippets.

When providing information, always cite your sources with inline links using the format [1](link), [2](link), etc.`,
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
