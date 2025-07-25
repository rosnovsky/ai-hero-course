/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { runAgentLoop } from "~/run-agent-loop";
import { SystemContext } from "~/system-context";

// Mock the dependencies
vi.mock("~/deep-search", () => ({
	getNextAction: vi.fn(),
}));

vi.mock("~/answer-question", () => ({
	answerQuestion: vi.fn(),
}));

vi.mock("~/serper", () => ({
	searchSerper: vi.fn(),
}));

vi.mock("~/server/web-scraper", () => ({
	bulkCrawlWebsites: vi.fn(),
}));

vi.mock("~/server/redis/redis", () => ({
	cacheWithRedis: vi.fn((key, fn) => fn),
}));

import { answerQuestion } from "~/answer-question";
import { getNextAction } from "~/deep-search";
import { searchSerper } from "~/serper";
import { bulkCrawlWebsites } from "~/server/web-scraper";

describe("runAgentLoop", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should execute search action and update context", async () => {
		const context = new SystemContext("What is the weather today?");

		// Mock search action
		vi.mocked(getNextAction).mockResolvedValueOnce({
			type: "search",
			query: "weather today",
		});

		// Mock search results
		vi.mocked(searchSerper).mockResolvedValueOnce({
			organic: [
				{
					title: "Weather Today",
					link: "https://weather.com",
					snippet: "Today's weather is sunny",
					date: "2024-01-01",
					position: 1,
				},
			],
			searchParameters: {
				q: "weather today",
				type: "search",
				engine: "google",
			},
			credits: 1,
		});

		// Mock answer action
		vi.mocked(getNextAction).mockResolvedValueOnce({
			type: "answer",
		});

		// Mock answer response
		const mockResult = {
			text: "Today's weather is sunny.",
			textStream: (async function* () {
				yield "Today's weather is sunny.";
			})(),
			mergeIntoDataStream: vi.fn(),
		};
		vi.mocked(answerQuestion).mockReturnValueOnce(mockResult as any);

		const result = await runAgentLoop(context);

		expect(result).toBe(mockResult);
		expect(getNextAction).toHaveBeenCalledTimes(2);
		expect(searchSerper).toHaveBeenCalledWith(
			{ q: "weather today", num: 10 },
			undefined,
		);
		expect(answerQuestion).toHaveBeenCalledWith(context);
	});

	it("should execute scrape action and update context", async () => {
		const context = new SystemContext("Tell me about AI");

		// Mock scrape action
		vi.mocked(getNextAction).mockResolvedValueOnce({
			type: "scrape",
			urls: ["https://example.com/ai"],
		});

		// Mock scrape results
		vi.mocked(bulkCrawlWebsites).mockResolvedValueOnce({
			success: true,
			results: [
				{
					url: "https://example.com/ai",
					result: {
						success: true,
						data: "AI is artificial intelligence",
					},
				},
			],
		});

		// Mock answer action
		vi.mocked(getNextAction).mockResolvedValueOnce({
			type: "answer",
		});

		// Mock answer response
		const mockResult = {
			text: "AI is artificial intelligence.",
			textStream: (async function* () {
				yield "AI is artificial intelligence.";
			})(),
			mergeIntoDataStream: vi.fn(),
		};
		vi.mocked(answerQuestion).mockReturnValueOnce(mockResult as any);

		const result = await runAgentLoop(context);

		expect(result).toBe(mockResult);
		expect(getNextAction).toHaveBeenCalledTimes(2);
		expect(bulkCrawlWebsites).toHaveBeenCalledWith({
			urls: ["https://example.com/ai"],
			maxCharacters: undefined,
		});
		expect(answerQuestion).toHaveBeenCalledWith(context);
	});

	it("should return final answer when step limit is reached", async () => {
		const context = new SystemContext("What is machine learning?");

		// Simulate reaching step limit
		for (let i = 0; i < 10; i++) {
			context.incrementStep();
		}

		// Mock final answer
		const mockResult = {
			text: "Machine learning is a subset of AI.",
			textStream: (async function* () {
				yield "Machine learning is a subset of AI.";
			})(),
			mergeIntoDataStream: vi.fn(),
		};
		vi.mocked(answerQuestion).mockReturnValueOnce(mockResult as any);

		const result = await runAgentLoop(context);

		expect(result).toBe(mockResult);
		expect(answerQuestion).toHaveBeenCalledWith(context, { isFinal: true });
		expect(getNextAction).not.toHaveBeenCalled();
	});

	it("should handle search action without query", async () => {
		const context = new SystemContext("Test question");

		// Mock search action without query
		vi.mocked(getNextAction).mockResolvedValueOnce({
			type: "search",
			// query is undefined
		});

		await expect(runAgentLoop(context)).rejects.toThrow(
			"Search action requires a query",
		);
	});

	it("should handle scrape action without URLs", async () => {
		const context = new SystemContext("Test question");

		// Mock scrape action without URLs
		vi.mocked(getNextAction).mockResolvedValueOnce({
			type: "scrape",
			// urls is undefined
		});

		await expect(runAgentLoop(context)).rejects.toThrow(
			"Scrape action requires URLs",
		);
	});

	it("should handle scrape action with empty URLs array", async () => {
		const context = new SystemContext("Test question");

		// Mock scrape action with empty URLs
		vi.mocked(getNextAction).mockResolvedValueOnce({
			type: "scrape",
			urls: [],
		});

		await expect(runAgentLoop(context)).rejects.toThrow(
			"Scrape action requires URLs",
		);
	});

	it("should handle failed scrape results", async () => {
		const context = new SystemContext("Test question");

		// Mock scrape action
		vi.mocked(getNextAction).mockResolvedValueOnce({
			type: "scrape",
			urls: ["https://example.com"],
		});

		// Mock failed scrape results
		vi.mocked(bulkCrawlWebsites).mockResolvedValueOnce({
			success: false,
			results: [
				{
					url: "https://example.com",
					result: {
						success: false,
						error: "Failed to fetch website",
					},
				},
			],
			error: "Failed to crawl some websites",
		});

		// Mock answer action
		vi.mocked(getNextAction).mockResolvedValueOnce({
			type: "answer",
		});

		// Mock answer response
		const mockResult = {
			text: "Best effort answer.",
			textStream: (async function* () {
				yield "Best effort answer.";
			})(),
			mergeIntoDataStream: vi.fn(),
		};
		vi.mocked(answerQuestion).mockReturnValueOnce(mockResult as any);

		const result = await runAgentLoop(context);

		expect(result).toBe(mockResult);
		expect(bulkCrawlWebsites).toHaveBeenCalledWith({
			urls: ["https://example.com"],
			maxCharacters: undefined,
		});
	});

	it("should execute multiple actions in sequence", async () => {
		const context = new SystemContext("Research AI and machine learning");

		// Mock sequence: search -> scrape -> answer
		vi.mocked(getNextAction)
			.mockResolvedValueOnce({
				type: "search",
				query: "AI machine learning",
			})
			.mockResolvedValueOnce({
				type: "scrape",
				urls: ["https://ai.com"],
			})
			.mockResolvedValueOnce({
				type: "answer",
			});

		// Mock search results
		vi.mocked(searchSerper).mockResolvedValueOnce({
			organic: [
				{
					title: "AI Overview",
					link: "https://ai.com",
					snippet: "AI and ML overview",
					date: "2024-01-01",
					position: 1,
				},
			],
			searchParameters: {
				q: "AI machine learning",
				type: "search",
				engine: "google",
			},
			credits: 1,
		});

		// Mock scrape results
		vi.mocked(bulkCrawlWebsites).mockResolvedValueOnce({
			success: true,
			results: [
				{
					url: "https://ai.com",
					result: {
						success: true,
						data: "Detailed AI content",
					},
				},
			],
		});

		// Mock answer response
		const mockResult = {
			text: "Comprehensive AI answer.",
			textStream: (async function* () {
				yield "Comprehensive AI answer.";
			})(),
			mergeIntoDataStream: vi.fn(),
		};
		vi.mocked(answerQuestion).mockReturnValueOnce(mockResult as any);

		const result = await runAgentLoop(context);

		expect(result).toBe(mockResult);
		expect(getNextAction).toHaveBeenCalledTimes(3);
		expect(context.getStep()).toBe(2); // Two actions executed
	});
});
