import { redirect } from "next/navigation";
import { auth } from "~/server/auth/index.ts";
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

	return <ChatPage userName={userName} chatId={chatId} />;
}
