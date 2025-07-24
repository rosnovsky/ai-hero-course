import type { Message } from "ai";
import { appendResponseMessages, createDataStreamResponse, streamText } from "ai";
import { z } from "zod";
import { generateChatTitle } from "~/lib/helpers";
import { model } from "~/models";
import { searchSerper } from "~/serper";
import { auth } from "~/server/auth/index.ts";
import { getChat, upsertChat } from "~/server/db/chats";
import { checkRateLimit, recordRequest } from "~/server/rate-limiter";

export const maxDuration = 60;

export async function POST(request: Request) {
	const session = await auth();

	if (!session?.user) {
		return new Response("Unauthorized", { status: 401 });
	}

	const userId = session.user.id;

	const canMakeRequest = await checkRateLimit(userId);
	console.debug({ canMakeRequest})

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
			messages: messages.filter(msg => msg.role === "user"), // Only save user messages initially
		});
	}

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
				experimental_telemetry: { isEnabled: true },
				system: `You are a helpful assistant. Always try to answer user questions by searching the web using the 'searchWeb' tool. When providing information, always cite your sources with inline links using the format [1](link), [2](link), etc., corresponding to the search results.`,
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
