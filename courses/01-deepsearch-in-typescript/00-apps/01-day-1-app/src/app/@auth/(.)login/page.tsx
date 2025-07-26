import { LoginForm } from "~/components/login-form";
import { Modal } from "~/components/modal";

export default function InterceptedLoginPage() {
	return (
		<Modal>
			<LoginForm />
		</Modal>
	);
}
