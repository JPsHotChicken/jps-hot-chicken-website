import type { Metadata } from "next";
import Link from "next/link";

import { siteConfig } from "@/data/site";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = {
  title: "Admin sign in",
  robots: { index: false, follow: false },
};

export default function AdminLoginPage() {
  const [brandFirst, ...brandRest] = siteConfig.name.split(" ");

  return (
    <div className="flex flex-1 items-center justify-center bg-muted px-4 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="font-heading text-2xl font-bold tracking-tight">
            <span className="text-brand">{brandFirst}</span> {brandRest.join(" ")}
          </p>
          <h1 className="mt-1 text-sm text-muted-foreground">Staff admin</h1>
        </div>

        <div className="rounded-xl border border-border bg-background p-6 shadow-sm">
          <LoginForm />
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          <Link href="/" className="hover:underline">
            ← Back to the website
          </Link>
        </p>
      </div>
    </div>
  );
}
