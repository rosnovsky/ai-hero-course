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

	// Create trace at the beginning
	const trace = langfuse.trace({
		name: "chat",
		userId: session.user.id,
	});

	const rateLimitSpan = trace.span({
		name: "check-rate-limit",
		input: { userId },
	});
	const canMakeRequest = await checkRateLimit(userId);
	rateLimitSpan.end({
		output: { canMakeRequest },
	});
	console.debug({ canMakeRequest });

	if (!canMakeRequest) {
		return new Response("Too Many Requests", { status: 429 });
	}

	const recordRequestSpan = trace.span({
		name: "record-request",
		input: { userId },
	});
	await recordRequest(userId);
	recordRequestSpan.end({
		output: { success: true },
	});

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
		const getChatSpan = trace.span({
			name: "get-existing-chat",
			input: { chatId: currentChatId, userId },
		});
		const existingChat = await getChat(currentChatId, userId);
		getChatSpan.end({
			output: { existingChat: existingChat ? { id: existingChat.id, title: existingChat.title } : null },
		});
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
		const createChatSpan = trace.span({
			name: "create-new-chat",
			input: {
				userId,
				chatId: currentChatId,
				title,
				messageCount: messages.filter((msg) => msg.role === "user").length,
			},
		});
		await upsertChat({
			userId,
			chatId: currentChatId,
			title,
			messages: messages.filter((msg) => msg.role === "user"), // Only save user messages initially
		});
		createChatSpan.end({
			output: { success: true, chatId: currentChatId },
		});
	}

	// Update the trace with the sessionId once we have the chatId
	trace.update({
		sessionId: currentChatId,
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

						const saveChatSpan = trace.span({
							name: "save-chat-completion",
							input: {
								userId,
								chatId: currentChatId,
								title,
								messageCount: updatedMessages.length,
							},
						});
						await upsertChat({
							userId,
							chatId: currentChatId,
							title,
							messages: updatedMessages,
						});
						saveChatSpan.end({
							output: { success: true, chatId: currentChatId },
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
