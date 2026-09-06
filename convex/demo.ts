import { internalMutation, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { leadTypeValidator } from "./schema";
import type { Infer } from "convex/values";

// The shared, read-only demo workspace shown to every signed-in user (see
// businesses.list + requireBusinessRead). Curated Convex-ecosystem leads so a
// brand-new user lands on a populated Block before adding their own business.
// Nothing here is ever emailed — writes on a demo business are blocked.

type LeadType = Infer<typeof leadTypeValidator>;

type SeedLead = {
  type: LeadType;
  name: string;
  address?: string;
  url?: string;
  contactEmail?: string;
  relevanceNote: string;
  source?: string;
  evidence?: string;
  score: number;
  // A ready draft to review (most leads). Omit for the one already-replied lead.
  draft?: { subject: string; text: string };
  // Set on the single lead that already got a reply — populates the thread view.
  replied?: {
    classification: "interested" | "not_interested" | "needs_info";
    initial: string;
    reply: string;
    replyFrom: string;
  };
};

const LEADS: SeedLead[] = [
  // ---- Customers (companies that could build on Convex) ----
  {
    type: "customer",
    name: "Perplexity",
    address: "San Francisco, CA",
    url: "https://www.perplexity.ai",
    contactEmail: "partnerships@perplexity.ai",
    source: "Wellfound",
    score: 92,
    relevanceNote:
      "Fast-scaling AI answer engine shipping live-updating chat UIs — Convex reactive queries fit their realtime surfaces without custom sync infra.",
    evidence:
      "\"Perplexity is an AI-powered answer engine…\" — careers page lists heavy realtime and infra hiring.",
    replied: {
      classification: "interested",
      initial:
        "Hi Perplexity team,\n\nI lead partnerships at Convex. I saw you're scaling realtime answer surfaces fast. Teams shipping live-updating UIs use Convex to get reactive queries, transactional functions, and scheduling in one type-safe backend — no polling or cache-invalidation glue.\n\nWorth a 20-minute look at how it maps to your stack?\n\n— The Convex team",
      reply:
        "Thanks for reaching out — this is timely. We're re-evaluating parts of our realtime layer this quarter. Can you send a technical overview and some benchmarks? Happy to set up a call with two of our infra engineers next week.",
      replyFrom: "partnerships@perplexity.ai",
    },
  },
  {
    type: "customer",
    name: "Granola",
    address: "San Francisco, CA",
    url: "https://www.granola.ai",
    contactEmail: "hello@granola.ai",
    source: "Y Combinator",
    score: 88,
    relevanceNote:
      "Consumer AI notetaker needing sync across devices + background processing — Convex handles realtime state, storage, and actions with no infra to run.",
    evidence: "YC company profile: AI notepad for meetings, syncing across a user's devices.",
    draft: {
      subject: "Reactive sync + background jobs for Granola, without the infra",
      text:
        "Hi Granola team,\n\nI'm with Convex. An AI notetaker that stays in sync across a user's devices is exactly the shape Convex is built for — reactive queries push updates instantly, and actions/scheduling run your transcription and summarization jobs, all in TypeScript with no servers to manage.\n\nCould I share a short walkthrough tailored to your use case?\n\n— The Convex team",
    },
  },
  {
    type: "customer",
    name: "Cursor (Anysphere)",
    address: "San Francisco, CA",
    url: "https://www.cursor.com",
    contactEmail: "hi@cursor.com",
    source: "Y Combinator",
    score: 85,
    relevanceNote:
      "AI coding startup with heavy realtime collaboration and agent workloads — Convex scheduling + actions map cleanly to background agent runs.",
    evidence: "AI-first code editor; job posts mention realtime collaboration and backend scale.",
    draft: {
      subject: "A type-safe backend for Cursor's realtime + agent workloads",
      text:
        "Hi Cursor team,\n\nConvex here. As you grow realtime collaboration and background agent runs, Convex gives you reactive state, durable scheduling, and transactional functions in one type-safe platform — the kind of glue that's painful to hand-roll.\n\nOpen to a quick technical intro?\n\n— The Convex team",
    },
  },
  {
    type: "customer",
    name: "Linear",
    address: "San Francisco, CA",
    url: "https://linear.app",
    contactEmail: "hello@linear.app",
    source: "Wellfound",
    score: 80,
    relevanceNote:
      "Realtime collaborative product tool — a natural reference customer for reactive sync; could consolidate bespoke sync infrastructure.",
    evidence: "Known for a fast, realtime collaborative UI across issues and projects.",
    draft: {
      subject: "Reactive sync as a platform, not bespoke infra",
      text:
        "Hi Linear team,\n\nConvex here — big admirers of your realtime UX. Convex turns reactive sync into a platform primitive: queries update automatically, mutations are transactional, and it's all end-to-end typed. Curious whether it could simplify parts of your backend.\n\nWorth a short chat?\n\n— The Convex team",
    },
  },

  // ---- Competitors ----
  {
    type: "competitor",
    name: "Firebase",
    address: "Mountain View, CA",
    url: "https://firebase.google.com",
    contactEmail: "partnerships@firebase.google.com",
    score: 78,
    relevanceNote:
      "Google's BaaS and the incumbent for realtime + auth. Convex differentiates on end-to-end type safety and transactional server functions.",
    evidence: "Realtime Database, Firestore, Auth, Cloud Functions — overlaps on most of the stack.",
    draft: {
      subject: "Where Convex fits alongside Firebase",
      text:
        "Hi there,\n\nConvex here. We hear from teams weighing Firebase vs. a fully type-safe, transactional backend. We'd love to compare notes on where developers are hitting limits — always useful to understand the landscape.\n\n— The Convex team",
    },
  },
  {
    type: "competitor",
    name: "Supabase",
    address: "Remote / San Francisco, CA",
    url: "https://supabase.com",
    contactEmail: "partnerships@supabase.com",
    score: 74,
    relevanceNote:
      "Postgres-based open-source BaaS; the strongest OSS competitor. Overlaps on auth, storage, and realtime.",
    evidence: "Open-source Firebase alternative built on Postgres, with auth/storage/realtime.",
    draft: {
      subject: "Comparing notes on the BaaS landscape",
      text:
        "Hi Supabase team,\n\nConvex here. Different architectures, overlapping audience. We're mapping where app developers are choosing reactive/transactional backends vs. Postgres-first ones — open to trading perspectives.\n\n— The Convex team",
    },
  },
  {
    type: "competitor",
    name: "Appwrite",
    address: "Remote",
    url: "https://appwrite.io",
    contactEmail: "partnerships@appwrite.io",
    score: 66,
    relevanceNote:
      "Open-source BaaS competing on self-host + realtime; overlaps on the same indie/startup developer audience.",
    evidence: "Self-hostable backend with databases, auth, storage, and realtime.",
    draft: {
      subject: "The self-host vs. managed reactive backend question",
      text:
        "Hi Appwrite team,\n\nConvex here — we serve an overlapping developer audience with a different bet (managed, reactive, end-to-end typed). Curious how you're seeing the self-host vs. managed trade-off play out.\n\n— The Convex team",
    },
  },

  // ---- Complements (integration / co-marketing partners) ----
  {
    type: "complement",
    name: "Vercel",
    address: "San Francisco, CA",
    url: "https://vercel.com",
    contactEmail: "partnerships@vercel.com",
    score: 90,
    relevanceNote:
      "Frontend cloud where most Convex apps deploy their Next.js frontends — a natural integration and co-marketing partner, not a rival.",
    evidence: "Hosting for Next.js/React frontends; Convex apps commonly ship on Vercel.",
    draft: {
      subject: "Convex + Vercel: better together for full-stack teams",
      text:
        "Hi Vercel team,\n\nConvex here. So many of our users deploy their frontends on Vercel and run their backend on Convex. There's a clean joint story for full-stack teams — worth exploring a template, guide, or co-marketing moment?\n\n— The Convex team",
    },
  },
  {
    type: "complement",
    name: "Clerk",
    address: "San Francisco, CA",
    url: "https://clerk.com",
    contactEmail: "partnerships@clerk.com",
    score: 84,
    relevanceNote:
      "Drop-in auth that pairs with Convex for user management — complementary, with an existing integration path and shared audience.",
    evidence: "Authentication and user management components for React apps.",
    draft: {
      subject: "Deepening the Convex + Clerk integration",
      text:
        "Hi Clerk team,\n\nConvex here. Clerk + Convex is a common pairing for teams that want auth handled and a reactive backend behind it. Interested in tightening the integration story or a joint guide?\n\n— The Convex team",
    },
  },
  {
    type: "complement",
    name: "Resend",
    address: "San Francisco, CA",
    url: "https://resend.com",
    contactEmail: "partnerships@resend.com",
    score: 76,
    relevanceNote:
      "Transactional email API that complements Convex actions — teams wire Resend into Convex to send mail from server functions.",
    evidence: "Developer-first transactional email; a natural companion to backend actions.",
    draft: {
      subject: "Resend inside Convex actions — a clean pattern",
      text:
        "Hi Resend team,\n\nConvex here. Sending email from Convex actions via Resend is a pattern our users love. Could be worth a component, template, or shared example to make it a one-liner.\n\n— The Convex team",
    },
  },

  // ---- Offices (nearby orgs worth pitching) ----
  {
    type: "office",
    name: "OpenAI",
    address: "Mission District, San Francisco, CA",
    url: "https://openai.com",
    contactEmail: "partnerships@openai.com",
    score: 70,
    relevanceNote:
      "Major AI org nearby building many app surfaces — a potential enterprise design partner for reactive product backends.",
    evidence: "Large AI lab and product company headquartered in San Francisco.",
    draft: {
      subject: "Reactive product backends for OpenAI's app surfaces",
      text:
        "Hello,\n\nConvex here — we build the reactive, type-safe backend that a lot of AI product teams use for realtime surfaces and background jobs. If any team is standing up new app experiences, we'd welcome a conversation.\n\n— The Convex team",
    },
  },
  {
    type: "office",
    name: "Notion",
    address: "San Francisco, CA",
    url: "https://www.notion.so",
    contactEmail: "partnerships@makenotion.com",
    score: 62,
    relevanceNote:
      "Product-led SaaS nearby that could adopt a reactive backend for new realtime surfaces or internal tools.",
    evidence: "Collaborative workspace app with realtime editing at scale.",
    draft: {
      subject: "A reactive backend for new Notion surfaces",
      text:
        "Hello Notion team,\n\nConvex here. For new realtime surfaces or internal tools, Convex gives teams reactive sync and transactional functions without standing up infra. Happy to share how other product teams use it.\n\n— The Convex team",
    },
  },

  // ---- Events ----
  {
    type: "event",
    name: "AI Engineer World's Fair",
    address: "San Francisco, CA",
    url: "https://www.ai.engineer",
    contactEmail: "sponsors@ai.engineer",
    score: 82,
    relevanceNote:
      "The largest gathering of AI application builders — a high-fit sponsor/booth opportunity to reach Convex's exact audience.",
    evidence: "Developer conference focused on AI engineering and application builders.",
    draft: {
      subject: "Convex at the AI Engineer World's Fair",
      text:
        "Hi organizers,\n\nConvex here — the reactive backend a lot of AI app builders use. Your audience is squarely ours. Could you share this year's sponsorship and booth options?\n\n— The Convex team",
    },
  },
  {
    type: "event",
    name: "SF Full-Stack & TypeScript Meetup",
    address: "San Francisco, CA",
    url: "https://www.meetup.com",
    contactEmail: "organizers@sffullstack.dev",
    score: 58,
    relevanceNote:
      "Local developer meetup full of TypeScript full-stack builders — a low-cost way to demo reactive backends to the right crowd.",
    evidence: "Recurring SF meetup for full-stack and TypeScript developers.",
    draft: {
      subject: "A talk on reactive TypeScript backends?",
      text:
        "Hi organizers,\n\nConvex here. We'd love to give a talk (or sponsor pizza) at an upcoming meetup — a live demo of a reactive, end-to-end typed backend usually lands well with this crowd. What's the process?\n\n— The Convex team",
    },
  },
];

const DAY_MS = 24 * 60 * 60 * 1000;

async function wipeExistingDemo(ctx: MutationCtx) {
  const existing = await ctx.db
    .query("businesses")
    .withIndex("by_isDemo", (q) => q.eq("isDemo", true))
    .collect();
  for (const biz of existing) {
    const leads = await ctx.db
      .query("leads")
      .withIndex("by_businessId", (q) => q.eq("businessId", biz._id))
      .collect();
    for (const lead of leads) await ctx.db.delete(lead._id);
    const outreach = await ctx.db
      .query("outreach")
      .withIndex("by_businessId", (q) => q.eq("businessId", biz._id))
      .collect();
    for (const o of outreach) {
      const messages = await ctx.db
        .query("messages")
        .withIndex("by_outreachId", (q) => q.eq("outreachId", o._id))
        .collect();
      for (const m of messages) await ctx.db.delete(m._id);
      await ctx.db.delete(o._id);
    }
    const activity = await ctx.db
      .query("activity")
      .withIndex("by_businessId", (q) => q.eq("businessId", biz._id))
      .collect();
    for (const a of activity) await ctx.db.delete(a._id);
    await ctx.db.delete(biz._id);
  }
}

// Create (or refresh) the single shared demo business. Idempotent — safe to
// re-run; it wipes any prior demo first. Owner defaults to the first user.
export const seedDemo = internalMutation({
  args: { ownerUserId: v.optional(v.id("users")) },
  handler: async (ctx, { ownerUserId }) => {
    await wipeExistingDemo(ctx);

    let owner = ownerUserId ?? null;
    if (!owner) {
      const firstUser = await ctx.db.query("users").first();
      if (!firstUser) throw new Error("No users yet — sign up once, then seed the demo.");
      owner = firstUser._id;
    }

    const now = Date.now();
    const businessId = await ctx.db.insert("businesses", {
      userId: owner,
      url: "https://convex.dev/",
      name: "Convex",
      description:
        "Convex is the reactive backend-as-a-service for full-stack app developers — a TypeScript database, server functions, real-time sync, scheduling, file storage, and auth in one type-safe platform.",
      offerings: [
        "Reactive database",
        "Serverless functions",
        "Real-time sync",
        "Cron & scheduling",
        "File storage",
        "Auth",
        "Vector search",
      ],
      category: "Backend platform for app developers",
      address: "San Francisco, CA",
      lat: 37.7749,
      lng: -122.4194,
      domain: "Developer tools / backend-as-a-service",
      teamSize: "50-100",
      foundedYear: "2021",
      notes:
        "Sample workspace. This is a demo of how Block maps a business's local competitors, customers, complements, offices, and events, then drafts outreach for each.",
      status: "ready",
      approvalMode: "approve_each",
      followUpDelayDays: 2,
      weeklyRescan: true,
      autoReply: false,
      isDemo: true,
      scrapedAt: now,
      lastScanAt: now,
    });

    await ctx.db.insert("activity", {
      businessId,
      kind: "system",
      message: "Demo workspace ready — this is a sample so you can explore Block.",
    });

    let repliedName = "";
    for (const seed of LEADS) {
      const status = seed.replied ? "replied" : "sourced";
      const leadId: Id<"leads"> = await ctx.db.insert("leads", {
        businessId,
        type: seed.type,
        name: seed.name,
        address: seed.address,
        url: seed.url,
        contactEmail: seed.contactEmail,
        relevanceNote: seed.relevanceNote,
        source: seed.source,
        evidence: seed.evidence,
        score: seed.score,
        status,
      });
      await ctx.db.insert("activity", {
        businessId,
        leadId,
        kind: "sourcing",
        message: `Sourced ${seed.name} (${seed.type}) — ${seed.relevanceNote}`,
      });

      if (seed.replied) {
        repliedName = seed.name;
        const sentAt = now - 3 * DAY_MS;
        const replyAt = now - 2 * DAY_MS;
        const outreachId = await ctx.db.insert("outreach", {
          leadId,
          businessId,
          subject: "Reactive sync + realtime for your product",
          draftText: seed.replied.initial,
          draftStatus: "ready",
          agentmailThreadId: `demo-thread-${leadId}`,
          agentmailMessageId: `demo-msg-${leadId}`,
          sentAt,
          lastReplyAt: replyAt,
          replyClassification: seed.replied.classification,
        });
        await ctx.db.insert("messages", {
          outreachId,
          businessId,
          direction: "outbound",
          kind: "initial",
          subject: "Reactive sync + realtime for your product",
          text: seed.replied.initial,
          sentAt,
        });
        await ctx.db.insert("messages", {
          outreachId,
          businessId,
          direction: "inbound",
          kind: "reply",
          text: seed.replied.reply,
          from: seed.replied.replyFrom,
          classification: seed.replied.classification,
          sentAt: replyAt,
        });
        await ctx.db.insert("activity", {
          businessId,
          leadId,
          kind: "sent",
          message: `Outreach sent to ${seed.name} (${seed.contactEmail})`,
        });
        await ctx.db.insert("activity", {
          businessId,
          leadId,
          kind: "reply",
          message: `Reply from ${seed.name} — classified: interested`,
        });
      } else if (seed.draft) {
        await ctx.db.insert("outreach", {
          leadId,
          businessId,
          subject: seed.draft.subject,
          draftText: seed.draft.text,
          draftStatus: "ready",
        });
        await ctx.db.insert("activity", {
          businessId,
          leadId,
          kind: "draft",
          message: `Draft ready for ${seed.name}`,
        });
      }
    }

    return { businessId, leads: LEADS.length, repliedLead: repliedName };
  },
});
