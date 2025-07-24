"use client";

import { PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";

export const NewChat = () => {
	const router = useRouter();

	const handleNewChat = () => {
		// Navigate to a new chat route
		router.push("/chat/new");
	};

	return (
		<button
			onClick={handleNewChat}
			className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
			title="New Chat"
		>
			<PlusIcon className="h-5 w-5" />
		</button>
	);
};
