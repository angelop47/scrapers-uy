import { z } from 'zod';

export interface RssNewsItem {
  title: string;
  link: string;
  pubDate: string;
  contentSnippet: string;
  source: string;
}

export const TimelineEventSchema = z.object({
  title: z.string(),
  date: z.string(), // YYYY-MM-DD
  description: z.string(),
  content: z.string().nullable().optional().transform(val => val || ""),
  tags: z.array(z.string()),
  category_id: z.enum(['business', 'crisis', 'culture', 'economic', 'entertainment', 'infrastructure', 'international', 'law', 'politics', 'social']),
  sources: z.array(z.string()),
  image_url: z.string().nullable().optional()
});

export type TimelineEventBase = z.infer<typeof TimelineEventSchema>;

export interface TimelineEvent extends TimelineEventBase {
  id?: string;
  isEnriched?: boolean;
}
