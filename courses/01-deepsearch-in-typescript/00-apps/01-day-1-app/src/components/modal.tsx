"use client";

import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect } from "react";

interface ModalProps {
	children: React.ReactNode;
}

export function Modal({ children }: ModalProps) {
	const router = useRouter();

	const handleClose = useCallback(() => {
		router.back();
	}, [router]);

	useEffect(() => {
		const handleEscape = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				handleClose();
			}
		};

		document.addEventListener("keydown", handleEscape);
		return () => document.removeEventListener("keydown", handleEscape);
	}, [handleClose]);

	const handleBackdropClick = (e: React.MouseEvent) => {
		if (e.target === e.currentTarget) {
			handleClose();
		}
	};

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
			onClick={handleBackdropClick}
		>
			<div className="relative w-full max-w-md rounded-lg bg-gray-900 p-6 shadow-xl">
				<button
					onClick={handleClose}
					className="absolute right-4 top-4 rounded-full p-1 text-gray-400 hover:bg-gray-800 hover:text-gray-200"
					aria-label="Close modal"
				>
					<X className="size-5" />
				</button>
				{children}
			</div>
		</div>
	);
}
