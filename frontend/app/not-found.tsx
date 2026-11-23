import Link from "next/link";
import { RouteFallback } from "@/components/route-fallback";
import { PackageIcon, linkButton } from "@/components/ui";

export default function NotFound() {
    return <RouteFallback title="We could not find that page." icon={<PackageIcon />}
        action={<Link className={linkButton} href="/">Go to EcoCollect</Link>} />;
}
