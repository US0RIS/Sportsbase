const SPORTS_CATALOG = [
  {
    id: 'nba',
    name: 'NBA Basketball',
    description: 'Daily NBA matchups and playoff scoreboards.',
    teamsUrl: 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams',
    scoreboardUrl: 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard',
  },
  {
    id: 'nfl',
    name: 'NFL Football',
    description: 'Full NFL slate, including preseason, regular season, and playoffs.',
    teamsUrl: 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams',
    scoreboardUrl: 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard',
  },
  {
    id: 'mlb',
    name: 'MLB Baseball',
    description: 'Live MLB linescores and finals straight from the ballpark.',
    teamsUrl: 'https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/teams',
    scoreboardUrl: 'https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard',
  },
  {
    id: 'nhl',
    name: 'NHL Hockey',
    description: 'Track every NHL faceoff, including overtime and shootout finishes.',
    teamsUrl: 'https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/teams',
    scoreboardUrl: 'https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard',
  },
  {
    id: 'mls',
    name: 'MLS Soccer',
    description: 'Major League Soccer fixtures and live match commentary.',
    teamsUrl: 'https://site.api.espn.com/apis/site/v2/sports/soccer/usa.1/teams',
    scoreboardUrl: 'https://site.api.espn.com/apis/site/v2/sports/soccer/usa.1/scoreboard',
  },
];

const MAX_SPORTS = 5;
const MIN_SPORTS = 1;
const MAX_TEAMS_PER_SPORT = 5;
const MIN_TEAMS_PER_SPORT = 1;
const REFRESH_INTERVAL_MS = 60_000;

const sportsForm = document.querySelector('#sports-form');
const sportsOptionsContainer = document.querySelector('#sports-options');
const teamsStep = document.querySelector('#teams-step');
const teamsForm = document.querySelector('#teams-form');
const teamsSelectionsContainer = document.querySelector('#teams-selections');
const setupView = document.querySelector('#setup-view');
const dashboardView = document.querySelector('#dashboard-view');
const scoreboardContainer = document.querySelector('#scoreboard');
const setupFeedback = document.querySelector('#setup-feedback');
const dashboardFeedback = document.querySelector('#dashboard-feedback');
const refreshButton = document.querySelector('#refresh-dashboard');
const editPreferencesButton = document.querySelector('#edit-preferences');
const backButton = document.querySelector('#back-to-sports');
const lastUpdatedElement = document.querySelector('#last-updated');

const teamTemplate = document.querySelector('#team-template');
const eventTemplate = document.querySelector('#event-template');

let selectedSports = [];
let selectedTeamsBySport = {};
let teamCache = new Map();
let refreshTimerId;
let isRefreshing = false;

init();

function init() {
  renderSportsOptions();
  hydratePreferences({ autoLaunch: true });

  sportsForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const checkedSports = Array.from(
      sportsOptionsContainer.querySelectorAll('input[type="checkbox"]:checked')
    ).map((input) => input.value);

    if (checkedSports.length < MIN_SPORTS || checkedSports.length > MAX_SPORTS) {
      showSetupMessage(
        `Please choose between ${MIN_SPORTS} and ${MAX_SPORTS} sports to continue.`,
        true
      );
      return;
    }

    selectedSports = checkedSports;
    showSetupMessage('Loading team lists…');
    renderTeamSelection().catch((error) => {
      console.error(error);
      showSetupMessage('We could not load team data right now. Please try again shortly.', true);
    });
  });

  teamsForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const selections = collectTeamSelections();

    if (!selections.valid) {
      showSetupMessage(selections.message, true);
      return;
    }

    selectedTeamsBySport = selections.teamsBySport;
    persistPreferences();
    showDashboard();
  });

  refreshButton.addEventListener('click', () => {
    refreshDashboard();
  });

  editPreferencesButton.addEventListener('click', () => {
    stopAutoRefresh();
    setupView.classList.remove('hidden');
    dashboardView.classList.add('hidden');
    showSetupMessage('Update your selections and start tracking again when ready.');
    hydratePreferences({ autoLaunch: false });
  });

  backButton.addEventListener('click', () => {
    teamsStep.classList.add('hidden');
    sportsForm.closest('.setup-step').classList.remove('hidden');
    showSetupMessage('Adjust your sports selections.');
  });
}

