import type { Message } from "@ai-sdk/react";
import { and, eq } from "drizzle-orm";
import type { OurMessageAnnotation } from "~/message-annotation";
import { db } from "~/server/db";
import { chats, messages } from "~/server/db/schema";

export const upsertChat = async (opts: {
	userId: string;
	chatId: string;
	title: string;
	messages: Message[];
}) => {
	const { userId, chatId, title, messages: newMessages } = opts;

	await db.transaction(async (tx) => {
		// Check if chat exists and belongs to the user
		const existingChat = await tx.query.chats.findFirst({
			where: eq(chats.id, chatId),
		});

		if (existingChat && existingChat.userId !== userId) {
			throw new Error("Chat not found.");
		}

		if (existingChat) {
			// If chat exists, delete all existing messages for this chat
			await tx.delete(messages).where(eq(messages.chatId, chatId));
		}

		// Upsert the chat
		await tx
			.insert(chats)
			.values({
				id: chatId,
				userId,
				title,
				updatedAt: new Date(), // Update timestamp on upsert
			})
			.onConflictDoUpdate({
				target: chats.id,
				set: {
					title, // Only update title and updatedAt on conflict, userId should not change
					updatedAt: new Date(),
				},
			});

		// Insert new messages
		if (newMessages.length > 0) {
			await tx.insert(messages).values(
				newMessages.map((msg, index) => {
					// Normalize messages to always use parts format
					let parts: Message["parts"];
					if (msg.parts && Array.isArray(msg.parts)) {
						// Message already has parts (assistant messages with tool calls, etc.)
						parts = msg.parts;
					} else if (msg.content) {
						// Convert string content to parts format (user messages, simple assistant messages)
						if (typeof msg.content === "string") {
							parts = [{ type: "text", text: msg.content }];
						} else {
							// content is already an array of parts
							parts = msg.content;
						}
					} else {
						// Fallback for empty messages
						parts = [];
					}

					return {
						id: crypto.randomUUID(), // Use crypto.randomUUID() for message IDs
						chatId,
						role: msg.role,
						parts, // Store normalized parts array
						annotations: (msg as Message & { annotations?: OurMessageAnnotation[] }).annotations ?? null, // Store annotations if present
						order: index,
					};
				}),
			);
		}
	});
};

export const getChat = async (chatId: string, userId: string) => {
	const chatWithMessages = await db.query.chats.findFirst({
		where: and(eq(chats.id, chatId), eq(chats.userId, userId)),
		with: {
			messages: {
				orderBy: (messages, { asc }) => [asc(messages.order)],
			},
		},
	});

	if (!chatWithMessages) {
		return null;
	}

	// Return the chat with raw database messages (no formatting)
	return chatWithMessages;
};



export const getChats = async (userId: string) => {
	const userChats = await db.query.chats.findMany({
		where: eq(chats.userId, userId),
		orderBy: (chats, { desc }) => [desc(chats.updatedAt)],
	});
	return userChats;
};
