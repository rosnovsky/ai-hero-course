import type { Message } from "ai";
import { redirect } from "next/navigation";
import { auth } from "~/server/auth/index.ts";
import { getChat } from "~/server/db/chats";
import { ChatPage } from "../../chat.tsx";

interface ChatPageProps {
	params: Promise<{ chatId: string }>;
}

export default async function ChatPageRoute({ params }: ChatPageProps) {
	const { chatId } = await params;
	const session = await auth();

	if (!session?.user) {
		redirect("/");
	}

	const userName = session.user.name ?? "Guest";

	// Fetch the chat from the database
	const chat = await getChat(chatId, session.user.id);

	if (!chat) {
		redirect("/");
	}

	// Map database messages to AI SDK Message format using exact format from instructions
	const dbMessages = chat.messages;
	const initialMessages: Message[] = dbMessages?.map((msg) => ({
		id: msg.id,
		// msg.role is typed as string, so we
		// need to cast it to the correct type
		role: msg.role as "user" | "assistant",
		// msg.parts is typed as unknown[], so we
		// need to cast it to the correct type
		parts: msg.parts as Message["parts"],
		// content is not persisted, so we can
		// safely pass an empty string, because
		// parts are always present, and the AI SDK
		// will use the parts to construct the content
		content: "",
		// Include annotations if they exist
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
		annotations: msg.annotations as any,
	})) ?? [];

	return <ChatPage userName={userName} chatId={chatId} initialMessages={initialMessages} />;
}
