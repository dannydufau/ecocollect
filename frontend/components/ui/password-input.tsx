"use client";

import { useState, type InputHTMLAttributes } from "react";
import { EyeIcon, EyeOffIcon } from "./icons";
import { input } from "./styles";

export function PasswordInput({ className = "", ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
    const [shown, setShown] = useState(false);
    return (
        <div className="relative">
            <input {...props} type={shown ? "text" : "password"} className={`${input} pr-12 ${className}`} />
            <button type="button" aria-pressed={shown} aria-label="Show password" onClick={() => setShown(!shown)}
                className="absolute right-0 top-0 inline-flex size-11 items-center justify-center rounded-xl text-text-muted hover:bg-text/10 focus-visible:outline-offset-[-3px]">
                {shown ? <EyeOffIcon className="size-5" /> : <EyeIcon className="size-5" />}
            </button>
        </div>
    );
}
