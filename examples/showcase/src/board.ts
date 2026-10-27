// The sample data every panel works on: a small task board held in memory.
// Restarting the server, or calling reset_board, brings back the seed cards.

export const STATUSES = ["todo", "doing", "done"] as const;
export const TAGS = ["design", "writing", "ops"] as const;
export const SORT_KEYS = ["title", "status", "tag", "points", "created"] as const;

export type Status = (typeof STATUSES)[number];
export type Tag = (typeof TAGS)[number];
export type SortKey = (typeof SORT_KEYS)[number];

export interface Card {
  id: string;
  title: string;
  status: Status;
  tag: Tag;
  points: number;
  created: number;
}

export interface ListOptions {
  status?: Status;
  tag?: Tag;
  sort?: SortKey;
  direction?: "asc" | "desc";
  offset?: number;
  limit?: number;
}

export interface Stats {
  total: number;
  points: number;
  byStatus: Record<Status, { cards: number; points: number }>;
  byTag: Record<Tag, { cards: number; points: number }>;
}

/** Invented cards. `created` is an order number, not a date, so the seed reads the same everywhere. */
const SEED: ReadonlyArray<Omit<Card, "id" | "created">> = [
  { title: "Sketch the welcome screen", status: "done", tag: "design", points: 3 },
  { title: "Pick an icon set", status: "done", tag: "design", points: 1 },
  { title: "Write the getting-started page", status: "doing", tag: "writing", points: 5 },
  { title: "Set up the nightly backup", status: "doing", tag: "ops", points: 3 },
  { title: "Draft the release note", status: "todo", tag: "writing", points: 2 },
  { title: "Choose colors for dark mode", status: "todo", tag: "design", points: 2 },
  { title: "Rotate the sample log files", status: "todo", tag: "ops", points: 1 },
  { title: "Proofread the FAQ", status: "todo", tag: "writing", points: 1 },
];

export interface Board {
  list(options?: ListOptions): { cards: Card[]; total: number; offset: number };
  get(id: string): Card | undefined;
  add(input: { title: string; tag?: Tag; points?: number }): Card;
  move(id: string, status: Status): Card;
  stats(): Stats;
  reset(): void;
  /** Called after every write. Returns a function that stops listening. */
  onChange(listener: () => void): () => void;
}

const compare: Record<SortKey, (a: Card, b: Card) => number> = {
  title: (a, b) => a.title.localeCompare(b.title),
  status: (a, b) => STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status),
  tag: (a, b) => a.tag.localeCompare(b.tag),
  points: (a, b) => a.points - b.points,
  created: (a, b) => a.created - b.created,
};

function emptyTotals<K extends string>(
  keys: readonly K[],
): Record<K, { cards: number; points: number }> {
  return Object.fromEntries(keys.map((k) => [k, { cards: 0, points: 0 }])) as Record<
    K,
    { cards: number; points: number }
  >;
}

export function createBoard(): Board {
  let cards: Card[] = [];
  let counter = 0;
  const listeners = new Set<() => void>();
  const changed = () => {
    for (const listener of listeners) listener();
  };

  const seed = () => {
    counter = 0;
    cards = SEED.map((card) => {
      counter += 1;
      return { ...card, id: `c${counter}`, created: counter };
    });
  };
  seed();

  return {
    list({ status, tag, sort = "created", direction = "asc", offset = 0, limit = 50 } = {}) {
      const matching = cards.filter(
        (card) => (!status || card.status === status) && (!tag || card.tag === tag),
      );
      const sign = direction === "desc" ? -1 : 1;
      matching.sort((a, b) => sign * compare[sort](a, b) || a.created - b.created);
      return { cards: matching.slice(offset, offset + limit), total: matching.length, offset };
    },

    get(id) {
      return cards.find((card) => card.id === id);
    },

    add({ title, tag = "writing", points = 1 }) {
      const trimmed = title.trim();
      if (!trimmed) throw new Error("A card needs a title.");
      counter += 1;
      const card: Card = {
        id: `c${counter}`,
        title: trimmed,
        status: "todo",
        tag,
        points,
        created: counter,
      };
      cards.push(card);
      changed();
      return card;
    },

    move(id, status) {
      const card = cards.find((c) => c.id === id);
      if (!card) throw new Error(`No card with id ${id}. Call list_cards to see the ids.`);
      card.status = status;
      changed();
      return card;
    },

    stats() {
      const byStatus = emptyTotals(STATUSES);
      const byTag = emptyTotals(TAGS);
      for (const card of cards) {
        byStatus[card.status].cards += 1;
        byStatus[card.status].points += card.points;
        byTag[card.tag].cards += 1;
        byTag[card.tag].points += card.points;
      }
      const points = cards.reduce((sum, card) => sum + card.points, 0);
      return { total: cards.length, points, byStatus, byTag };
    },

    reset() {
      seed();
      changed();
    },

    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
