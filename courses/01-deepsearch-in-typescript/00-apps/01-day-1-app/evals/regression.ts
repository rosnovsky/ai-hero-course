import type { Message } from "ai";

export const regressionData: { input: Message[]; expected: string }[] = [
	{
		input: [
			{
				id: "1",
				role: "user",
				content: "How do I implement database migrations with Drizzle ORM?",
			},
		],
		expected: "Drizzle migrations involve using drizzle-kit generate command, creating migration files, and running migrations with migrate function",
	},
	{
		input: [
			{
				id: "2",
				role: "user",
				content: "What's the difference between SSR, SSG, and ISR in Next.js?",
			},
		],
		expected: "SSR renders on each request, SSG pre-renders at build time, and ISR regenerates static pages on-demand with fallback",
	},
];
