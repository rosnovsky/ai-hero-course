import { LoginForm } from "~/components/login-form";

export default function LoginPage() {
	return (
		<div className="flex min-h-screen items-center justify-center bg-gray-950">
			<div className="w-full max-w-md space-y-6 rounded-lg bg-gray-900 p-8 shadow-xl">
				<div className="text-center">
					<h1 className="text-3xl font-bold text-gray-100">Sign In</h1>
					<p className="mt-2 text-sm text-gray-300">
						Welcome back! Please sign in to your account.
					</p>
				</div>
				<LoginForm />
			</div>
		</div>
	);
}
