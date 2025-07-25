import type { Message } from "ai";

export const ciData: { input: Message[]; expected: string }[] = [
	{
		input: [
			{
				id: "1",
				role: "user",
				content: "How do I set up Docker containerization for a Next.js app?",
			},
		],
		expected: "Docker containerization for Next.js involves creating a Dockerfile, using multi-stage builds, optimizing for production, and handling environment variables",
	},
	{
		input: [
			{
				id: "2",
				role: "user",
				content: "What are the differences between SWR and React Query for data fetching?",
			},
		],
		expected: "SWR is lightweight and simple, while React Query (TanStack Query) offers more advanced features like mutations, optimistic updates, and complex caching strategies",
	},
];
