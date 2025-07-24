import type { Message } from "@ai-sdk/react";
import { and, eq } from "drizzle-orm";
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
				newMessages.map((msg, index) => ({
					id: crypto.randomUUID(), // Use crypto.randomUUID() for message IDs
					chatId,
					role: msg.role,
					parts: msg.content, // `msg.content` can be `string | Part[]`, store as JSONB object
					order: index,
				})),
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

	// Map database messages back to the 'ai' Message type
	const formattedMessages: Message[] = chatWithMessages.messages.map((msg) => ({
		id: msg.id,
		role: msg.role as Message["role"],
		// `msg.parts` can be `string | object[]`. Message content expects a string.
		// If it's an object array, stringify it. Otherwise, use it directly.
		content: typeof msg.parts === "string" ? msg.parts : JSON.stringify(msg.parts),
	}));

	return {
		...chatWithMessages,
		messages: formattedMessages,
	};
};

export const getChats = async (userId: string) => {
	const userChats = await db.query.chats.findMany({
		where: eq(chats.userId, userId),
		orderBy: (chats, { desc }) => [desc(chats.updatedAt)],
	});
	return userChats;
};
