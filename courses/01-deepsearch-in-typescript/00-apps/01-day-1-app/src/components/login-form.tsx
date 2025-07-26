"use client";

import { signIn } from "next-auth/react";
import { siDiscord } from "simple-icons/icons";

export function LoginForm() {
	return (
		<div className="space-y-6">
			<div className="text-center">
				<h2 className="text-2xl font-bold text-gray-100">Welcome back</h2>
				<p className="mt-2 text-sm text-gray-300">
					Sign in to your account to continue
				</p>
			</div>

			<div className="space-y-4">
				<button
					onClick={() => void signIn("discord")}
					className="flex w-full items-center justify-center gap-3 rounded-lg bg-[#5865F2] px-4 py-3 text-white hover:bg-[#4752C4] focus:outline-none focus:ring-2 focus:ring-[#5865F2] focus:ring-offset-2 transition-colors"
				>
					<svg className="size-5" viewBox="0 0 24 24" fill="currentColor">
						<path d={siDiscord.path} />
					</svg>
					Continue with Discord
				</button>

				<div className="relative">
					<div className="absolute inset-0 flex items-center">
						<div className="w-full border-t border-gray-700" />
					</div>
					<div className="relative flex justify-center text-sm">
						<span className="bg-gray-900 px-2 text-gray-400">
							Secure authentication powered by Discord
						</span>
					</div>
				</div>

				<p className="text-center text-xs text-gray-400">
					By signing in, you agree to our terms of service and privacy policy.
				</p>
			</div>
		</div>
	);
}
