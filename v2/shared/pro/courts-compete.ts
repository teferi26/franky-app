import type { ProData } from "./types";
import type {
  ProAmericana,
  ProAmericanaGame,
  ProAmericanaRound,
  ProCourtBlock,
  ProLeague,
  ProLeagueFixture,
  ProLeagueTeam,
  ProPrivateLesson,
  ProSchoolGroup,
} from "./courts-types";
import { addDays, weekdayIndex } from "./format";
import { courtsOps, patchCourts } from "./courts-base";
import type { NewId } from "./courts-ops";

/**
 * Competición y escuela del club: americanas con rotación automática, liga
 * entre facultades, ranking de la temporada, grupos de escuela y horas de
 * cada monitor.
 */

/* ------------------------------------------------------------------ */
/* Americanas                                                          */
/* ------------------------------------------------------------------ */

/**
 * Parejas de cada ronda con el método del círculo: con N jugadores (par) hay
 * N-1 rondas en las que nadie repite compañero. Dentro de cada ronda, las
 * parejas se enfrentan de dos en dos.
 */
export function americanaRounds(
  playerIds: string[],
  resourceIds: string[],
  rounds: number,
): ProAmericanaRound[] {
  const n = playerIds.length;
  if (n < 4 || n % 4 !== 0 || !resourceIds.length) return [];
  const fixed = playerIds[0];
  let ring = playerIds.slice(1);
  const out: ProAmericanaRound[] = [];
  const total = Math.min(rounds, n - 1);
  for (let r = 0; r < total; r++) {
    const circle = [fixed, ...ring];
    const pairs: [string, string][] = [];
    for (let i = 0; i < n / 2; i++) pairs.push([circle[i], circle[n - 1 - i]]);
    const games: ProAmericanaGame[] = [];
    for (let g = 0; g < pairs.length / 2; g++) {
      games.push({
        resourceId: resourceIds[g % resourceIds.length],
        teamA: pairs[g * 2],
        teamB: pairs[g * 2 + 1],
        scoreA: null,
        scoreB: null,
      });
    }
    out.push({ index: r + 1, games });
    // El círculo gira una posición; el primero se queda quieto.
    ring = [ring[ring.length - 1], ...ring.slice(0, -1)];
  }
  return out;
}

/** Minutos que dura una americana y hora a la que acaba. */
export function americanaEnd(a: ProAmericana): number {
  return a.from + a.roundsPlanned * a.roundMinutes;
}

/** Pistas que necesita: una por cada cuatro jugadores. */
export function americanaCourtsNeeded(players: number): number {
  return Math.max(1, Math.floor(players / 4));
}

/**
 * Cierra la inscripción y genera las rondas. Deja las pistas bloqueadas para
 * que nadie las reserve a esa hora.
 */
export function startAmericana(
  data: ProData,
  id: string,
  blockId: string,
): ProData {
  const a = courtsOps(data).americanas.find((x) => x.id === id);
  if (!a) return data;
  const usable = Math.floor(a.players.length / 4) * 4;
  const players = a.players.slice(0, usable);
  const courts = a.resourceIds.slice(0, americanaCourtsNeeded(usable));
  const rounds = americanaRounds(
    players.map((p) => p.id),
    courts,
    a.roundsPlanned,
  );
  const hasBlock = courtsOps(data).blocks.some((b) => b.sourceId === a.id);
  const block: ProCourtBlock = {
    id: blockId,
    resourceIds: courts,
    date: a.date,
    from: a.from,
    to: americanaEnd(a),
    reason: "tournament",
    note: a.name,
    sourceId: a.id,
  };
  return patchCourts(data, (ops) => ({
    americanas: ops.americanas.map((x) =>
      x.id === id
        ? { ...x, status: "playing", rounds, resourceIds: courts }
        : x,
    ),
    blocks: hasBlock
      ? ops.blocks.map((b) =>
          b.sourceId === a.id ? { ...b, resourceIds: courts } : b,
        )
      : [...ops.blocks, block],
  }));
}

