/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { bulkCrawlWebsites, crawlWebsite } from "./web-scraper";

// Mock external dependencies
vi.mock("node:timers/promises", () => ({
	setTimeout: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("robots-parser", () => ({
	default: vi.fn().mockReturnValue({
		isAllowed: vi.fn().mockReturnValue(true),
	}),
}));

vi.mock("~/server/redis/redis", () => ({
	cacheWithRedis: vi.fn((key, fn) => fn),
}));

// Mock fetch globally
global.fetch = vi.fn();

const mockFetch = global.fetch as unknown as ReturnType<typeof vi.fn>;

describe("Web Scraper maxCharacters functionality", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockFetch.mockResolvedValue({
			ok: true,
			text: vi.fn().mockResolvedValue(`
				<html>
					<body>
						<article>
							<h1>Test Article</h1>
							<p>This is a very long paragraph that contains a lot of text content. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.</p>
							<p>Another paragraph with more content to make this article longer and test the truncation functionality properly.</p>
						</article>
					</body>
				</html>
			`),
		});

		// Mock robots.txt fetch
		mockFetch.mockImplementation((url: string) => {
			if (url.includes("robots.txt")) {
				return Promise.resolve({
					ok: false,
				});
			}
			return Promise.resolve({
				ok: true,
				text: () =>
					Promise.resolve(`
					<html>
						<body>
							<article>
								<h1>Test Article</h1>
								<p>This is a very long paragraph that contains a lot of text content. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.</p>
								<p>Another paragraph with more content to make this article longer and test the truncation functionality properly.</p>
							</article>
						</body>
					</html>
				`),
			});
		});
	});

	it("should return full content when maxCharacters is not specified", async () => {
		const result = await crawlWebsite({
			url: "https://example.com/article",
		});

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data).not.toContain("...");
			expect(result.data.length).toBeGreaterThan(100);
		}
	});

	it("should truncate content when maxCharacters is specified and content is longer", async () => {
		const maxCharacters = 100;
		const result = await crawlWebsite({
			url: "https://example.com/article",
			maxCharacters,
		});

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data).toContain("...");
			expect(result.data.length).toBe(maxCharacters + 3); // +3 for "..."
		}
	});

	it("should not truncate content when maxCharacters is larger than content", async () => {
		const maxCharacters = 10000;
		const result = await crawlWebsite({
			url: "https://example.com/article",
			maxCharacters,
		});

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data).not.toContain("...");
			expect(result.data.length).toBeLessThan(maxCharacters);
		}
	});

	it("should apply maxCharacters to bulk crawl operations", async () => {
		const maxCharacters = 50;
		const urls = [
			"https://example.com/article1",
			"https://example.com/article2",
		];

		const result = await bulkCrawlWebsites({
			urls,
			maxCharacters,
		});

		expect(result.success).toBe(true);
		if (result.success) {
			result.results.forEach((crawlResult) => {
				if (crawlResult.result.success) {
					expect(crawlResult.result.data.length).toBeLessThanOrEqual(
						maxCharacters + 3,
					);
				}
			});
		}
	});

	it("should handle very small maxCharacters values", async () => {
		const maxCharacters = 10;
		const result = await crawlWebsite({
			url: "https://example.com/article",
			maxCharacters,
		});

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data).toContain("...");
			expect(result.data.length).toBe(maxCharacters + 3);
		}
	});



	it("should handle empty content gracefully", async () => {
		mockFetch.mockImplementation((url: string) => {
			if (url.includes("robots.txt")) {
				return Promise.resolve({ ok: false });
			}
			return Promise.resolve({
				ok: true,
				text: () => Promise.resolve("<html><body></body></html>"),
			});
		});

		const result = await crawlWebsite({
			url: "https://example.com/empty",
			maxCharacters: 100,
		});

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data).toBe("");
		}
	});
});
