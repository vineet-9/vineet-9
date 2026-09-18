import fs from "fs";

const token = process.env.GITHUB_TOKEN;
const username = process.env.USERNAME;

if (!token || !username) {
  throw new Error("GITHUB_TOKEN and USERNAME are required.");
}

// ------------------------------------------------------------
// Date range: last 30 days
// ------------------------------------------------------------

const today = new Date();

const endDate = new Date(today);
endDate.setUTCHours(23, 59, 59, 999);

const startDate = new Date(today);
startDate.setUTCDate(startDate.getUTCDate() - 29);
startDate.setUTCHours(0, 0, 0, 0);

const from = startDate.toISOString();
const to = endDate.toISOString();

// ------------------------------------------------------------
// GitHub GraphQL query
// ------------------------------------------------------------

const query = `
query($login: String!, $from: DateTime!, $to: DateTime!) {
  user(login: $login) {
    contributionsCollection(from: $from, to: $to) {
      totalCommitContributions
      totalIssueContributions
      totalPullRequestContributions
      totalPullRequestReviewContributions

      contributionCalendar {
        totalContributions

        weeks {
          contributionDays {
            date
            contributionCount
            contributionLevel
          }
        }
      }
    }
  }
}
`;

const response = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "User-Agent": "github-30-day-contribution-graph"
  },
  body: JSON.stringify({
    query,
    variables: {
      login: username,
      from,
      to
    }
  })
});

const result = await response.json();

if (!response.ok || result.errors) {
  console.error(JSON.stringify(result, null, 2));
  throw new Error("GitHub GraphQL request failed.");
}

const calendar =
  result.data.user.contributionsCollection.contributionCalendar;

// ------------------------------------------------------------
// Flatten contribution days
// ------------------------------------------------------------

const days = [];

for (const week of calendar.weeks) {
  for (const day of week.contributionDays) {
    days.push(day);
  }
}

const last30Days = days
  .sort((a, b) => a.date.localeCompare(b.date))
  .slice(-30);

console.log(
  `Generating graph from ${last30Days[0]?.date} to ${
    last30Days[last30Days.length - 1]?.date
  }`
);

console.log(`Total contributions: ${calendar.totalContributions}`);

// ------------------------------------------------------------
// Contribution colors
// ------------------------------------------------------------

const colors = {
  NONE: "#161b22",
  FIRST_QUARTILE: "#0e4429",
  SECOND_QUARTILE: "#006d32",
  THIRD_QUARTILE: "#26a641",
  FOURTH_QUARTILE: "#39d353"
};

// ------------------------------------------------------------
// SVG configuration
// ------------------------------------------------------------

const cellWidth = 34;
const cellHeight = 24;
const depth = 9;

const columns = 6;
const rows = 5;

const graphWidth = columns * cellWidth + 180;
const graphHeight = rows * cellHeight + 180;

// ------------------------------------------------------------
// Isometric projection
// ------------------------------------------------------------

function project(x, y, z = 0) {
  return {
    x: 90 + x * cellWidth + y * 12,
    y: 55 + y * cellHeight - x * 8 - z
  };
}

// ------------------------------------------------------------
// Draw a 3D cube
// ------------------------------------------------------------