export function setAmericanaScore(
  data: ProData,
  input: {
    id: string;
    round: number;
    game: number;
    scoreA: number | null;
    scoreB: number | null;
  },
): ProData {
  return patchCourts(data, (ops) => ({
    americanas: ops.americanas.map((a) =>
      a.id !== input.id
        ? a
        : {
            ...a,
            rounds: a.rounds.map((r) =>
              r.index !== input.round
                ? r
                : {
                    ...r,
                    games: r.games.map((g, i) =>
                      i === input.game
                        ? { ...g, scoreA: input.scoreA, scoreB: input.scoreB }
                        : g,
                    ),
                  },
            ),
          },
    ),
  }));
}

export type AmericanaStanding = {
  playerId: string;
  name: string;
  games: number;
  against: number;
  played: number;
  wins: number;
};

/** Clasificación de la americana: juegos ganados y, a igualdad, diferencia. */
export function americanaStandings(a: ProAmericana): AmericanaStanding[] {
  const map = new Map<string, AmericanaStanding>();
  for (const p of a.players)
    map.set(p.id, {
      playerId: p.id,
      name: p.name,
      games: 0,
      against: 0,
      played: 0,
      wins: 0,
    });
  for (const r of a.rounds) {
    for (const g of r.games) {
      if (g.scoreA === null || g.scoreB === null) continue;
      const sides: [string[], number, number][] = [
        [g.teamA, g.scoreA, g.scoreB],
        [g.teamB, g.scoreB, g.scoreA],
      ];
      for (const [team, own, other] of sides) {
        for (const id of team) {
          const s = map.get(id);
          if (!s) continue;
          s.games += own;
          s.against += other;
          s.played += 1;
          if (own > other) s.wins += 1;
        }
      }
    }
  }
  return [...map.values()].sort(
    (x, y) =>
      y.games - x.games ||
      y.games - y.against - (x.games - x.against) ||
      y.wins - x.wins ||
      x.name.localeCompare(y.name),
  );
}

export function americanaProgress(a: ProAmericana): {
  played: number;
  total: number;
} {
  const games = a.rounds.flatMap((r) => r.games);
  return {
    played: games.filter((g) => g.scoreA !== null && g.scoreB !== null).length,
    total: games.length,
  };
}

/** Texto de la clasificación para compartir por WhatsApp o en la tele. */
export function americanaShareText(a: ProAmericana, club: string): string {
  const table = americanaStandings(a)
    .slice(0, 10)
    .map((s, i) => `${i + 1}. ${s.name}: ${s.games} juegos`)
    .join("\n");
  return `${a.name} en ${club}\n\n${table}\n\nGracias por jugar. Nos vemos en la próxima.`;
}

/* ------------------------------------------------------------------ */
/* Liga entre facultades                                               */
/* ------------------------------------------------------------------ */

/**
 * Calendario de todos contra todos (una vuelta). Con número impar de parejas,
 * una descansa cada jornada. Cada jornada cae una semana después, en las
 * pistas de la liga; si hay más partidos que pistas, siguen a continuación.
 */
export function leagueFixtures(
  teams: ProLeagueTeam[],
  input: {
    startDate: string;
    weekday: number;
    from: number;
    resourceIds: string[];
    slotMinutes?: number;
    newId: NewId;
  },
): ProLeagueFixture[] {
  if (teams.length < 2 || !input.resourceIds.length) return [];
  const ids = teams.map((t) => t.id);
  if (ids.length % 2) ids.push("");
  const n = ids.length;
  let first = input.startDate;
  while (weekdayIndex(first) !== input.weekday) first = addDays(first, 1);
  const slot = input.slotMinutes ?? 90;
  const out: ProLeagueFixture[] = [];
  let ring = ids.slice(1);
  for (let r = 0; r < n - 1; r++) {
    const circle = [ids[0], ...ring];
    const date = addDays(first, r * 7);
    let k = 0;
    for (let i = 0; i < n / 2; i++) {
      const home = circle[i];
      const away = circle[n - 1 - i];
      if (!home || !away) continue;
      out.push({
        id: input.newId("fx"),
        round: r + 1,
        date,
        from: input.from + Math.floor(k / input.resourceIds.length) * slot,
        resourceId: input.resourceIds[k % input.resourceIds.length],
        // Se alterna quién es local para repartir el saque inicial.
        home: r % 2 ? away : home,
        away: r % 2 ? home : away,
        homeSets: null,
        awaySets: null,
      });
      k++;
    }
    ring = [ring[ring.length - 1], ...ring.slice(0, -1)];
  }
  return out;
}

