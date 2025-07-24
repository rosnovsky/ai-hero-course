import { redirect } from "next/navigation";
import { auth } from "~/server/auth/index.ts";
import { ChatPage } from "../../chat.tsx";

export default async function NewChatPage() {
	const session = await auth();

	if (!session?.user) {
		redirect("/");
	}

	const userName = session.user.name ?? "Guest";

	return <ChatPage userName={userName} />;
}
