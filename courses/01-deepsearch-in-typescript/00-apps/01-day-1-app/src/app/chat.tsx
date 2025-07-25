"use client";

import { useChat } from "@ai-sdk/react";
import type { Message } from "ai";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { StickToBottom } from "use-stick-to-bottom";
import { ChatMessage } from "~/components/chat-message";
import { SignInModal } from "~/components/sign-in-modal";
import { isNewChatCreated } from "~/lib/helpers";
import type { OurMessageAnnotation } from "~/message-annotation";

interface ChatProps {
	userName: string;
	chatId?: string;
  initialMessages?: Message[];
}

export const ChatPage = ({ userName, chatId, initialMessages }: ChatProps) => {
  const router = useRouter();
  const { messages, input, handleInputChange, handleSubmit, isLoading, data } =
    useChat({
      api: '/api/chat',
      body: {
        chatId,
      },
      initialMessages,
    });

	useEffect(() => {
		const lastDataItem = data?.[data.length - 1];

		if (lastDataItem && isNewChatCreated(lastDataItem)) {
			router.push(`/chat/${lastDataItem.chatId}`);
		}
	}, [data, router]);

	return (
		<>
			<div className="flex flex-1 flex-col">
	  <StickToBottom
    className="mx-auto w-full max-w-[65ch] flex-1 overflow-auto [&>div]:scrollbar-thin [&>div]:scrollbar-track-gray-200 [&>div]:scrollbar-thumb-gray-600"
    resize="smooth"
    initial="smooth"
  >
					<StickToBottom.Content className="flex flex-col gap-4">
						{messages.map((message) => {
							return (
								<ChatMessage
									key={message.id}
									parts={message.parts ?? []}
									role={message.role}
									userName={userName}
									annotations={
										(message.annotations as unknown as OurMessageAnnotation[]) ?? []
									}
								/>
							);
						})}
					</StickToBottom.Content>
				</StickToBottom>

				<div className="border-t border-gray-700">
					<form onSubmit={handleSubmit} className="mx-auto max-w-[65ch] p-4">
						<div className="flex gap-2">
							<input
								value={input}
								onChange={handleInputChange}
								placeholder="Say something..."
								autoFocus
								aria-label="Chat input"
								className="flex-1 rounded border border-gray-700 bg-gray-800 p-2 text-gray-200 placeholder-gray-400 focus:border-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50"
							/>
							<button
								type="submit"
								disabled={isLoading}
								className="rounded bg-gray-700 px-4 py-2 text-white hover:bg-gray-600 focus:border-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50 disabled:hover:bg-gray-700"
							>
								{isLoading ? (
									<Loader2 className="size-4 animate-spin" />
								) : (
									"Send"
								)}
							</button>
						</div>
					</form>
				</div>
			</div>

			<SignInModal
				isOpen={false}
				onClose={() => {
					// No-op for now since modal is always closed
				}}
			/>
		</>
	);
};