export type LeagueStanding = {
  team: ProLeagueTeam;
  played: number;
  won: number;
  lost: number;
  setsFor: number;
  setsAgainst: number;
  points: number;
};

/** Victoria 3 puntos, derrota 1 (jugar suma). A igualdad, diferencia de sets. */
export function leagueStandings(league: ProLeague): LeagueStanding[] {
  const map = new Map<string, LeagueStanding>(
    league.teams.map((team) => [
      team.id,
      {
        team,
        played: 0,
        won: 0,
        lost: 0,
        setsFor: 0,
        setsAgainst: 0,
        points: 0,
      },
    ]),
  );
  for (const f of league.fixtures) {
    if (f.homeSets === null || f.awaySets === null) continue;
    const home = map.get(f.home);
    const away = map.get(f.away);
    if (!home || !away) continue;
    home.played++;
    away.played++;
    home.setsFor += f.homeSets;
    home.setsAgainst += f.awaySets;
    away.setsFor += f.awaySets;
    away.setsAgainst += f.homeSets;
    const homeWon = f.homeSets > f.awaySets;
    const winner = homeWon ? home : away;
    const loser = homeWon ? away : home;
    winner.won++;
    winner.points += 3;
    loser.lost++;
    loser.points += 1;
  }
  return [...map.values()].sort(
    (a, b) =>
      b.points - a.points ||
      b.setsFor - b.setsAgainst - (a.setsFor - a.setsAgainst) ||
      a.team.name.localeCompare(b.team.name),
  );
}

export function setFixtureResult(
  data: ProData,
  fixtureId: string,
  homeSets: number | null,
  awaySets: number | null,
): ProData {
  return patchCourts(data, (ops) => ({
    league: ops.league
      ? {
          ...ops.league,
          fixtures: ops.league.fixtures.map((f) =>
            f.id === fixtureId ? { ...f, homeSets, awaySets } : f,
          ),
        }
      : null,
  }));
}

/** Bloqueos de las jornadas que aún no se han jugado. */
export function leagueBlocks(
  league: ProLeague,
  fromDate: string,
  newId: NewId,
): ProCourtBlock[] {
  return league.fixtures
    .filter((f) => f.date >= fromDate)
    .map((f) => ({
      id: newId("blk"),
      resourceIds: [f.resourceId],
      date: f.date,
      from: f.from,
      to: f.from + 90,
      reason: "tournament" as const,
      note: `${league.name}, jornada ${f.round}`,
      sourceId: league.id,
    }));
}

export function leagueShareText(league: ProLeague, club: string): string {
  const table = leagueStandings(league)
    .map((s, i) => `${i + 1}. ${s.team.name} (${s.team.faculty}): ${s.points} pts`)
    .join("\n");
  return `Clasificación de la ${league.name} en ${club}\n\n${table}`;
}

/* ------------------------------------------------------------------ */
/* Ranking del club                                                    */
/* ------------------------------------------------------------------ */

export type RankingRow = {
  name: string;
  points: number;
  americanas: number;
  leagueMatches: number;
  level?: number;
};

/** Inicio de la temporada en curso: el 1 de septiembre. */
export function seasonStart(today: string): string {
  const [y, m] = today.split("-").map(Number);
  return `${m >= 9 ? y : y - 1}-09-01`;
}

/**
 * Puntos de la temporada: en cada americana, un punto por juego ganado; en la
 * liga, tres por victoria y uno por partido jugado para cada miembro de la
 * pareja.
 */
export function clubRanking(data: ProData, today: string): RankingRow[] {
  const ops = courtsOps(data);
  const since = seasonStart(today);
  const rows = new Map<string, RankingRow>();
  const row = (name: string) => {
    const key = name.trim();
    const hit = rows.get(key);
    if (hit) return hit;
    const created: RankingRow = {
      name: key,
      points: 0,
      americanas: 0,
      leagueMatches: 0,
    };
    rows.set(key, created);
    return created;
  };
  for (const a of ops.americanas) {
    if (a.date < since || !a.rounds.length) continue;
    for (const s of americanaStandings(a)) {
      if (!s.played) continue;
      const r = row(s.name);
      r.points += s.games;
      r.americanas += 1;
      const player = a.players.find((p) => p.id === s.playerId);
      if (player?.level) r.level = player.level;
    }
  }
  const league = ops.league;
  if (league) {
    for (const f of league.fixtures) {
      if (f.date < since || f.homeSets === null || f.awaySets === null)
        continue;
      const sides: [string, boolean][] = [
        [f.home, f.homeSets > f.awaySets],
        [f.away, f.awaySets > f.homeSets],
      ];
      for (const [teamId, won] of sides) {
        const team = league.teams.find((t) => t.id === teamId);
        if (!team) continue;
        for (const name of team.players) {
          const r = row(name);
          r.points += won ? 3 : 1;
          r.leagueMatches += 1;
        }
      }
    }
  }
  return [...rows.values()].sort(
    (a, b) => b.points - a.points || a.name.localeCompare(b.name),
  );
}

