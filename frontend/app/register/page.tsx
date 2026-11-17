import Image from "next/image";
import RegisterForm from "@/components/register-form";

export default function RegisterPage() {
    return <main className="mx-auto w-full max-w-xl min-w-0 space-y-6 p-4 sm:p-8">
        <Image src="/ecocollect-mark.png" alt="" width={61} height={64} priority />
        <h1 className="text-[length:clamp(30px,5vw,40px)]">Create your account</h1>
        <RegisterForm />
    </main>;
}
