import { useState } from "react";
import { ArrowUpRight, Check, Copy, MapPin } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const CONTACT_LINKS: { label: string; domain: string; href: string }[] = [
  { label: "LinkedIn", domain: "linkedin.com/in/shwetas-dhake", href: "https://www.linkedin.com/in/shwetas-dhake" },
  { label: "Twitter / X", domain: "x.com/shwetasd19", href: "https://x.com/shwetasd19" },
  { label: "GitHub", domain: "github.com/shwetd19", href: "https://github.com/shwetd19" },
  { label: "Project repo", domain: "github.com/shwetd19/Convex-All-Gas", href: "https://github.com/shwetd19/Convex-All-Gas" },
  { label: "Portfolio", domain: "shwetas.dev", href: "https://shwetas.dev/" },
];

const STACK = ["Convex", "Google Places", "Firecrawl", "OpenAI", "AgentMail"];

export function ContactPage() {
  const [copied, setCopied] = useState(false);
  const email = "shwetasdhake16@gmail.com";
  return (
    <div className="space-y-6">
      <PageHeader title="Contact" />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-4 text-center">
            <Avatar className="size-22">
              <AvatarImage src="https://avatars.githubusercontent.com/u/119885670?v=4" alt="Shwetas Dhake" />
              <AvatarFallback>SD</AvatarFallback>
            </Avatar>
            <div className="space-y-1">
              <div className="text-lg font-semibold">Shwetas Dhake</div>
              <div className="text-sm text-muted-foreground">Developer, built Block</div>
              <div className="flex items-center justify-center gap-1 text-sm text-muted-foreground">
                <MapPin className="size-3.5" /> Pune, India
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="font-mono">
                {email}
              </Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  navigator.clipboard?.writeText(email).catch(() => {});
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
              >
                {copied ? <Check /> : <Copy />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <div className="flex flex-wrap justify-center gap-1.5">
              {STACK.map((s) => (
                <Badge key={s} variant="outline">
                  {s}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Links</CardTitle>
          </CardHeader>
          <CardContent className="divide-y">
            {CONTACT_LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                target="_blank"
                rel="noreferrer"
                className="group flex items-center justify-between py-3 text-sm first:pt-0 last:pb-0"
              >
                <span>
                  <span className="font-medium">{l.label}</span>
                  <span className="text-muted-foreground"> · {l.domain}</span>
                </span>
                <ArrowUpRight className="size-4 text-muted-foreground transition-colors group-hover:text-foreground" />
              </a>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