function hydratePreferences({ autoLaunch } = { autoLaunch: true }) {
  const storedSports = safeJsonParse(localStorage.getItem('sportsbase:selectedSports'));
  const storedTeams = safeJsonParse(localStorage.getItem('sportsbase:selectedTeams'));

  sportsOptionsContainer
    .querySelectorAll('input[type="checkbox"]')
    .forEach((input) => {
      input.checked = false;
      input.closest('.card-option').classList.remove('selected', 'disabled');
      input.disabled = false;
    });

  if (Array.isArray(storedSports) && storedSports.length) {
    selectedSports = storedSports.filter((sportId) => SPORTS_CATALOG.some((s) => s.id === sportId));
    selectedTeamsBySport = storedTeams && typeof storedTeams === 'object' ? storedTeams : {};

    selectedSports.forEach((sportId) => {
      const option = sportsOptionsContainer.querySelector(`input[value="${sportId}"]`);
      if (option) {
        option.checked = true;
        option.closest('.card-option').classList.add('selected');
      }
    });

    enforceSportLimit();

    if (autoLaunch) {
      showDashboard();
    }
  } else {
    selectedSports = [];
    selectedTeamsBySport = {};
  }
}

function renderSportsOptions() {
  sportsOptionsContainer.innerHTML = '';

  SPORTS_CATALOG.forEach((sport) => {
    const card = document.createElement('label');
    card.className = 'card-option';
    card.dataset.sportId = sport.id;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = sport.id;
    checkbox.name = 'sports';

    const title = document.createElement('h4');
    title.textContent = sport.name;

    const description = document.createElement('p');
    description.textContent = sport.description;

    card.appendChild(checkbox);
    card.appendChild(title);
    card.appendChild(description);

    checkbox.addEventListener('change', () => {
      card.classList.toggle('selected', checkbox.checked);
      enforceSportLimit();
    });

    sportsOptionsContainer.appendChild(card);
  });
}

function enforceSportLimit() {
  const checkedBoxes = sportsOptionsContainer.querySelectorAll('input[type="checkbox"]:checked');
  const uncheckedBoxes = sportsOptionsContainer.querySelectorAll('input[type="checkbox"]:not(:checked)');

  if (checkedBoxes.length >= MAX_SPORTS) {
    uncheckedBoxes.forEach((box) => {
      box.disabled = true;
      box.closest('.card-option').classList.add('disabled');
    });
  } else {
    uncheckedBoxes.forEach((box) => {
      box.disabled = false;
      box.closest('.card-option').classList.remove('disabled');
    });
  }
}

