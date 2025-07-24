import type { Message } from "ai";
import { evalite } from "evalite";
import { askDeepSearch } from "~/deep-search";

evalite("Deep Search Eval", {
	data: async (): Promise<{ input: Message[] }[]> => {
		return [
			{
				input: [
					{
						id: "1",
						role: "user",
						content: "What is the latest version of TypeScript?",
					},
				],
			},
			{
				input: [
					{
						id: "2",
						role: "user",
						content: "What are the main features of Next.js 14?",
					},
				],
			},
			{
				input: [
					{
						id: "3",
						role: "user",
						content: "How do I install React?",
					},
				],
			},
			{
				input: [
					{
						id: "4",
						role: "user",
						content: "What are the best practices for API design?",
					},
				],
			},
			{
				input: [
					{
						id: "5",
						role: "user",
						content: "Explain what is machine learning",
					},
				],
			},
		];
	},
	task: async (input) => {
		return askDeepSearch(input);
	},
	scorers: [
		{
			name: "Contains Links",
			description: "Checks if the output contains any markdown links.",
			scorer: ({ output }) => {
				// Check for markdown link syntax: [text](url)
				const markdownLinkRegex = /\[.*?\]\(.*?\)/;
				const containsLinks = markdownLinkRegex.test(output);

				return containsLinks ? 1 : 0;
			},
		},
	],
});
