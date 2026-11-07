import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Mian Nawaz Bricks — Kiln Khatta" },
      { name: "description", content: "Patheer, rehra, nakasi, sales and expense khattas for Mian Nawaz Bricks." },
      { property: "og:title", content: "Mian Nawaz Bricks — Kiln Khatta" },
      { property: "og:description", content: "Brick kiln management for Mian Nawaz Bricks." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    throw redirect({ to: data.user ? "/dashboard" : "/auth" });
  },
});
