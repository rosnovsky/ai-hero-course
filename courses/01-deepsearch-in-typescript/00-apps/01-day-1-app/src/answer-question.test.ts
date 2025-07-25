/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { answerQuestion } from "~/answer-question";
import { SystemContext } from "~/system-context";

// Mock the AI library
vi.mock("ai", () => ({
	generateText: vi.fn(),
}));

// Mock the models
vi.mock("~/models", () => ({
	model: "mocked-model",
}));

import { generateText } from "ai";

describe("answerQuestion", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should generate an answer with default options", async () => {
		const context = new SystemContext("What is artificial intelligence?");
		context.reportQueries([
			{
				query: "artificial intelligence",
				results: [
					{
						date: "2024-01-01",
						title: "AI Overview",
						url: "https://example.com/ai",
						snippet: "AI is the simulation of human intelligence",
					},
				],
			},
		]);

		// Mock the generateText response
		vi.mocked(generateText).mockResolvedValue({
			text: "Artificial intelligence (AI) is a broad field of computer science focused on creating intelligent machines.",
			reasoning: undefined,
			files: [],
			reasoningDetails: undefined,
			sources: [],
			usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
			finishReason: "stop",
			warnings: [],
			experimental_providerMetadata: undefined,
			response: { id: "test", timestamp: new Date(), modelId: "test" },
			object: undefined,
			experimental_telemetry: undefined,
			request: { body: "" },
			rawCall: { rawPrompt: null, rawSettings: {} },
			rawResponse: { headers: {}, response: null },
		} as unknown as any);

		const result = await answerQuestion(context);

		expect(result).toBe(
			"Artificial intelligence (AI) is a broad field of computer science focused on creating intelligent machines.",
		);

		// Verify generateText was called with correct parameters
		expect(generateText).toHaveBeenCalledWith({
			model: "mocked-model",
			system: expect.stringContaining("You are a helpful AI assistant"),
			prompt: context.getFullContext(),
		});

		// Verify the system prompt doesn't contain final attempt message
		const call = vi.mocked(generateText).mock.calls[0]![0];
		expect(call.system).not.toContain("This is the final attempt");
	});

	it("should generate an answer with isFinal flag", async () => {
		const context = new SystemContext("What is machine learning?");
		context.reportQueries([
			{
				query: "machine learning",
				results: [
					{
						date: "2024-01-01",
						title: "ML Basics",
						url: "https://example.com/ml",
						snippet: "Machine learning is a subset of AI",
					},
				],
			},
		]);

		// Mock the generateText response
		vi.mocked(generateText).mockResolvedValue({
			text: "Based on the available information, machine learning is a subset of artificial intelligence.",
		} as unknown as any);

		const result = await answerQuestion(context, { isFinal: true });

		expect(result).toBe(
			"Based on the available information, machine learning is a subset of artificial intelligence.",
		);

		// Verify generateText was called with final attempt message
		const call = vi.mocked(generateText).mock.calls[0]![0];
		expect(call.system).toContain("This is the final attempt");
		expect(call.system).toContain(
			"You may not have all the information you would ideally want",
		);
	});

	it("should include current date in system prompt", async () => {
		const context = new SystemContext("What happened today?");

		// Mock the generateText response
		vi.mocked(generateText).mockResolvedValue({
			text: "Today's events based on available information.",
		} as unknown as any);

		await answerQuestion(context);

		// Verify the system prompt includes current date
		const call = vi.mocked(generateText).mock.calls[0]![0];
		expect(call.system).toContain("Current date and time:");
		expect(call.system).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/); // ISO date format
	});

	it("should include markdown link formatting instructions", async () => {
		const context = new SystemContext("Tell me about JavaScript");

		// Mock the generateText response
		vi.mocked(generateText).mockResolvedValue({
			text: "JavaScript is a programming language.",
		} as unknown as any);

		await answerQuestion(context);

		// Verify the system prompt includes link formatting instructions
		const call = vi.mocked(generateText).mock.calls[0]![0];
		expect(call.system).toContain("inline markdown format: [link text](URL)");
		expect(call.system).toContain("Make the link text descriptive");
	});

	it("should pass the full context from SystemContext", async () => {
		const context = new SystemContext("What is deep learning?");

		// Add some search and scrape history
		context.reportQueries([
			{
				query: "deep learning",
				results: [
					{
						date: "2024-01-01",
						title: "Deep Learning Guide",
						url: "https://example.com/dl",
						snippet: "Deep learning uses neural networks",
					},
				],
			},
		]);

		context.reportScrapes([
			{
				url: "https://example.com/dl",
				result: "Deep learning is a subset of machine learning...",
			},
		]);

		// Mock the generateText response
		vi.mocked(generateText).mockResolvedValue({
			text: "Deep learning explanation based on research.",
		} as unknown as any);

		await answerQuestion(context);

		// Verify the prompt includes the full context
		const call = vi.mocked(generateText).mock.calls[0]![0];
		expect(call.prompt).toContain("What is deep learning?");
		expect(call.prompt).toContain("Deep Learning Guide");
		expect(call.prompt).toContain("Deep learning is a subset of machine learning");
	});

	it("should handle empty context gracefully", async () => {
		const context = new SystemContext("");

		// Mock the generateText response
		vi.mocked(generateText).mockResolvedValue({
			text: "I don't have enough information to answer this question.",
		} as unknown as any);

		const result = await answerQuestion(context);

		expect(result).toBe(
			"I don't have enough information to answer this question.",
		);
		expect(generateText).toHaveBeenCalledWith({
			model: "mocked-model",
			system: expect.stringContaining("You are a helpful AI assistant"),
			prompt: context.getFullContext(),
		});
	});

	it("should handle generateText errors", async () => {
		const context = new SystemContext("Test question");

		// Mock generateText to throw an error
		vi.mocked(generateText).mockRejectedValue(new Error("AI service error"));

		await expect(answerQuestion(context)).rejects.toThrow("AI service error");
	});
});
