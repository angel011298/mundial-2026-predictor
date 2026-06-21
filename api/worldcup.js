/**
 * api/worldcup.js — Vercel Edge Function
 * ─────────────────────────────────────────────────────────────────
 * Proxy hacia el repositorio rezarahiminia/worldcup2026 en GitHub.
 * Devuelve los 104 fixtures + metadatos de equipos.
 * Sin clave. Cache: 6 horas (datos estáticos del calendario).
 */
export const config = { runtime: 'edge' };

const REPO  = 'https://raw.githubusercontent.com/rezarahiminia/worldcup2026/main';
const TIMEOUT = 7000;

async function safeFetch(url) {
  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(tid);
    return res.ok ? res.json() : null;
  } catch {
    clearTimeout(tid);
    return null;
  }
}

/** Normaliza el status del repo a nuestros valores canónicos */
function normalizeStatus(raw = '') {
  const s = String(raw).toLowerCase();
  if (s.includes('live') || s.includes('progress') || s.includes('1h') || s.includes('2h')) return 'live';
  if (s.includes('fin') || s.includes('ft')  || s.includes('full')) return 'finished';
  return 'upcoming';
}

/** Normaliza la fase/etapa a nuestro Stage canónico */
function normalizeStage(raw = '') {
  const s = String(raw).toLowerCase();
  if (s.includes('group'))           return 'group';
  if (s.includes('32') || s.includes('round of 32')) return 'r32';
  if (s.includes('16') || s.includes('round of 16')) return 'r16';
  if (s.includes('quarter'))         return 'qf';
  if (s.includes('semi'))            return 'sf';
  if (s.includes('third'))           return 'third';
  if (s.includes('final'))           return 'final';
  return 'group';
}

export default async function handler() {
  const now = new Date();

  // Intentamos fetch en paralelo de los dos archivos que necesitamos
  const [rawMatches, rawTeams] = await Promise.all([
    safeFetch(`${REPO}/football.matches.json`),
    safeFetch(`${REPO}/football.teams.json`),
  ]);

  if (!rawMatches || !rawTeams) {
    return new Response(
      JSON.stringify({ ok: false, matches: [], teams: [], timestamp: now.toISOString(), source: 'rezarahiminia' }),
      { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, s-maxage=300' } }
    );
  }

  // Build de lookup id → team
  const teamById = {};
  const teamsArr = Array.isArray(rawTeams) ? rawTeams : (rawTeams.teams ?? Object.values(rawTeams));
  for (const t of teamsArr) {
    const id = t.id ?? t.teamId ?? t.team_id;
    if (id != null) teamById[String(id)] = t;
  }

  const matchesArr = Array.isArray(rawMatches)
    ? rawMatches
    : (rawMatches.matches ?? rawMatches.games ?? Object.values(rawMatches));

  const matches = matchesArr.map((m, i) => {
    const homeId   = String(m.homeTeamId ?? m.home_team_id ?? m.home_id ?? '');
    const awayId   = String(m.awayTeamId ?? m.away_team_id ?? m.away_id ?? '');
    const homeTeam = teamById[homeId] ?? {};
    const awayTeam = teamById[awayId] ?? {};

    const homeName = m.homeName ?? m.home_name
      ?? homeTeam?.name?.en ?? homeTeam?.name ?? '';
    const awayName = m.awayName ?? m.away_name
      ?? awayTeam?.name?.en ?? awayTeam?.name ?? '';
    const homeCode = m.homeCode ?? homeTeam?.code ?? homeTeam?.fifa_code
      ?? homeName.slice(0, 3).toUpperCase();
    const awayCode = m.awayCode ?? awayTeam?.code ?? awayTeam?.fifa_code
      ?? awayName.slice(0, 3).toUpperCase();

    const group    = m.group ?? m.groupName ?? m.group_id ?? null;
    const matchday = m.matchday ?? m.round ?? m.gameday ?? null;
    const stage    = normalizeStage(m.stage ?? m.round_type ?? m.type ?? '');
    const status   = normalizeStatus(m.status ?? m.state ?? '');

    // Fecha: acepta varios formatos
    const rawDate  = m.date ?? m.datetime ?? m.kickoff ?? m.start_time ?? null;
    const kickoff  = rawDate ? new Date(rawDate).toISOString() : null;

    const homeScore = m.homeScore ?? m.home_score ?? m.homeGoals ?? null;
    const awayScore = m.awayScore ?? m.away_score ?? m.awayGoals ?? null;

    const venue = m.stadium ?? m.venue ?? m.stadiumName
      ? { id: String(m.stadiumId ?? m.stadium_id ?? ''), name: m.stadium ?? m.stadiumName ?? m.venue ?? '', city: m.city ?? '', country: '' }
      : null;

    return {
      id: String(m.id ?? m.matchId ?? m.match_id ?? `rz-${i}`),
      stage,
      group: group ? String(group).toUpperCase() : null,
      matchday: matchday != null ? Number(matchday) : null,
      status,
      kickoff,
      venue,
      home: { code: homeCode, name: homeName, score: homeScore != null ? Number(homeScore) : null },
      away: { code: awayCode, name: awayName, score: awayScore != null ? Number(awayScore) : null },
    };
  });

  // Teams normalizados: { code, name_en, flag_url }
  const teams = teamsArr.map((t) => ({
    code:     t.code ?? t.fifa_code ?? '',
    nameEn:   t.name?.en ?? t.name ?? t.nameEn ?? '',
    flagUrl:  t.flag ?? t.flag_url ?? t.flagUrl ?? '',
    group:    t.group ?? t.groupId ?? null,
  }));

  return new Response(
    JSON.stringify({ ok: true, matches, teams, timestamp: now.toISOString(), source: 'rezarahiminia' }),
    { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, s-maxage=21600, stale-while-revalidate=3600' } }
  );
}
