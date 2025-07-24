import { PlusIcon } from "lucide-react";
import Link from "next/link";
import { auth } from "~/server/auth/index.ts";
import { getChats } from "~/server/db/chats.ts";
import { AuthButton } from "../components/auth-button.tsx";

export default async function HomePage() {
	const session = await auth();
	const isAuthenticated = !!session?.user;
	const chats = await getChats(session!.user.id);

	return (
		<div className="flex h-screen bg-gray-950">
			{/* Sidebar */}
			<div className="flex w-64 flex-col border-r border-gray-700 bg-gray-900">
				<div className="p-4">
					<div className="flex items-center justify-between">
						<h2 className="text-sm font-semibold text-gray-400">Your Chats</h2>
						{isAuthenticated && (
							<Link
								href="/"
								className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
								title="New Chat"
							>
								<PlusIcon className="h-5 w-5" />
							</Link>
						)}
					</div>
				</div>
				<div className="-mt-1 flex-1 space-y-2 overflow-y-auto px-4 pt-1 scrollbar-thin scrollbar-track-gray-800 scrollbar-thumb-gray-600">
					{chats.length > 0 ? (
						chats.map((chat) => (
							<div key={chat.id} className="flex items-center gap-2">
								<Link
									href={`/chat/${chat.id}`}
									className={`flex-1 rounded-lg p-3 text-left text-sm text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-400 hover:bg-gray-750 bg-gray-800`}
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

			{/* Main content area */}
			<div className="flex flex-1 flex-col items-center justify-center bg-gray-950 text-gray-400">
				<div className="text-center">
					<h1 className="text-2xl font-semibold text-gray-200 mb-4">
						Welcome to AI Chat
					</h1>
					<p className="text-lg mb-6">
						{isAuthenticated
							? "Select a chat from the sidebar or start a new conversation"
							: "Sign in to start chatting with AI"}
					</p>
					{isAuthenticated && (
						<Link
							href="/chat/new"
							className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
						>
							<PlusIcon className="size-4" />
							Start New Chat
						</Link>
					)}
				</div>
			</div>
		</div>
	);
}