/* ------------------------------------------------------------------ */
/* Escuela y monitores                                                 */
/* ------------------------------------------------------------------ */

/** Fechas de clase de un grupo dentro de un mes (YYYY-MM). */
export function groupDatesInMonth(g: ProSchoolGroup, month: string): string[] {
  const out: string[] = [];
  let d = `${month}-01`;
  while (d.slice(0, 7) === month) {
    if (
      weekdayIndex(d) === g.weekday &&
      d >= g.season.from &&
      d <= g.season.to
    )
      out.push(d);
    d = addDays(d, 1);
  }
  return out;
}

export type CoachMonth = {
  coachId: string;
  groupMinutes: number;
  lessonMinutes: number;
  lessons: number;
  payCents: number;
};

/** Horas de un monitor en el mes (grupos y particulares) y lo que se le paga. */
export function coachMonth(
  data: ProData,
  coachId: string,
  month: string,
): CoachMonth {
  const ops = courtsOps(data);
  const groupMinutes = ops.school
    .filter((g) => g.coachId === coachId)
    .reduce((a, g) => a + groupDatesInMonth(g, month).length * g.duration, 0);
  const lessons = ops.lessons.filter(
    (l) =>
      l.coachId === coachId &&
      l.status !== "cancelled" &&
      l.date.slice(0, 7) === month,
  );
  const lessonMinutes = lessons.reduce((a, l) => a + l.duration, 0);
  const rate = ops.coachRates[coachId] ?? 0;
  return {
    coachId,
    groupMinutes,
    lessonMinutes,
    lessons: lessons.length,
    payCents: Math.round(((groupMinutes + lessonMinutes) / 60) * rate),
  };
}

export function setAttendance(
  data: ProData,
  groupId: string,
  date: string,
  present: string[],
): ProData {
  return patchCourts(data, (ops) => ({
    school: ops.school.map((g) =>
      g.id === groupId
        ? { ...g, attendance: { ...g.attendance, [date]: present } }
        : g,
    ),
  }));
}

export function setFeeStatus(
  data: ProData,
  groupId: string,
  studentId: string,
  feeStatus: "paid" | "pending",
): ProData {
  return patchCourts(data, (ops) => ({
    school: ops.school.map((g) =>
      g.id === groupId
        ? {
            ...g,
            students: g.students.map((s) =>
              s.id === studentId ? { ...s, feeStatus } : s,
            ),
          }
        : g,
    ),
  }));
}

/** Asistencia media de un grupo en las últimas clases (0 a 1). */
export function groupAttendance(g: ProSchoolGroup): number | null {
  const dates = Object.keys(g.attendance).sort().slice(-4);
  if (!dates.length || !g.students.length) return null;
  const present = dates.reduce(
    (a, d) => a + (g.attendance[d]?.length ?? 0),
    0,
  );
  return present / (dates.length * g.students.length);
}

/** Clases particulares de un día, por hora. */
export function lessonsOn(data: ProData, date: string): ProPrivateLesson[] {
  return courtsOps(data)
    .lessons.filter((l) => l.date === date && l.status !== "cancelled")
    .sort((a, b) => a.from - b.from);
}

/** ¿Cae esta fecha dentro del curso del grupo? */
export function groupMeetsOn(g: ProSchoolGroup, date: string): boolean {
  return (
    weekdayIndex(date) === g.weekday &&
    date >= g.season.from &&
    date <= g.season.to
  );
}

/** Próxima fecha de clase de un grupo desde hoy (incluido). */
export function nextGroupDate(g: ProSchoolGroup, today: string): string | null {
  for (let i = 0; i < 7; i++) {
    const d = addDays(today, i);
    if (groupMeetsOn(g, d)) return d;
  }
  return null;
}