async function renderTeamSelection() {
  teamsSelectionsContainer.innerHTML = '';
  teamsStep.classList.remove('hidden');
  sportsForm.closest('.setup-step').classList.add('hidden');

  for (const sportId of selectedSports) {
    const sport = SPORTS_CATALOG.find((item) => item.id === sportId);
    if (!sport) continue;

    const group = document.createElement('section');
    group.className = 'team-group';

    const heading = document.createElement('h4');
    heading.textContent = sport.name;

    const helper = document.createElement('p');
    helper.textContent = `Choose between ${MIN_TEAMS_PER_SPORT} and ${MAX_TEAMS_PER_SPORT} teams.`;

    const optionsContainer = document.createElement('div');
    optionsContainer.className = 'team-options';
    optionsContainer.dataset.sportId = sportId;

    group.appendChild(heading);
    group.appendChild(helper);
    group.appendChild(optionsContainer);
    teamsSelectionsContainer.appendChild(group);

    try {
      const teams = await getTeamsForSport(sport);
      teams
        .sort((a, b) => a.name.localeCompare(b.name))
        .forEach((team) => {
          const label = document.createElement('label');
          label.className = 'team-checkbox';

          const checkbox = document.createElement('input');
          checkbox.type = 'checkbox';
          checkbox.name = `teams-${sportId}`;
          checkbox.value = team.id;

          const name = document.createElement('span');
          name.textContent = team.name;

          const subtitle = document.createElement('span');
          subtitle.className = 'muted';
          subtitle.textContent = team.location || team.abbreviation || '';

          label.appendChild(checkbox);
          label.appendChild(name);
          label.appendChild(subtitle);

          optionsContainer.appendChild(label);

          checkbox.addEventListener('change', () => {
            enforceTeamLimit(optionsContainer, sportId);
          });

          if (selectedTeamsBySport[sportId]?.includes(team.id)) {
            checkbox.checked = true;
          }
        });

      enforceTeamLimit(optionsContainer, sportId);
    } catch (error) {
      console.error(error);
      optionsContainer.innerHTML =
        '<p class="feedback error">We could not load teams for this sport right now.</p>';
    }
  }

  showSetupMessage('Team lists loaded. Pick your clubs and get tracking!');
}

function enforceTeamLimit(optionsContainer, sportId) {
  const checked = optionsContainer.querySelectorAll('input[type="checkbox"]:checked');
  const unchecked = optionsContainer.querySelectorAll('input[type="checkbox"]:not(:checked)');

  if (checked.length >= MAX_TEAMS_PER_SPORT) {
    unchecked.forEach((box) => {
      box.disabled = true;
      box.closest('label').classList.add('disabled');
    });
  } else {
    unchecked.forEach((box) => {
      box.disabled = false;
      box.closest('label').classList.remove('disabled');
    });
  }
}

function collectTeamSelections() {
  const teamsBySport = {};

  for (const sportId of selectedSports) {
    const boxes = teamsSelectionsContainer.querySelectorAll(
      `input[name="teams-${sportId}"]:checked`
    );

    if (boxes.length < MIN_TEAMS_PER_SPORT || boxes.length > MAX_TEAMS_PER_SPORT) {
      return {
        valid: false,
        message: `Please select between ${MIN_TEAMS_PER_SPORT} and ${MAX_TEAMS_PER_SPORT} teams for ${getSportName(
          sportId
        )}.`,
      };
    }

    teamsBySport[sportId] = Array.from(boxes).map((box) => box.value);
  }

  return { valid: true, teamsBySport };
}

async function showDashboard() {
  setupView.classList.add('hidden');
  dashboardView.classList.remove('hidden');
  dashboardFeedback.textContent = '';
  lastUpdatedElement.textContent = 'Refreshing…';

  stopAutoRefresh();
  await refreshDashboard();
  startAutoRefresh();
}

async function refreshDashboard() {
  if (!selectedSports.length) {
    dashboardFeedback.textContent = 'Choose at least one sport to see live scores.';
    return;
  }

  if (isRefreshing) {
    return;
  }

  isRefreshing = true;
  refreshButton.disabled = true;
  dashboardFeedback.textContent = '';
  scoreboardContainer.innerHTML = '';

  const results = await Promise.allSettled(
    selectedSports.map((sportId) => buildSportSection(sportId))
  );

  const failedSports = [];
  results.forEach((result, index) => {
    const sportId = selectedSports[index];
    if (result.status === 'fulfilled' && result.value) {
      scoreboardContainer.appendChild(result.value);
    } else if (result.status === 'rejected') {
      console.error(`Failed to build section for ${getSportName(sportId)}`, result.reason);
      failedSports.push(getSportName(sportId));
    }
  });

  if (failedSports.length) {
    dashboardFeedback.textContent = `We had trouble loading scoreboards for ${failedSports.join(
      ', '
    )}. Please try refreshing.`;
  } else if (!scoreboardContainer.children.length) {
    dashboardFeedback.textContent =
      'None of your tracked teams have games today. Check back later or refresh again soon!';
  }

  if (failedSports.length === selectedSports.length && failedSports.length > 0) {
    lastUpdatedElement.textContent = 'Last update failed';
  } else {
    lastUpdatedElement.textContent = `Updated ${new Date().toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    })}`;
  }

  isRefreshing = false;
  refreshButton.disabled = false;
}

