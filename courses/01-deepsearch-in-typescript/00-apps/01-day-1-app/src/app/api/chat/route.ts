import type { Message } from "ai";
import {
    appendResponseMessages,
    createDataStreamResponse,
    streamText,
} from "ai";
import { Langfuse } from "langfuse";
import { z } from "zod";
import { env } from "~/env";
import { generateChatTitle } from "~/lib/helpers";
import { model } from "~/models";
import { searchSerper } from "~/serper";
import { auth } from "~/server/auth/index.ts";
import { getChat, upsertChat } from "~/server/db/chats";
import { checkRateLimit, recordRequest } from "~/server/rate-limiter";
import { cacheWithRedis } from "~/server/redis/redis";
import { bulkCrawlWebsites } from "~/server/web-scraper";

const langfuse = new Langfuse({
	environment: env.NODE_ENV,
});

export const maxDuration = 60;

// Cache the bulk crawl function
const cachedBulkCrawlWebsites = cacheWithRedis(
	"scrapePages",
	bulkCrawlWebsites,
);

export async function POST(request: Request) {
	const session = await auth();

	if (!session?.user) {
		return new Response("Unauthorized", { status: 401 });
	}

	const userId = session.user.id;

	const canMakeRequest = await checkRateLimit(userId);
	console.debug({ canMakeRequest });

	if (!canMakeRequest) {
		return new Response("Too Many Requests", { status: 429 });
	}

	await recordRequest(userId);

	const body = (await request.json()) as {
		messages: Array<Message>;
		chatId?: string;
	};

	const { messages, chatId } = body;

	// Create or identify the chat before starting the stream
	let currentChatId = chatId;
	let isNewChat = false;

	// If chatId is provided, verify it belongs to the authenticated user
	if (currentChatId) {
		const existingChat = await getChat(currentChatId, userId);
		if (!existingChat) {
			return new Response("Chat not found or unauthorized", { status: 404 });
		}
	}

	if (!currentChatId) {
		// Generate a new chat ID if none provided
		currentChatId = crypto.randomUUID();
		isNewChat = true;

		// Create the chat immediately with the user's message
		// This protects against broken streams
		const title = generateChatTitle(messages);
		await upsertChat({
			userId,
			chatId: currentChatId,
			title,
			messages: messages.filter((msg) => msg.role === "user"), // Only save user messages initially
		});
	}

	const trace = langfuse.trace({
		sessionId: currentChatId,
		name: "chat",
		userId: session.user.id,
	});

	return createDataStreamResponse({
		execute: async (dataStream) => {
			if (isNewChat) {
				dataStream.writeData({
					type: "NEW_CHAT_CREATED",
					chatId: currentChatId,
				});
			}

			const result = streamText({
				model,
				messages,
				maxSteps: 10,
				experimental_telemetry: {
					isEnabled: true,
					functionId: `agent`,
					metadata: {
						langfuseTraceId: trace.id,
					},
				},
				system: `You are a helpful assistant with access to two powerful tools:

1. 'searchWeb' - Use this first to find relevant web pages and get snippets
2. 'scrapePages' - Use this when you need the full content from specific pages found in search results

Workflow:
- Always start with searchWeb to find relevant sources
- If the search snippets don't provide enough detail to fully answer the question, use scrapePages to get complete content from the most promising URLs
- Use scrapePages when you need: full articles, detailed explanations, code examples, or comprehensive information that snippets can't provide

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
							}));
						},
					},
					scrapePages: {
						parameters: z.object({
							urls: z.array(z.string()).describe("URLs to scrape"),
						}),
						execute: async ({ urls }: { urls: string[] }) => {
							return await cachedBulkCrawlWebsites({ urls });
						},
					},
				},
				onFinish: async ({ response }) => {
					try {
						const responseMessages = response.messages;

						// Use appendResponseMessages to properly merge the messages
						const updatedMessages = appendResponseMessages({
							messages,
							responseMessages,
						});

						// Generate title for the chat (in case it's a new chat or we want to update it)
						const title = generateChatTitle(updatedMessages);

						await upsertChat({
							userId,
							chatId: currentChatId,
							title,
							messages: updatedMessages,
						});

						await langfuse.flushAsync();
					} catch (error) {
						console.error("Error saving chat:", error);
						// Don't throw here to avoid breaking the stream response
					}
				},
			});

			result.mergeIntoDataStream(dataStream);
		},
		onError: (e) => {
			console.error(e);
			return "Oops, an error occured!";
		},
	});
}
