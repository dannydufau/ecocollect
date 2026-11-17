import RegisterForm from "@/components/register-form";

export default function RegisterPage() {
    return <main className="mx-auto w-full max-w-xl min-w-0 space-y-6 p-4 sm:p-8">
        <h1 className="text-3xl">Create your account</h1>
        <RegisterForm />
    </main>;
}