function startAutoRefresh() {
  stopAutoRefresh();
  if (!selectedSports.length) return;
  refreshTimerId = setInterval(() => {
    refreshDashboard();
  }, REFRESH_INTERVAL_MS);
}

function stopAutoRefresh() {
  if (refreshTimerId) {
    clearInterval(refreshTimerId);
    refreshTimerId = undefined;
  }
}

async function buildSportSection(sportId) {
  const sport = SPORTS_CATALOG.find((item) => item.id === sportId);
  if (!sport) return null;

  const [teams, scoreboard] = await Promise.all([
    getTeamsForSport(sport),
    getScoreboardForSport(sport),
  ]);

  const teamIndex = new Map(teams.map((team) => [team.id, team]));
  const trackedTeamIds = Array.isArray(selectedTeamsBySport[sportId])
    ? selectedTeamsBySport[sportId]
    : [];

  const section = document.createElement('section');
  section.className = 'sport-section';

  const sectionHeader = document.createElement('header');
  const title = document.createElement('h3');
  title.textContent = sport.name;
  const summary = document.createElement('p');
  summary.className = 'muted';
  summary.textContent = `${trackedTeamIds.length} team${trackedTeamIds.length !== 1 ? 's' : ''} tracked`;

  sectionHeader.appendChild(title);
  sectionHeader.appendChild(summary);

  const teamCards = document.createElement('div');
  teamCards.className = 'team-cards';

  trackedTeamIds.forEach((teamId) => {
    const team = teamIndex.get(teamId);
    if (!team) return;

    const teamCard = renderTeamCard(team, scoreboard.events || []);
    teamCards.appendChild(teamCard);
  });

  section.appendChild(sectionHeader);
  section.appendChild(teamCards);
  return section;
}

function renderTeamCard(team, events) {
  const template = teamTemplate.content.cloneNode(true);
  const card = template.querySelector('.team-card');
  card.dataset.teamId = team.id;

  const logoElement = template.querySelector('.team-logo');
  const nameElement = template.querySelector('.team-name');
  const subtitleElement = template.querySelector('.team-subtitle');
  const eventsContainer = template.querySelector('.team-events');

  nameElement.textContent = team.name;
  subtitleElement.textContent = team.location || team.abbreviation || '';

  if (team.logo) {
    logoElement.src = team.logo;
    logoElement.alt = `${team.name} logo`;
  } else {
    logoElement.remove();
  }

  const teamEvents = events.filter((event) => isTeamInEvent(team.id, event));

  if (!teamEvents.length) {
    const noGames = document.createElement('p');
    noGames.className = 'muted';
    noGames.textContent = 'No games on the board for today.';
    eventsContainer.appendChild(noGames);
    return card;
  }

  teamEvents.forEach((event) => {
    eventsContainer.appendChild(renderEventCard(event, team.id));
  });

  return card;
}

