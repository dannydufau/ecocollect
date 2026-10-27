"use client";

import { useRouter } from "next/navigation";
import { logout } from "@/lib/auth";

export default function LogoutButton() {
    const router = useRouter();

    async function handleClick() {
        await logout();
        router.replace("/login");
    }

    return (
        <button onClick={handleClick} className="rounded border px-3 py-1 text-sm">
            Log out
        </button>
    );
}