import { useState } from "react";
import type { FormEvent } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function SignInForm() {
  const { signIn } = useAuthActions();
  const [flow, setFlow] = useState<"signIn" | "signUp">("signIn");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const formData = new FormData(e.currentTarget);
    formData.set("flow", flow);
    try {
      await signIn("password", formData);
    } catch {
      setError(
        flow === "signIn"
          ? "Couldn't sign in — check your email and password."
          : "Couldn't create an account — that email may already be in use.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-svh items-center justify-center bg-gradient-to-b from-primary/10 via-background to-background p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-violet-500 text-primary-foreground shadow-md">
            <img src="/logo.svg" alt="" className="size-6" width="24" height="24" />
          </div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Block</h1>
          <p className="text-sm text-muted-foreground">
            Your shop should own its block. Drop a link, and the agent maps competitors, finds
            who's worth pitching nearby, and works the leads for you.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{flow === "signIn" ? "Sign in" : "Create an account"}</CardTitle>
            <CardDescription>
              {flow === "signIn"
                ? "Enter your email and password to continue."
                : "Use your email and a password of at least 8 characters."}
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" name="email" autoComplete="email" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  name="password"
                  autoComplete={flow === "signIn" ? "current-password" : "new-password"}
                  minLength={8}
                  required
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting && <Loader2 className="animate-spin" />}
                {submitting ? "Please wait…" : flow === "signIn" ? "Sign in" : "Sign up"}
              </Button>
            </CardContent>
          </form>
          <CardFooter className="justify-center">
            <Button
              variant="link"
              type="button"
              size="sm"
              onClick={() => {
                setFlow(flow === "signIn" ? "signUp" : "signIn");
                setError(null);
              }}
            >
              {flow === "signIn" ? "Need an account? Sign up" : "Already have an account? Sign in"}
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}

export default SignInForm;
