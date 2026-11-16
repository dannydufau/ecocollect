"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

export default function LogoutButton() {
    const router = useRouter();
    const { signOut } = useAuth();

    async function handleClick() {
        await signOut();
        router.replace("/login");
    }

    return (
        <button onClick={handleClick} className="rounded border px-3 py-1 text-sm">
            Log out
        </button>
    );
}