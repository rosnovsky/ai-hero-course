import type { Message } from "ai";
import { createDataStreamResponse, streamText } from "ai";
import { z } from "zod";
import { model } from "~/models";
import { searchSerper } from "~/serper";
import { auth } from "~/server/auth/index.ts";
import { checkRateLimit, recordRequest } from "~/server/rate-limiter";

export const maxDuration = 60;

export async function POST(request: Request) {
	const session = await auth();

	if (!session?.user) {
		return new Response("Unauthorized", { status: 401 });
	}

	const userId = session.user.id;

	const canMakeRequest = await checkRateLimit(userId);
	console.debug({ canMakeRequest})

	if (!canMakeRequest) {
		return new Response("Too Many Requests", { status: 429 });
	}

	await recordRequest(userId);

	const body = (await request.json()) as {
		messages: Array<Message>;
	};

	return createDataStreamResponse({
		execute: async (dataStream) => {
			const { messages } = body;

			const result = streamText({
				model,
				messages,
				maxSteps: 10,
				system: `You are a helpful assistant. Always try to answer user questions by searching the web using the 'searchWeb' tool. When providing information, always cite your sources with inline links using the format [1](link), [2](link), etc., corresponding to the search results.`,
				tools: {
					searchWeb: {
						parameters: z.object({
							query: z.string().describe("The query to search the web for"),
						}),
						execute: async ({ query }: { query: string }, { abortSignal }) => {
							const results = await searchSerper(
								{ q: query, num: 10 },
								abortSignal,
							);

							return results.organic.map((result) => ({
								title: result.title,
								link: result.link,
								snippet: result.snippet,
							}));
						},
					},
				},
			});

			result.mergeIntoDataStream(dataStream);
		},
		onError: (e) => {
			console.error(e);
			return "Oops, an error occured!";
		},
	});
}
