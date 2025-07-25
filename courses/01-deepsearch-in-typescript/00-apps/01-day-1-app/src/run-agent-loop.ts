import { getNextAction } from "~/deep-search";
import { env } from "~/env";
import { searchSerper } from "~/serper";
import { cacheWithRedis } from "~/server/redis/redis";
import { bulkCrawlWebsites } from "~/server/web-scraper";
import type { SystemContext } from "~/system-context";
import { answerQuestion } from "./answer-question";

// Cache the bulk crawl function
const cachedBulkCrawlWebsites = cacheWithRedis(
	"scrapePages",
	bulkCrawlWebsites,
);

// Copied search function from the tools
const searchWeb = async (query: string) => {
	console.log("🔍 searchWeb tool called with query:", query);

	try {
		const results = await searchSerper(
			{ q: query, num: env.SEARCH_RESULTS_COUNT },
			undefined, // no abort signal for now
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
};

// Copied scrape function from the tools
const scrapeUrl = async (urls: string[], maxCharacters?: number) => {
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
};

export const runAgentLoop = async (ctx: SystemContext): Promise<string> => {
	// A loop that continues until we have an answer
	// or we've taken 10 actions
	while (!ctx.shouldStop()) {
		// We choose the next action based on the state of our system
		const nextAction = await getNextAction(ctx);

		// We execute the action and update the state of our system
		if (nextAction.type === "search") {
			if (!nextAction.query) {
				throw new Error("Search action requires a query");
			}

			const result = await searchWeb(nextAction.query);

			// Convert to the format expected by SystemContext
			ctx.reportQueries([
				{
					query: nextAction.query,
					results: result.map((r) => ({
						date: r.date ?? "",
						title: r.title,
						url: r.link,
						snippet: r.snippet,
					})),
				},
			]);
		} else if (nextAction.type === "scrape") {
			if (!nextAction.urls || nextAction.urls.length === 0) {
				throw new Error("Scrape action requires URLs");
			}

			const result = await scrapeUrl(nextAction.urls);

			// Convert to the format expected by SystemContext
			if (result.success) {
				ctx.reportScrapes(
					result.results.map((r) => ({
						url: r.url,
						result: r.result.success
							? r.result.data
							: `Error: ${(r.result as unknown).error}`,
					})),
				);
			} else {
				// Report failed scrapes
				ctx.reportScrapes(
					result.results.map((r) => ({
						url: r.url,
						result: r.result.success
							? r.result.data
							: `Error: ${(r.result as unknown).error}`,
					})),
				);
			}
		} else if (nextAction.type === "answer") {
			return answerQuestion(ctx);
		}

		// We increment the step counter
		ctx.incrementStep();
	}

	// If we've taken 10 actions and still don't have an answer,
	// we ask the LLM to give its best attempt at an answer
	return answerQuestion(ctx, { isFinal: true });
};
