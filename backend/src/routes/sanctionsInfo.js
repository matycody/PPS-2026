const express = require('express');
const prisma = require('../db');
const { authenticate } = require('../middleware/auth');
const { publicName, activeSuspensions, baseWhere, ref } = require('../services/sanctions');

// Sanciones vigentes visibles para cualquier persona con sesión (solo lectura)
const router = express.Router();
router.use(authenticate);

const PROFILE_SEL = { id: true, name: true, nickname: true, showNickname: true, number: true };

router.get('/', async (_req, res) => {
  try {
    const rows = await prisma.playerSuspension.findMany({
      where: baseWhere,
      include: { profile: { select: PROFILE_SEL }, sanction: { include: { match: { select: { id: true, scheduledAt: true, finishedAt: true, createdAt: true, modality: true, branch: true, teamA: { select: { name: true } }, teamB: { select: { name: true } }, tournament: { select: { name: true } } } } } } },
    });
    const state = await activeSuspensions(rows.map((r) => r.profileId));
    const active = rows.filter((r) => state.has(r.profileId));
    const teams = await prisma.playerTeam.findMany({ where: { profileId: { in: active.map((r) => r.profileId) }, to: null }, select: { profileId: true, team: { select: { id: true, name: true } } } });
    const tn = new Map();
    for (const t of teams) tn.set(t.profileId, [...(tn.get(t.profileId) ?? []), t.team.name]);
    const tourIds = [...new Set(active.map((r) => r.tournamentId).filter(Boolean))];
    const tours = tourIds.length ? await prisma.tournament.findMany({ where: { id: { in: tourIds } }, select: { id: true, name: true } }) : [];
    const tourName = new Map(tours.map((t) => [t.id, t.name]));

    const suspensions = active.map((r) => {
      const st = state.get(r.profileId);
      const m = r.sanction?.match;
      return {
        id: r.id,
        player: { name: publicName(r.profile), number: r.profile.number },
        teams: [...new Set(tn.get(r.profileId) ?? [])],
        reason: r.sanction ? r.sanction.reason : r.reason,
        note: r.note,
        remaining: st.remaining,
        sameDayLeft: st.sameDayLeft,
        scope: r.scope,
        modality: ref(r).modality,
        categories: r.categories ?? [],
        origin: m ? { match: (m.teamA?.name ?? '?') + ' vs ' + (m.teamB?.name ?? '?'), tournament: m.tournament?.name ?? null } : { match: null, tournament: tourName.get(r.tournamentId) ?? null },
        createdAt: r.createdAt,
      };
    });

    const pens = await prisma.teamPenalty.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        team: { select: { id: true, name: true } },
        stage: { select: { name: true, tier: true, tournament: { select: { id: true, name: true, edition: true, branch: true, modality: true } } } },
      },
    });
    const teamPenalties = pens.map((r) => ({
      id: r.id, kind: r.kind, points: r.points, missing: r.missing, reason: r.reason, createdAt: r.createdAt,
      team: r.team, stage: { name: r.stage.name, tier: r.stage.tier }, tournament: r.stage.tournament,
    }));

    res.json({ suspensions, teamPenalties });
  } catch (err) {
    console.error('[sanctionsInfo]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

module.exports = router;
