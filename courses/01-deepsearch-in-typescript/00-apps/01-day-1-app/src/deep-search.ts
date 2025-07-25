import {
  generateObject,
  type Message,
  streamText,
  type TelemetrySettings,
} from "ai";
import { actionSchema } from "~/action-types";
import type { RequestHints } from "~/lib/request-hints";
import { getRequestPromptFromHints } from "~/lib/request-hints";
import type { OurMessageAnnotation } from "~/message-annotation";
import { model } from "~/models";
import { runAgentLoop } from "~/run-agent-loop";
import { SystemContext } from "~/system-context";

export const getNextAction = async (
	context: SystemContext,
	langfuseTraceId?: string,
) => {
	console.log("🤔 Getting next action. Current context:", {
		step: context.getStep(),
		shouldStop: context.shouldStop(),
		question: context.getUserQuestion(),
	});

	const result = await generateObject({
		model,
		schema: actionSchema,
		prompt: `
You are a helpful assistant that determines the next action to take in a web search and analysis workflow.

Current date and time: ${new Date().toISOString()}

Your goal is to determine the next action to take based on the context provided. You have three options:

1. 'search': Search the web for more information when you need to find relevant web pages and get snippets
2. 'scrape': Scrape specific URLs when you need to get the full content from web pages you've already found
3. 'answer': Answer the user's question when you have sufficient information to provide a comprehensive response

Decision Guidelines:
- Start with 'search' if you haven't found relevant sources yet or need more current information
- Use 'scrape' when you have promising URLs from search results but need their full content for detailed analysis
- Choose 'answer' when you have gathered sufficient information to provide a complete, well-informed response
- When users ask for "up to date", "latest", "recent", or "current" information, include the current date in search queries
- Consider the step count - if you're approaching the limit (10 steps), lean towards answering with available information

Workflow Strategy:
1. Search first to find relevant sources and get overview snippets
2. Scrape the most promising URLs to get detailed content
3. Search again if you need additional sources or different angles
4. Answer when you have comprehensive information

${context.getFullContext()}`,
		experimental_telemetry: {
			isEnabled: !!langfuseTraceId,
			functionId: "get-next-action",
			metadata: langfuseTraceId ? {
				langfuseTraceId,
			} : {},
		},
	});

	console.log("🎯 Action decision made:", result.object);
	return result.object;
};

export const streamFromDeepSearch = async (opts: {
	messages: Message[];
	onFinish: Parameters<typeof streamText>[0]["onFinish"];
	telemetry: TelemetrySettings;
	writeMessageAnnotation: (annotation: OurMessageAnnotation) => void;
	requestHints?: RequestHints;
}) => {
	console.log(
		"🚀 streamFromDeepSearch started with messages:",
		opts.messages.length,
	);
	// Extract the user's question from the last message
	const lastMessage = opts.messages.length > 0 ? opts.messages[opts.messages.length - 1] : null;
	const question = lastMessage?.content ?? "";

	// Handle edge case where there are no messages yet
	if (opts.messages.length === 0) {
		console.log("⚠️ No messages provided, using empty question");
	}

	console.log("❓ Extracted question:", question);
	// Create system context with the question
	const context = new SystemContext(question, opts.requestHints);

	console.log("📋 Created system context");

	const langfuseTraceId =
		opts.telemetry.isEnabled && opts.telemetry.metadata
			? (opts.telemetry.metadata as { langfuseTraceId?: string }).langfuseTraceId
			: undefined;

	// Run the agent loop to build the context
	console.log("🔄 About to call runAgentLoop");
	await runAgentLoop({
		context,
		writeMessageAnnotation: opts.writeMessageAnnotation,
		langfuseTraceId,
	});
	console.log("✅ runAgentLoop completed, now streaming final answer");

	// Now stream the final answer using the built context and full conversation history
	const locationContext = opts.requestHints ? getRequestPromptFromHints(opts.requestHints) : "";
	const systemPrompt = `You are a helpful AI assistant that provides comprehensive, well-researched answers based on the information gathered from web searches and page scraping.

Current date and time: ${new Date().toISOString()}

${locationContext ? locationContext + '\n' : ''}Your task is to answer the user's question using the search results and scraped content provided below, while maintaining context from the conversation history.

Guidelines for your response:
- Provide a comprehensive, well-structured answer that directly addresses the user's question
- Use the most relevant and up-to-date information from the search and scrape results
- Cite your sources using inline markdown links in the format [descriptive text](URL)
- If multiple sources provide conflicting information, acknowledge the discrepancies and explain them
- Structure your response with clear headings and bullet points where appropriate
- Be factual and avoid speculation beyond what the sources support
- Consider the full conversation context when formulating your response

When formatting links, always use inline markdown format: [link text](URL)
- Make the link text descriptive and meaningful
- Ensure URLs are complete and functional
- Use this format consistently throughout your response

## Research Context

${context.getFullContext()}

Remember: Your goal is to provide a helpful, accurate, and well-sourced answer that directly addresses the user's question while considering the full conversation context.`;

	// Create messages array with system message and conversation history
	const messagesWithContext = [
		{
			role: "system" as const,
			content: systemPrompt,
		},
		...opts.messages,
	];

	// Handle edge case where there are no user messages yet
	if (opts.messages.length === 0) {
		messagesWithContext.push({
			id: crypto.randomUUID(),
			role: "user" as const,
			content: "Please provide a helpful introduction or ask how you can assist me.",
		});
	}

	return streamText({
		model,
		messages: messagesWithContext,
		onFinish: opts.onFinish,
		experimental_telemetry: {
			...opts.telemetry,
			functionId: "stream-from-deep-search",
		},
	});
};

export async function askDeepSearch(messages: Message[], requestHints?: RequestHints): Promise<string> {
	console.log("🔍 askDeepSearch called with messages:", messages.length);

	try {
		const result = await streamFromDeepSearch({
			messages,
			onFinish: () => {
				// Intentionally empty - no persistence needed for evaluation
			},
			telemetry: {
				isEnabled: false,
			},
			writeMessageAnnotation: () => {
				// no-op
			},
			requestHints,
		});

		console.log("📊 Agent loop completed, consuming stream...");

		const collectedText = await result.text;

		console.log("✅ Stream consumed successfully");
		console.log("📝 Final text result length:", collectedText.length);

		return collectedText;
	} catch (error) {
		console.error("❌ Error in askDeepSearch:", error);

		if (error instanceof Error) {
			console.error("Error name:", error.name);
			console.error("Error message:", error.message);
			console.error("Error stack:", error.stack);
		}

		// Log additional context
		console.error(
			"Messages that caused error:",
			JSON.stringify(messages, null, 2),
		);

		throw error;
	}
}
