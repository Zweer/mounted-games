import { relations } from "drizzle-orm";
import { user } from "./models/auth";
import { category, competition, heat, phase } from "./models/competition";
import { contribution } from "./models/crowdsource";
import { scrapeTarget } from "./models/ingestion";
import {
  athlete,
  horse,
  participant,
  participantMember,
  team,
} from "./models/participant";
import { game, gameAlias, nation, venue } from "./models/reference";
import { gameResult, result } from "./models/result";

/**
 * Centralized Drizzle relation graph. Kept in one file (not colocated per model)
 * because relations are bidirectional and cross-domain, which would create ESM
 * module cycles if split. Foreign keys themselves stay on the table definitions.
 */

// --- Reference -----------------------------------------------------------
export const nationRelations = relations(nation, ({ many }) => ({
  athletes: many(athlete),
  teams: many(team),
  competitions: many(competition),
  venues: many(venue),
}));

export const venueRelations = relations(venue, ({ one, many }) => ({
  nation: one(nation, { fields: [venue.nationId], references: [nation.id] }),
  competitions: many(competition),
}));

export const gameRelations = relations(game, ({ many }) => ({
  aliases: many(gameAlias),
  gameResults: many(gameResult),
}));

export const gameAliasRelations = relations(gameAlias, ({ one }) => ({
  game: one(game, { fields: [gameAlias.gameId], references: [game.id] }),
}));

// --- Competition hierarchy ----------------------------------------------
export const competitionRelations = relations(competition, ({ one, many }) => ({
  nation: one(nation, {
    fields: [competition.nationId],
    references: [nation.id],
  }),
  venue: one(venue, { fields: [competition.venueId], references: [venue.id] }),
  categories: many(category),
}));

export const categoryRelations = relations(category, ({ one, many }) => ({
  competition: one(competition, {
    fields: [category.competitionId],
    references: [competition.id],
  }),
  phases: many(phase),
  participants: many(participant),
  scrapeTargets: many(scrapeTarget),
}));

export const phaseRelations = relations(phase, ({ one, many }) => ({
  category: one(category, {
    fields: [phase.categoryId],
    references: [category.id],
  }),
  heats: many(heat),
  results: many(result),
}));

export const heatRelations = relations(heat, ({ one, many }) => ({
  phase: one(phase, { fields: [heat.phaseId], references: [phase.id] }),
  results: many(result),
}));

// --- Participants & identity --------------------------------------------
export const teamRelations = relations(team, ({ one, many }) => ({
  nation: one(nation, { fields: [team.nationId], references: [nation.id] }),
  participants: many(participant),
}));

export const athleteRelations = relations(athlete, ({ one, many }) => ({
  nation: one(nation, { fields: [athlete.nationId], references: [nation.id] }),
  memberships: many(participantMember),
}));

export const horseRelations = relations(horse, ({ many }) => ({
  memberships: many(participantMember),
}));

export const participantRelations = relations(participant, ({ one, many }) => ({
  category: one(category, {
    fields: [participant.categoryId],
    references: [category.id],
  }),
  team: one(team, { fields: [participant.teamId], references: [team.id] }),
  athlete: one(athlete, {
    fields: [participant.athleteId],
    references: [athlete.id],
  }),
  nation: one(nation, {
    fields: [participant.nationId],
    references: [nation.id],
  }),
  members: many(participantMember),
  results: many(result),
}));

export const participantMemberRelations = relations(
  participantMember,
  ({ one }) => ({
    participant: one(participant, {
      fields: [participantMember.participantId],
      references: [participant.id],
    }),
    athlete: one(athlete, {
      fields: [participantMember.athleteId],
      references: [athlete.id],
    }),
    horse: one(horse, {
      fields: [participantMember.horseId],
      references: [horse.id],
    }),
  }),
);

// --- Results -------------------------------------------------------------
export const resultRelations = relations(result, ({ one, many }) => ({
  participant: one(participant, {
    fields: [result.participantId],
    references: [participant.id],
  }),
  phase: one(phase, { fields: [result.phaseId], references: [phase.id] }),
  heat: one(heat, { fields: [result.heatId], references: [heat.id] }),
  gameResults: many(gameResult),
}));

export const gameResultRelations = relations(gameResult, ({ one }) => ({
  result: one(result, {
    fields: [gameResult.resultId],
    references: [result.id],
  }),
  game: one(game, { fields: [gameResult.gameId], references: [game.id] }),
}));

// --- Ingestion & crowdsourcing ------------------------------------------
export const scrapeTargetRelations = relations(scrapeTarget, ({ one }) => ({
  category: one(category, {
    fields: [scrapeTarget.categoryId],
    references: [category.id],
  }),
}));

export const contributionRelations = relations(contribution, ({ one }) => ({
  author: one(user, { fields: [contribution.userId], references: [user.id] }),
  reviewer: one(user, {
    fields: [contribution.reviewedBy],
    references: [user.id],
  }),
}));
