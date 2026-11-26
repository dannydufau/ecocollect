"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";

export default function LogoutButton() {
    const router = useRouter();
    const { signOut } = useAuth();

    async function handleClick() {
        await signOut();
        router.replace("/login");
    }

    return (
        <Button variant="secondary" onClick={handleClick}>Log out</Button>
    );
}