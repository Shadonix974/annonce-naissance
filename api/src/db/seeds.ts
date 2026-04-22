import { randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import pino from "pino";
import { env } from "../env.js";
import { db, pool } from "./client.js";
import { gifts, settings, timelineEvents, tweaks } from "./schema.js";

const log = pino({ level: env.LOG_LEVEL });

const TWEAKS_SEED: Record<string, string> = {
  // Bébé
  babyName: "Léonard",
  babyMiddle: "Augustin",
  dateLong: "14 avril 2026",
  dateShort: "14.04.2026",
  timeBirth: "04h27",
  weight: "3,42",
  height: "51",
  city: "Paris",
  // Famille
  father: "Julien",
  mother: "Camille",
  paternalGP: "Pierre & Hélène",
  maternalGP: "Antoine & Marie",
  // Mot des parents (scène 04) — multi-ligne autorisé
  parentsNote:
    "Nous t'attendions depuis si longtemps, et tu es arrivé au petit matin, doucement, comme tu sembles vouloir traverser la vie. Nos cœurs n'ont jamais été aussi pleins. Bienvenue, mon amour. Le monde a de la chance de t'accueillir.",
  // Maternité + adresse (scènes 02 et 09)
  maternity: "Maternité des Lilas",
  addressLine: "14 rue du Coq-Français, 93260 Les Lilas",
  roomNumber: "Chambre 214, 3ᵉ étage",
  // Infos pratiques (scène 09)
  visitHours: "14h — 19h, tous les jours",
  visitNote: "Merci de nous prévenir par message un peu avant de venir.",
  returnDate: "Samedi 18 avril",
  returnNote: "À partir de là, les visites se font sur rendez-vous, le temps de trouver nos marques.",
  phone: "06 12 34 56 78",
  phoneNote: "Camille & Julien — sms de préférence, les journées sont encore brouillons.",
  // Accent (couleur)
  accent: "gold",
};

const GIFTS_SEED = [
  { name: "Doudou en lin",           rangeText: "25–40 €", position: 0 },
  { name: "Mobile musical en bois",  rangeText: "60–80 €", position: 1 },
  { name: "Gigoteuse coton bio",     rangeText: "45 €",    position: 2 },
  { name: "Livre d'éveil tissu",     rangeText: "18 €",    position: 3 },
  { name: "Chaussons en cuir souple", rangeText: "32 €",   position: 4 },
  { name: "Tapis d'éveil en laine",  rangeText: "90 €",    position: 5 },
];

const TIMELINE_SEED = [
  { dateLabel: "Août 2025",   text: "Le test positif — l'incroyable nouvelle partagée à deux.", position: 0, isNow: false },
  { dateLabel: "Oct 2025",    text: "Première échographie. Un petit cœur, déjà fort.",          position: 1, isNow: false },
  { dateLabel: "Janv 2026",   text: "On apprend que c'est un garçon. Le prénom s'impose.",       position: 2, isNow: false },
  { dateLabel: "Mars 2026",   text: "La chambre est prête. Les valises aussi. On attend.",       position: 3, isNow: false },
  { dateLabel: "14 avril 2026", text: "Léonard ouvre les yeux. Notre vie commence à trois.",     position: 4, isNow: true },
];

export async function runSeeds(): Promise<void> {
  await db.transaction(async (tx) => {
    const existingSettings = await tx.select().from(settings).limit(1);
    if (existingSettings.length === 0) {
      const token = randomBytes(18).toString("base64url");
      const printToken = randomBytes(18).toString("base64url");
      await tx.insert(settings).values({ id: 1, accessToken: token, printAccessToken: printToken });
      log.info({ token, printToken }, "🔑 Access tokens generated — régénérables depuis /admin");
    } else if (!existingSettings[0]?.printAccessToken) {
      // Existing deploy without a print token yet — backfill once.
      const printToken = randomBytes(18).toString("base64url");
      await tx.update(settings).set({ printAccessToken: printToken }).where(sql`${settings.id} = 1`);
      log.info({ printToken }, "🔑 Print access token backfilled");
    }

    // Tweaks: add any key that's missing (idempotent). We never overwrite an
    // existing value — admins can edit them via /admin and those edits persist
    // across API restarts. Old deployments that already seeded the original 14
    // keys will only gain the newer ones (parentsNote, addressLine, …).
    await tx
      .insert(tweaks)
      .values(Object.entries(TWEAKS_SEED).map(([key, value]) => ({ key, value })))
      .onConflictDoNothing({ target: tweaks.key });

    const giftsCount = await tx.execute(sql`SELECT count(*)::int AS c FROM gifts`);
    if (Number((giftsCount.rows[0] as { c: number } | undefined)?.c ?? 0) === 0) {
      await tx.insert(gifts).values(GIFTS_SEED);
    }

    const timelineCount = await tx.execute(sql`SELECT count(*)::int AS c FROM timeline_events`);
    if (Number((timelineCount.rows[0] as { c: number } | undefined)?.c ?? 0) === 0) {
      await tx.insert(timelineEvents).values(TIMELINE_SEED);
    }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runSeeds()
    .then(() => pool.end())
    .catch((e) => {
      // eslint-disable-next-line no-console
      console.error(e);
      process.exit(1);
    });
}
