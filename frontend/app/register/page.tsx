import Link from "next/link";
import RegisterForm from "@/components/register-form";

export default function RegisterPage() {
    return <main className="mx-auto w-full max-w-xl min-w-0 space-y-6 p-4 sm:p-8">
        <h1 className="text-3xl">Create your account</h1>
        <RegisterForm />
        <p>Already have an account? <Link href="/login" className="inline-flex min-h-11 items-center text-accent-700 underline underline-offset-4">Sign in</Link></p>
    </main>;
}
