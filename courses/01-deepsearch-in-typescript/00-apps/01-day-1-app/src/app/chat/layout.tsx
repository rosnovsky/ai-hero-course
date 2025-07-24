import Link from "next/link";
import { auth } from "~/server/auth/index.ts";
import { getChats } from "~/server/db/chats";
import { AuthButton } from "../../components/auth-button.tsx";
import { NewChat } from "../../components/new-chat.tsx";

export default async function ChatLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const session = await auth();
	const isAuthenticated = !!session?.user;

	// Fetch chats if user is authenticated
	const chats =
		isAuthenticated && session.user?.id ? await getChats(session.user.id) : [];

	return (
		<div className="flex h-screen bg-gray-950">
			{/* Sidebar */}
			<div className="flex w-64 flex-col border-r border-gray-700 bg-gray-900">
				<div className="p-4">
					<div className="flex items-center justify-between">
						<h2 className="text-sm font-semibold text-gray-400">Your Chats</h2>
						{isAuthenticated && <NewChat />}
					</div>
				</div>
				<div className="-mt-1 flex-1 space-y-2 overflow-y-auto px-4 pt-1 scrollbar-thin scrollbar-track-gray-800 scrollbar-thumb-gray-600">
					{chats.length > 0 ? (
						chats.map((chat) => (
							<div key={chat.id} className="flex items-center gap-2">
								<Link
									href={`/chat/${chat.id}`}
									className="flex-1 rounded-lg p-3 text-left text-sm text-gray-300 hover:bg-gray-750 bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400"
								>
									{chat.title}
								</Link>
							</div>
						))
					) : (
						<p className="text-sm text-gray-500">
							{isAuthenticated
								? "No chats yet. Start a new conversation!"
								: "Sign in to start chatting"}
						</p>
					)}
				</div>
				<div className="p-4">
					<AuthButton
						isAuthenticated={isAuthenticated}
						userImage={session?.user?.image}
					/>
				</div>
			</div>

			{children}
		</div>
	);
}