function cube(x, y, color, count) {
  const p = project(x, y, 0);

  const height = Math.min(65, 12 + count * 7);

  const top = project(x, y, height);

  const right = {
    x: p.x + cellWidth,
    y: p.y
  };

  const rightTop = {
    x: top.x + cellWidth,
    y: top.y
  };

  const bottomRight = {
    x: right.x,
    y: right.y + cellHeight
  };

  const bottomLeft = {
    x: p.x,
    y: p.y + cellHeight
  };

  return `
    <!-- contribution: ${count} -->

    <polygon
      points="
        ${top.x},${top.y}
        ${rightTop.x},${rightTop.y}
        ${right.x},${right.y}
        ${p.x},${p.y}
      "
      fill="${color}"
      opacity="1"
    />

    <polygon
      points="
        ${rightTop.x},${rightTop.y}
        ${right.x},${right.y}
        ${bottomRight.x},${bottomRight.y}
        ${rightTop.x},${rightTop.y + height}
      "
      fill="#16833d"
      opacity="0.9"
    />

    <polygon
      points="
        ${top.x},${top.y}
        ${p.x},${p.y}
        ${bottomLeft.x},${bottomLeft.y}
        ${top.x},${top.y + height}
      "
      fill="#0b5428"
      opacity="0.9"
    />

    <rect
      x="${top.x}"
      y="${top.y}"
      width="${cellWidth}"
      height="${cellHeight}"
      fill="${color}"
      rx="3"
    />
  `;
}

// ------------------------------------------------------------
// Generate cubes
// ------------------------------------------------------------

let cubes = "";

last30Days.forEach((day, index) => {
  const column = Math.floor(index / rows);
  const row = index % rows;

  cubes += cube(
    column,
    row,
    colors[day.contributionLevel] || colors.NONE,
    day.contributionCount
  );
});

// ------------------------------------------------------------
// Summary information
// ------------------------------------------------------------

const total = last30Days.reduce(
  (sum, day) => sum + day.contributionCount,
  0
);

const activeDays = last30Days.filter(
  day => day.contributionCount > 0
).length;

const maxDay = Math.max(
  ...last30Days.map(day => day.contributionCount)
);

// ------------------------------------------------------------
// SVG
// ------------------------------------------------------------

const svg = `
<svg
  xmlns="http://www.w3.org/2000/svg"
  viewBox="0 0 ${graphWidth} ${graphHeight}"
  width="100%"
  role="img"
  aria-label="GitHub contributions for the last 30 days"
>

  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#050509"/>
      <stop offset="100%" stop-color="#090a12"/>
    </linearGradient>

    <filter id="glow">
      <feGaussianBlur stdDeviation="2.5" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>

  <rect
    width="100%"
    height="100%"
    rx="20"
    fill="url(#bg)"
  />

  <!-- title -->

  <text
    x="35"
    y="38"
    fill="#39d353"
    font-family="JetBrains Mono, monospace"
    font-size="15"
    font-weight="600"
  >
    LAST 30 DAYS
  </text>

  <text
    x="${graphWidth - 35}"
    y="38"
    text-anchor="end"
    fill="#777"
    font-family="JetBrains Mono, monospace"
    font-size="11"
  >
    ${last30Days[0]?.date || ""} → ${
      last30Days[last30Days.length - 1]?.date || ""
    }
  </text>

  <!-- graph -->

  <g filter="url(#glow)">
    ${cubes}
  </g>

  <!-- statistics -->

  <g
    font-family="JetBrains Mono, monospace"
    font-size="11"
  >

    <text x="35" y="${graphHeight - 65}" fill="#777">
      CONTRIBUTIONS
    </text>

    <text
      x="35"
      y="${graphHeight - 42}"
      fill="#39d353"
      font-size="22"
      font-weight="700"
    >
      ${total}
    </text>

    <text x="150" y="${graphHeight - 65}" fill="#777">
      ACTIVE DAYS
    </text>

    <text
      x="150"
      y="${graphHeight - 42}"
      fill="#39d353"
      font-size="22"
      font-weight="700"
    >
      ${activeDays}
    </text>

    <text x="265" y="${graphHeight - 65}" fill="#777">
      PEAK DAY
    </text>

    <text
      x="265"
      y="${graphHeight - 42}"
      fill="#39d353"
      font-size="22"
      font-weight="700"
    >
      ${maxDay}
    </text>

  </g>

</svg>
`;

const output = "profile-3d-contrib/profile-night-green.svg";

fs.mkdirSync("profile-3d-contrib", {
  recursive: true
});

fs.writeFileSync(output, svg);

console.log(`Generated ${output}`);
