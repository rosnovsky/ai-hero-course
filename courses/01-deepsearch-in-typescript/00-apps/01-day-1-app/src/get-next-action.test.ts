/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getNextAction } from "~/deep-search";
import { SystemContext } from "~/system-context";

// Mock the generateObject function
vi.mock("ai", () => ({
	generateObject: vi.fn(),
}));

// Mock the model
vi.mock("~/models", () => ({
	model: "mocked-model",
}));

const { generateObject } = await import("ai");

describe("getNextAction", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should return search action when no queries have been made", async () => {
		// Mock the AI response for initial search
		vi.mocked(generateObject).mockResolvedValue({
			object: {
				type: "search",
				query: "initial search query",
			},
			finishReason: "stop",
			usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
			warnings: [],
			request: {} as any,
			response: {} as any,
			logprobs: undefined,
			providerMetadata: undefined,
			experimental_providerMetadata: undefined,
			toJsonResponse: () => ({}) as any,
		});

		const context = new SystemContext("What is the latest news about AI?");

		const result = await getNextAction(context);

		expect(result.type).toBe("search");
		expect(result.query).toBe("initial search query");
		expect(vi.mocked(generateObject)).toHaveBeenCalledWith({
			model: "mocked-model",
			schema: expect.any(Object),
			prompt: expect.stringContaining("User Question"),
		});
	});

	it("should return scrape action when searches have been done but no scraping", async () => {
		// Mock the AI response for scraping
		vi.mocked(generateObject).mockResolvedValue({
			object: {
				type: "scrape",
				urls: ["https://example.com/article1", "https://example.com/article2"],
			},
			finishReason: "stop",
			usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
			warnings: [],
			request: {} as any,
			response: {} as any,
			logprobs: undefined,
			providerMetadata: undefined,
			experimental_providerMetadata: undefined,
			toJsonResponse: () => ({}) as any,
		});

		const context = new SystemContext("What is the latest news about AI?");

		// Simulate that some searches have been performed
		context.reportQueries([
			{
				query: "latest AI news 2024",
				results: [
					{
						date: "2024-01-15",
						title: "AI Breakthrough",
						url: "https://example.com/article1",
						snippet: "Recent developments in AI...",
					},
					{
						date: "2024-01-14",
						title: "Machine Learning Update",
						url: "https://example.com/article2",
						snippet: "New ML techniques...",
					},
				],
			},
		]);

		const result = await getNextAction(context);

		expect(result.type).toBe("scrape");
		expect(result.urls).toEqual([
			"https://example.com/article1",
			"https://example.com/article2",
		]);
	});

	it("should return answer action when sufficient information has been gathered", async () => {
		// Mock the AI response for answering
		vi.mocked(generateObject).mockResolvedValue({
			object: {
				type: "answer",
			},
			finishReason: "stop",
			usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
			warnings: [],
			request: {} as any,
			response: {} as any,
			logprobs: undefined,
			providerMetadata: undefined,
			experimental_providerMetadata: undefined,
			toJsonResponse: () => ({}) as any,
		});

		const context = new SystemContext("What is the latest news about AI?");

		// Simulate searches and scrapes have been performed
		context.reportQueries([
			{
				query: "latest AI news 2024",
				results: [
					{
						date: "2024-01-15",
						title: "AI Breakthrough",
						url: "https://example.com/article1",
						snippet: "Recent developments in AI...",
					},
				],
			},
		]);

		context.reportScrapes([
			{
				url: "https://example.com/article1",
				result:
					"Full article content about AI breakthrough with detailed analysis...",
			},
		]);

		const result = await getNextAction(context);

		expect(result.type).toBe("answer");
	});

	it("should include user question and step information in prompt", async () => {
		vi.mocked(generateObject).mockResolvedValue({
			object: { type: "search", query: "test" },
			finishReason: "stop",
			usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
			warnings: [],
			request: {} as any,
			response: {} as any,
			logprobs: undefined,
			providerMetadata: undefined,
			experimental_providerMetadata: undefined,
			toJsonResponse: () => ({}) as any,
		});

		const userQuestion =
			"What are the latest developments in quantum computing?";
		const context = new SystemContext(userQuestion);

		await getNextAction(context);

		const callArgs = vi.mocked(generateObject).mock.calls[0];
		const prompt = callArgs?.[0]?.prompt;

		expect(prompt).toContain("User Question");
		expect(prompt).toContain(
			"What are the latest developments in quantum computing?",
		);
		expect(prompt).toContain("Current Step");
		expect(prompt).toContain("1/10");
	});

	it("should include search and scrape history in prompt when available", async () => {
		vi.mocked(generateObject).mockResolvedValue({
			object: { type: "answer" },
			finishReason: "stop",
			usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
			warnings: [],
			request: {} as any,
			response: {} as any,
			logprobs: undefined,
			providerMetadata: undefined,
			experimental_providerMetadata: undefined,
			toJsonResponse: () => ({}) as any,
		});

		const context = new SystemContext(
			"Test question with search and scrape data",
		);

		context.reportQueries([
			{
				query: "test query",
				results: [
					{
						date: "2024-01-15",
						title: "Test Result",
						url: "https://test.com",
						snippet: "Test snippet",
					},
				],
			},
		]);

		context.reportScrapes([
			{
				url: "https://test.com",
				result: "Scraped content",
			},
		]);

		await getNextAction(context);

		const callArgs = vi.mocked(generateObject).mock.calls[0];
		const prompt = callArgs?.[0]?.prompt;

		expect(prompt).toContain("Search History");
		expect(prompt).toContain("test query");
		expect(prompt).toContain("Scrape History");
		expect(prompt).toContain("https://test.com");
		expect(prompt).toContain("Scraped content");
	});

	it("should handle context with current date in prompt", async () => {
		vi.mocked(generateObject).mockResolvedValue({
			object: { type: "search", query: "current events" },
			finishReason: "stop",
			usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
			warnings: [],
			request: {} as any,
			response: {} as any,
			logprobs: undefined,
			providerMetadata: undefined,
			experimental_providerMetadata: undefined,
			toJsonResponse: () => ({}) as any,
		});

		const context = new SystemContext("What happened today?");

		await getNextAction(context);

		const callArgs = vi.mocked(generateObject).mock.calls[0];
		const prompt = callArgs?.[0]?.prompt;

		expect(prompt).toContain("Current date and time:");
		expect(prompt).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/); // ISO date format
	});
});
