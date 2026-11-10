import type { Ref } from "react";
import { KNOWN_SKILLS, type Maker } from "../catalog";
import { MARKS, type Mark } from "./marks";

function Logo({ mark }: { mark: Mark }) {
  return (
    <svg className="logo" viewBox={mark.viewBox} fill="currentColor" aria-hidden="true">
      {mark.paths.map((d) => (
        <path key={d.slice(0, 24)} d={d} />
      ))}
    </svg>
  );
}

/** Each maker's own logo. Google's and Meta's have their own colours, so they are image files. */
export function MakerLogo({ maker }: { maker: Maker }) {
  if (maker === "google" || maker === "meta") return <img className="logo" src={`logos/${maker}.svg`} alt="" />;
  if (maker !== "other") return <Logo mark={MARKS[maker]} />;
  return (
    <svg className="logo" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <circle cx="8" cy="8" r="5.25" />
    </svg>
  );
}

export const GitHubLogo = () => <Logo mark={MARKS.github} />;

/** A skill's own logo where its project has one, GitHub's otherwise. */
export function SkillLogo({ skill }: { skill: { name: string; repo: string } }) {
  const icon = KNOWN_SKILLS.find((known) => known.name === skill.name && known.repo === skill.repo)?.icon;
  return icon ? <img src={icon} alt="" width="14" height="16" /> : <GitHubLogo />;
}

const ICONS = {
  up: "M8 13V3M4 7l4-4 4 4",
  close: "M4 4l8 8M12 4l-8 8",
  plus: "M8 3v10M3 8h10",
  minus: "M3 8h10",
  info: "M8 7.25v3.5M8 5.1v.15M14 8A6 6 0 1 1 2 8a6 6 0 0 1 12 0Z",
  lock: "M5.5 7V5a2.5 2.5 0 0 1 5 0v2M4 7h8v6H4z",
  check: "M3.5 8.5l3 3 6-7",
  chevron: "M4 6l4 4 4-4",
} as const;

export function Icon({ name }: { name: keyof typeof ICONS }) {
  return (
    <svg
      className="icon"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={ICONS[name]} />
    </svg>
  );
}

/** The work item that travels the line, which doubles as the site's mascot. Its eyes look the way it goes. */
export const Mascot = ({ eyes }: { eyes?: Ref<SVGGElement> }) => (
  <svg className="mascot" viewBox="0 0 28 14" aria-hidden="true">
    <rect width="28" height="14" rx="7" fill="currentColor" />
    <g className="eyes" ref={eyes} fill="var(--page)">
      <circle cx="17.5" cy="6.5" r="1.5" />
      <circle cx="22.5" cy="6.5" r="1.5" />
    </g>
  </svg>
);

export const PlayIcon = () => (
  <svg className="icon" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M4.5 2.75v10.5L13 8z" />
  </svg>
);
