import type { JSONValue, Message } from "ai";
import { appendResponseMessages, createDataStreamResponse } from "ai";
import { Langfuse } from "langfuse";
import { streamFromDeepSearch } from "~/deep-search";
import { env } from "~/env";
import { generateChatTitle } from "~/lib/helpers";
import { getRequestHints } from "~/lib/request-hints";
import type { OurMessageAnnotation } from "~/message-annotation";
import { auth } from "~/server/auth/index.ts";
import { getChat, upsertChat } from "~/server/db/chats";
import type { RateLimitConfig } from "~/server/global-rate-limiter";
import { checkRateLimit, recordRateLimit } from "~/server/global-rate-limiter";

const langfuse = new Langfuse({
	environment: env.NODE_ENV,
});

export const maxDuration = 60;

export async function POST(request: Request) {
	const session = await auth();

	if (!session?.user) {
		return new Response("Unauthorized", { status: 401 });
	}

	const userId = session.user.id;

	// Get location hints from request
	const requestHints = getRequestHints(request);
	console.log("Request hints:", requestHints);

	// Create trace at the beginning
	const trace = langfuse.trace({
		name: "chat",
		userId: session.user.id,
	});

	// Global rate limit configuration for testing
	const config: RateLimitConfig = {
		maxRequests: 15,
		maxRetries: 3,
		windowMs: 60_000, // 5 seconds
		keyPrefix: "global",
	};

	const rateLimitSpan = trace.span({
		name: "check-global-rate-limit",
		input: { config },
	});

	// Check the global rate limit
	const rateLimitCheck = await checkRateLimit(config);

	if (!rateLimitCheck.allowed) {
		console.log("Global rate limit exceeded, waiting...");
		const isAllowed = await rateLimitCheck.retry();

		// If the rate limit is still exceeded after retries, return a 429
		if (!isAllowed) {
			rateLimitSpan.end({
				output: { allowed: false, retriesExhausted: true },
			});
			return new Response("Rate limit exceeded", {
				status: 429,
			});
		}
	}

	rateLimitSpan.end({
		output: { allowed: true, remaining: rateLimitCheck.remaining },
	});

	// Record the request after successful rate limit check
	const recordRequestSpan = trace.span({
		name: "record-global-rate-limit",
		input: { config },
	});
	await recordRateLimit(config);
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
			output: {
				existingChat: existingChat
					? { id: existingChat.id, title: existingChat.title }
					: null,
			},
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
			const annotations: OurMessageAnnotation[] = [];

			if (isNewChat) {
				dataStream.writeData({
					type: "NEW_CHAT_CREATED",
					chatId: currentChatId,
				});
			}

			const writeMessageAnnotation = (annotation: OurMessageAnnotation) => {
				// Save the annotation in-memory
				annotations.push(annotation);
				// Send it to the client
				dataStream.writeMessageAnnotation(annotation as unknown as JSONValue);
			};

			const result = await streamFromDeepSearch({
				messages,
				writeMessageAnnotation,
				requestHints,
				onFinish: async ({ response }) => {
					try {
						const responseMessages = response.messages;

						// Use appendResponseMessages to properly merge the messages
						const updatedMessages = appendResponseMessages({
							messages,
							responseMessages,
						});

						// Create a copy for database persistence to avoid modifying the original response
						const messagesToSave = updatedMessages.map(msg => ({ ...msg }));

						// Get the last message and add annotations to it (only for database persistence)
						const lastMessage = messagesToSave[messagesToSave.length - 1];
						if (lastMessage && annotations.length > 0) {
							// Add the annotations to the last message copy
							(lastMessage as unknown as Record<string, unknown>).annotations = annotations;
						}

						// Generate title for the chat (in case it's a new chat or we want to update it)
						const title = generateChatTitle(messagesToSave);

						const saveChatSpan = trace.span({
							name: "save-chat-completion",
							input: {
								userId,
								chatId: currentChatId,
								title,
								messageCount: messagesToSave.length,
							},
						});
						await upsertChat({
							userId,
							chatId: currentChatId,
							title,
							messages: messagesToSave,
						});
						saveChatSpan.end({
							output: { success: true, chatId: currentChatId },
						});


					} catch (error) {
						console.error("Error saving chat:", error);
						// Don't throw here to avoid breaking the stream response
					}
				},
				telemetry: {
					isEnabled: true,
					functionId: `agent`,
					metadata: {
						langfuseTraceId: trace.id,
					},
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
