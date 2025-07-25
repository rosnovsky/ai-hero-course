import type { Message } from "ai";
import ReactMarkdown, { type Components } from "react-markdown";
import type { OurMessageAnnotation } from "~/message-annotation";
import { ReasoningSteps } from "./reasoning-steps";

export type MessagePart = NonNullable<Message["parts"]>[number];

interface ChatMessageProps {
	parts: MessagePart[];
	role: string;
	userName: string;
	annotations: OurMessageAnnotation[];
}

const components: Components = {
	// Override default elements with custom styling
	p: ({ children }) => <p className="mb-4 first:mt-0 last:mb-0">{children}</p>,
	ul: ({ children }) => <ul className="mb-4 list-disc pl-4">{children}</ul>,
	ol: ({ children }) => <ol className="mb-4 list-decimal pl-4">{children}</ol>,
	li: ({ children }) => <li className="mb-1">{children}</li>,
	code: ({ className, children, ...props }) => (
		<code className={`${className ?? ""}`} {...props}>
			{children}
		</code>
	),
	pre: ({ children }) => (
		<pre className="mb-4 overflow-x-auto rounded-lg bg-gray-700 p-4">
			{children}
		</pre>
	),
	a: ({ children, ...props }) => (
		<a
			className="text-blue-400 underline"
			target="_blank"
			rel="noopener noreferrer"
			{...props}
		>
			{children}
		</a>
	),
};

export const ChatMessage = ({
	parts,
	role,
	userName,
	annotations,
}: ChatMessageProps) => {
	const isAI = role === "assistant";

	return (
		<div className="mb-6">
			<div
				className={`rounded-lg p-4 ${
					isAI ? "bg-gray-800 text-gray-300" : "bg-gray-900 text-gray-300"
				}`}
			>
				<p className="mb-2 text-sm font-semibold text-gray-400">
					{isAI ? "AI" : userName}
				</p>

				{isAI && <ReasoningSteps annotations={annotations} />}

				<div className="prose prose-invert max-w-none">
					{parts.map((part, index) => {
						if (part.type === "text") {
              return <ReactMarkdown components={components} key={index}>{part.text}</ReactMarkdown>;
						} else if (part.type === "tool-invocation") {
							const { toolName, state } = part.toolInvocation;
							return (
								<div
									key={index}
									className="my-2 rounded border border-gray-600 p-2"
								>
									<p className="font-semibold">
										Tool Invocation ({state}): {toolName}
									</p>
									<pre className="whitespace-pre-wrap text-sm text-gray-400">
										{JSON.stringify(
											state === "result" ? part.toolInvocation.result : null,
											null,
											2,
										)}
									</pre>
								</div>
							);
						}
					})}
				</div>
			</div>
		</div>
	);
};
