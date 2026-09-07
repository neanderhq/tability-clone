import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { auth, signIn } from "@/lib/auth";

async function signInWithEmail(formData: FormData) {
  "use server";

  const email = formData.get("email");
  const name = formData.get("name");

  try {
    await signIn("credentials", {
      email: typeof email === "string" ? email : "",
      name: typeof name === "string" ? name : "",
      redirectTo: "/dashboard",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      redirect("/auth/signin?error=CredentialsSignin");
    }

    throw error;
  }
}

export default async function SignInPage() {
  const session = await auth();

  if (session?.user) {
    redirect("/dashboard");
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <section className="w-full max-w-md rounded-lg border border-border bg-white p-8 shadow-sm dark:bg-slate-950">
        <div className="mb-8">
          <p className="text-sm font-medium text-primary">Tability Clone</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-normal">
            Sign in to your workspace
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Use an email address to start a local session for the OKR dashboard.
          </p>
        </div>

        <form action={signInWithEmail} className="space-y-4">
          <label className="block">
            <span className="text-sm font-medium">Name</span>
            <input
              className="mt-2 w-full rounded-md border border-border bg-transparent px-3 py-2 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              name="name"
              placeholder="Sourab"
              type="text"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium">Email</span>
            <input
              className="mt-2 w-full rounded-md border border-border bg-transparent px-3 py-2 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              name="email"
              placeholder="you@example.com"
              required
              type="email"
            />
          </label>

          <button
            className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
            type="submit"
          >
            Continue
          </button>
        </form>
      </section>
    </main>
  );
}
