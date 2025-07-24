import type { Message } from "ai";

export function isNewChatCreated(
  data: unknown,
): data is {
  type: "NEW_CHAT_CREATED";
  chatId: string;
} {
  return (
    typeof data === "object" &&
    data !== null &&
    "type" in data &&
    data.type === "NEW_CHAT_CREATED" &&
    "chatId" in data &&
    typeof data.chatId === "string"
  );
}

/**
 * Generate a title for a chat based on the first user message.
 * If no user messages are present, returns a default title.
 * @param {Message[]} messages - Array of messages in the chat.
 * @return {string} - Generated chat title.
 */
export const generateChatTitle = (messages: Message[]): string => {
   const firstUserMessage = messages.find((m) => m.role === "user");

   if (!firstUserMessage) {
     return "New Chat";
   }

   const title = firstUserMessage.content.slice(0, 50);
   // Append ellipsis if the original message was longer
   return firstUserMessage.content.length > 50 ? `${title}...` : title;
 };;