function renderEventCard(event, teamId) {
  const template = eventTemplate.content.cloneNode(true);
  const card = template.querySelector('.event-card');
  const stateElement = template.querySelector('.event-state');
  const timeElement = template.querySelector('.event-time');
  const firstRowLabel = template.querySelector('.score-row .team-label');
  const firstRowScore = template.querySelector('.score-row .team-score');
  const secondRow = template.querySelector('.score-row.opponent');
  const secondRowLabel = secondRow.querySelector('.team-label');
  const secondRowScore = secondRow.querySelector('.team-score');
  const detailElement = template.querySelector('.event-detail');

  const competition = event.competitions?.[0];
  const status = event.status?.type || {};
  const teamCompetitor = competition?.competitors?.find((competitor) => competitor.team?.id === teamId);
  const opponentCompetitor = competition?.competitors?.find((competitor) => competitor.team?.id !== teamId);

  const state = status.state || 'pre';
  card.classList.add(getStateClass(state));

  stateElement.textContent = status.shortDetail || status.detail || status.description || 'Scheduled';
  timeElement.textContent = formatEventTime(event, status);

  firstRowLabel.textContent = teamCompetitor?.team?.displayName || teamCompetitor?.team?.shortDisplayName || 'TBD';
  firstRowScore.textContent = teamCompetitor?.score ?? '—';
  if (teamCompetitor?.winner) {
    firstRowLabel.classList.add('winner');
  }

  secondRowLabel.textContent =
    opponentCompetitor?.team?.displayName || opponentCompetitor?.team?.shortDisplayName || 'TBD';
  secondRowScore.textContent = opponentCompetitor?.score ?? '—';
  if (opponentCompetitor?.winner) {
    secondRowLabel.classList.add('winner');
  }

  const detailParts = [];
  const venue = competition?.venue?.fullName;
  if (venue) detailParts.push(venue);
  const broadcast = competition?.broadcasts?.[0]?.media?.shortName || competition?.broadcasts?.[0]?.names?.[0];
  if (broadcast) detailParts.push(`Broadcast: ${broadcast}`);
  const seriesText = event.series?.summary;
  if (seriesText) detailParts.push(seriesText);
  detailElement.textContent = detailParts.join(' • ');

  return card;
}

function formatEventTime(event, status) {
  if (status.state === 'pre' || status.state === 'postponed') {
    return new Date(event.date).toLocaleString([], {
      hour: 'numeric',
      minute: '2-digit',
      month: 'short',
      day: 'numeric',
    });
  }

  if (status.state === 'in') {
    return 'Live';
  }

  if (status.state === 'post') {
    return 'Final';
  }

  return status.detail || '';
}

function getStateClass(state) {
  if (state === 'in') return 'live';
  if (state === 'post') return 'final';
  return 'upcoming';
}

function isTeamInEvent(teamId, event) {
  const competitors = event.competitions?.[0]?.competitors || [];
  return competitors.some((competitor) => competitor.team?.id === teamId);
}

async function getTeamsForSport(sport) {
  if (teamCache.has(sport.id)) {
    return teamCache.get(sport.id);
  }

  const response = await fetch(sport.teamsUrl);
  if (!response.ok) {
    throw new Error(`Failed to load teams for ${sport.name}`);
  }

  const data = await response.json();
  const teams = data.sports?.[0]?.leagues?.[0]?.teams?.map((item) => ({
    id: item.team?.id,
    name: item.team?.displayName,
    shortName: item.team?.shortDisplayName,
    location: item.team?.location,
    abbreviation: item.team?.abbreviation,
    logo: item.team?.logos?.[0]?.href,
  }));

  if (!Array.isArray(teams)) {
    throw new Error(`Unexpected team payload for ${sport.name}`);
  }

  teamCache.set(sport.id, teams);
  return teams;
}

async function getScoreboardForSport(sport) {
  const response = await fetch(`${sport.scoreboardUrl}?limit=900`);
  if (!response.ok) {
    throw new Error(`Failed to load scoreboard for ${sport.name}`);
  }
  return response.json();
}

function persistPreferences() {
  localStorage.setItem('sportsbase:selectedSports', JSON.stringify(selectedSports));
  localStorage.setItem('sportsbase:selectedTeams', JSON.stringify(selectedTeamsBySport));
}

function safeJsonParse(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch (error) {
    console.warn('Failed to parse stored JSON value', error);
    return null;
  }
}

function getSportName(sportId) {
  return SPORTS_CATALOG.find((sport) => sport.id === sportId)?.name || 'this sport';
}

function showSetupMessage(message, isError = false) {
  setupFeedback.textContent = message;
  setupFeedback.classList.toggle('error', Boolean(isError));
}
